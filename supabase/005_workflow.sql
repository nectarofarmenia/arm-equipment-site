-- ArmEquipment — monthly approval workflow (run once, after 004_email.sql)
-- Month end: all Hilton invoices of the month go to the hotel manager (English) for approval.
-- Her reply: approval and/or corrected invoices → invoices updated → sent to the accountant (Armenian).

alter table public.outbox drop constraint if exists outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check check (kind in ('notify','invoice','summary','workflow'));

create table if not exists public.approval_runs (
  id            bigserial primary key,
  client        text not null,
  month         text not null check (month ~ '^\d{4}-\d{2}$'),
  status        text not null default 'sent_to_manager'
                check (status in ('sent_to_manager','needs_review','sent_to_accountant')),
  thread_id     text,
  invoice_count integer not null default 0,
  total         bigint not null default 0,
  reply_text    text not null default '',
  log           text not null default '',
  sent_at       timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client, month)
);
alter table public.approval_runs enable row level security;
drop policy if exists approval_runs_admin on public.approval_runs;
create policy approval_runs_admin on public.approval_runs for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.approval_runs from anon;
grant select, update, delete on public.approval_runs to authenticated;

-- people (only fills empty fields, never overwrites what you typed on the site)
update public.settings set value = value
  || jsonb_build_object('managerName',     coalesce(nullif(value->>'managerName',''),     'Emma Karapetyan'))
  || jsonb_build_object('managerEmail',    coalesce(nullif(value->>'managerEmail',''),    'Emma.Karapetyan@hilton.com'))
  || jsonb_build_object('accountantName',  coalesce(nullif(value->>'accountantName',''),  'Հասմիկ Ավագյան'))
  || jsonb_build_object('accountantEmail', coalesce(nullif(value->>'accountantEmail',''), 'yerevan@hhg.am'))
  || jsonb_build_object('signerEn',        coalesce(nullif(value->>'signerEn',''),        'Armen Sargsyan'))
  || jsonb_build_object('signer',          coalesce(nullif(value->>'signer',''),          'Արմեն Սարգսյան'))
  || jsonb_build_object('workflowClient',  coalesce(nullif(value->>'workflowClient',''),  'Hilton'))
  || jsonb_build_object('monthEndAuto',    coalesce(value->'monthEndAuto', 'true'::jsonb))
  || jsonb_build_object('accountantAuto',  coalesce(value->'accountantAuto', 'true'::jsonb))
where key = 'invoice_template';
insert into public.settings (key, value) values ('invoice_template', '{"client":"","signer":"Արմեն Սարգսյան","signerEn":"Armen Sargsyan","managerName":"Emma Karapetyan","managerEmail":"Emma.Karapetyan@hilton.com","accountantName":"Հասմիկ Ավագյան","accountantEmail":"yerevan@hhg.am","workflowClient":"Hilton","monthEndAuto":true,"accountantAuto":true}')
on conflict (key) do nothing;

-- ========== robot functions ==========

create or replace function public.bot_settings(secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  return public.email_cfg()
    || jsonb_build_object('clients', (select coalesce(jsonb_agg(distinct client), '[]') from public.invoices))
    || jsonb_build_object('tpl', coalesce((select value from public.settings where key = 'invoice_template'), '{}'))
    || jsonb_build_object('runs', (select coalesce(jsonb_agg(r), '[]') from public.approval_runs r where status = 'sent_to_manager'));
end $$;

-- invoices of one organization and month (or a list of ids)
create or replace function public.bot_invoices(secret text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  return (select coalesce(jsonb_agg(to_jsonb(i) order by i.start_date, i.num), '[]') from public.invoices i
          where (p ? 'ids' and i.id in (select (x)::bigint from jsonb_array_elements_text(p->'ids') x))
             or (not p ? 'ids' and i.client = p->>'client'
                 and coalesce(i.month, to_char(coalesce(i.end_date, i.start_date), 'YYYY-MM')) = p->>'month'));
end $$;

create or replace function public.bot_set_status(secret text, ids jsonb, new_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  if new_status not in ('draft','manager','approved','accountant') then raise exception 'bad_status'; end if;
  update public.invoices set status = new_status, updated_at = now()
  where id in (select (x)::bigint from jsonb_array_elements_text(ids) x) and status <> new_status;
end $$;

create or replace function public.bot_run(secret text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  insert into public.approval_runs (client, month, status, thread_id, invoice_count, total, reply_text, log)
  values (p->>'client', p->>'month', p->>'status', p->>'thread_id', coalesce((p->>'invoice_count')::int,0),
          coalesce((p->>'total')::bigint,0), coalesce(p->>'reply_text',''),
          case when coalesce(p->>'log','') <> '' then to_char(now() at time zone 'Asia/Yerevan','DD.MM HH24:MI') || ' ' || (p->>'log') || E'\n' else '' end)
  on conflict (client, month) do update set
    status = excluded.status,
    thread_id = coalesce(excluded.thread_id, approval_runs.thread_id),
    invoice_count = case when excluded.invoice_count > 0 then excluded.invoice_count else approval_runs.invoice_count end,
    total = case when excluded.total > 0 then excluded.total else approval_runs.total end,
    reply_text = case when excluded.reply_text <> '' then left(excluded.reply_text, 4000) else approval_runs.reply_text end,
    log = left(approval_runs.log || case when excluded.log <> '' then to_char(now() at time zone 'Asia/Yerevan','DD.MM HH24:MI') || ' ' || excluded.log || E'\n' else '' end, 8000),
    updated_at = now();
end $$;

-- invoice from Gmail: add a new one, or update an existing one when its lines changed
create or replace function public.bot_add_invoice(secret text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare m text := p->>'month'; c text := coalesce(nullif(p->>'client',''), 'Այլ'); cur public.invoices%rowtype;
        old_total numeric; new_total numeric;
begin
  perform public.bot_check(secret);
  if coalesce(p->>'gmail_id','') = '' then raise exception 'gmail_id_required'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'lines_required'; end if;
  if exists (select 1 from public.invoices where gmail_id = p->>'gmail_id') then return 'exists'; end if;
  select * into cur from public.invoices where client = c and num = p->>'num'
     and coalesce(month, to_char(coalesce(end_date, start_date), 'YYYY-MM')) = m order by id desc limit 1;
  if found then
    if cur.lines = p->'lines' then return 'same'; end if;
    if cur.status = 'accountant' and coalesce(p->>'force','') <> 'yes' then
      perform public.queue_notify('Ուշադրություն՝ փոփոխված հաշիվ #' || cur.num || ' (' || c || ', ' || m || ')',
        'Gmail-ում եկել է հաշիվ #' || cur.num || '-ի նոր տարբերակ, բայց այն արդեն ուղարկված է հաշվապահին, ուստի չեմ փոխել։' || E'\n' || coalesce(p->>'note',''));
      return 'locked';
    end if;
    select sum((l->>'price')::numeric*(l->>'qty')::numeric) into old_total from jsonb_array_elements(cur.lines) l;
    select sum((l->>'price')::numeric*(l->>'qty')::numeric) into new_total from jsonb_array_elements(p->'lines') l;
    update public.invoices set lines = p->'lines',
      start_date = coalesce(nullif(p->>'start_date','')::date, start_date), end_date = coalesce(nullif(p->>'end_date','')::date, end_date),
      note = left(note || E'\n' || 'Փոփոխված՝ ' || coalesce(p->>'note','Gmail') || ' (' || old_total || ' → ' || new_total || ' դր.)', 2000),
      updated_at = now()
    where id = cur.id;
    if coalesce(p->>'quiet','') <> 'yes' then
      perform public.queue_notify('Հաշիվ #' || cur.num || ' փոխվեց — ' || c || ' — ' || old_total || ' → ' || new_total || ' դր.',
        'Gmail-ից եկած նոր տարբերակով թարմացրել եմ հաշիվ #' || cur.num || '-ը (' || c || ', ' || m || ')։' || E'\n' ||
        'Նախկին գումար՝ ' || old_total || ' դր., նոր գումար՝ ' || new_total || ' դր.' || E'\n' || coalesce(p->>'note',''));
    end if;
    return 'updated';
  end if;
  insert into public.invoices (num, client, start_date, end_date, month, lines, shares, status, note, gmail_id)
  values (left(coalesce(p->>'num','?'),20), left(c,120), nullif(p->>'start_date','')::date, nullif(p->>'end_date','')::date, m,
          p->'lines', coalesce((select value from public.settings where key = 'shares'), '[]'),
          case when p->>'status' in ('draft','manager','approved','accountant') then p->>'status' else 'draft' end,
          left(coalesce(p->>'note',''),1000), p->>'gmail_id');
  if coalesce(p->>'quiet','') <> 'yes' then
    perform public.queue_notify('Նոր հաշիվ Gmail-ից — #' || coalesce(p->>'num','?') || ' — ' || c,
      'Ավելացրել եմ կայքում՝ հաշիվ #' || coalesce(p->>'num','?') || ' (' || c || ', ' || coalesce(m,'') || ')։' || E'\n' || coalesce(p->>'note',''));
  end if;
  return 'added';
end $$;

revoke all on function public.bot_invoices(text,jsonb), public.bot_set_status(text,jsonb,text), public.bot_run(text,jsonb) from public;
grant execute on function public.bot_invoices(text,jsonb), public.bot_set_status(text,jsonb,text), public.bot_run(text,jsonb),
                          public.bot_settings(text), public.bot_add_invoice(text,jsonb) to anon, authenticated;
