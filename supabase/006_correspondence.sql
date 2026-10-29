-- ArmEquipment — correspondence tracking, follow-ups and draft invoices from request emails
-- Run once, after 005_workflow.sql.

-- invoices made automatically from a request email stay "unchecked" until you open and save them
alter table public.invoices add column if not exists checked boolean not null default true;

-- every step of the monthly emails, with dates
alter table public.approval_runs add column if not exists manager_sent_at      timestamptz;
alter table public.approval_runs add column if not exists manager_reply_at     timestamptz;
alter table public.approval_runs add column if not exists manager_last_at      timestamptz;
alter table public.approval_runs add column if not exists manager_followups    integer not null default 0;
alter table public.approval_runs add column if not exists accountant_sent_at   timestamptz;
alter table public.approval_runs add column if not exists accountant_reply_at  timestamptz;
alter table public.approval_runs add column if not exists accountant_last_at   timestamptz;
alter table public.approval_runs add column if not exists accountant_followups integer not null default 0;
alter table public.approval_runs add column if not exists accountant_thread_id text;
alter table public.approval_runs add column if not exists accountant_reply_text text not null default '';
update public.approval_runs set manager_sent_at = coalesce(manager_sent_at, sent_at), manager_last_at = coalesce(manager_last_at, sent_at);

alter table public.approval_runs drop constraint if exists approval_runs_status_check;
alter table public.approval_runs add constraint approval_runs_status_check
  check (status in ('sent_to_manager','needs_review','sent_to_accountant','done'));
grant insert on public.approval_runs to authenticated;
grant usage on sequence public.approval_runs_id_seq to authenticated;

alter table public.outbox drop constraint if exists outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check check (kind in ('notify','invoice','summary','workflow'));

-- follow-up settings (fills only what is missing)
update public.settings set value = value
  || jsonb_build_object('followupDays', coalesce(value->'followupDays', '3'::jsonb))
  || jsonb_build_object('followupMax',  coalesce(value->'followupMax',  '2'::jsonb))
  || jsonb_build_object('requestDomains', coalesce(value->'requestDomains', '"hilton.com"'::jsonb))
where key = 'invoice_template';

-- ========== robot functions ==========

create or replace function public.bot_settings(secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  return public.email_cfg()
    || jsonb_build_object('clients', (select coalesce(jsonb_agg(distinct client), '[]') from public.invoices))
    || jsonb_build_object('tpl', coalesce((select value from public.settings where key = 'invoice_template'), '{}'))
    || jsonb_build_object('runs', (select coalesce(jsonb_agg(r), '[]') from public.approval_runs r
                                   where status in ('sent_to_manager','needs_review','sent_to_accountant')))
    || jsonb_build_object('equipment', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name_en || ' / ' || name_hy, 'price', price) order by sort), '[]')
                                        from public.equipment where active))
    || jsonb_build_object('lastPrices', (select coalesce(jsonb_object_agg(n, p), '{}') from (
          select distinct on (lower(l->>'name')) lower(l->>'name') as n, (l->>'price')::numeric as p
          from public.invoices i, jsonb_array_elements(i.lines) l
          where i.client = 'Hilton' and coalesce((l->>'price')::numeric, 0) > 0 and i.start_date > now() - interval '2 years'
          order by lower(l->>'name'), i.start_date desc) x));
end $$;

-- monthly run: create or update, any field may be given; timestamps as ISO text
create or replace function public.bot_run(secret text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ts text := to_char(now() at time zone 'Asia/Yerevan','DD.MM HH24:MI') || ' ';
begin
  perform public.bot_check(secret);
  insert into public.approval_runs (client, month, status) values (p->>'client', p->>'month', coalesce(p->>'status','sent_to_manager'))
  on conflict (client, month) do nothing;
  update public.approval_runs r set
    status               = coalesce(p->>'status', r.status),
    thread_id            = coalesce(p->>'thread_id', r.thread_id),
    accountant_thread_id = coalesce(p->>'accountant_thread_id', r.accountant_thread_id),
    invoice_count        = coalesce((p->>'invoice_count')::int, r.invoice_count),
    total                = coalesce((p->>'total')::bigint, r.total),
    reply_text           = coalesce(left(p->>'reply_text', 4000), r.reply_text),
    accountant_reply_text= coalesce(left(p->>'accountant_reply_text', 4000), r.accountant_reply_text),
    manager_sent_at      = coalesce((p->>'manager_sent_at')::timestamptz, r.manager_sent_at),
    manager_reply_at     = coalesce((p->>'manager_reply_at')::timestamptz, r.manager_reply_at),
    manager_last_at      = coalesce((p->>'manager_last_at')::timestamptz, r.manager_last_at),
    manager_followups    = coalesce((p->>'manager_followups')::int, r.manager_followups),
    accountant_sent_at   = coalesce((p->>'accountant_sent_at')::timestamptz, r.accountant_sent_at),
    accountant_reply_at  = coalesce((p->>'accountant_reply_at')::timestamptz, r.accountant_reply_at),
    accountant_last_at   = coalesce((p->>'accountant_last_at')::timestamptz, r.accountant_last_at),
    accountant_followups = coalesce((p->>'accountant_followups')::int, r.accountant_followups),
    sent_at              = coalesce((p->>'manager_sent_at')::timestamptz, r.sent_at),
    log = left(r.log || case when coalesce(p->>'log','') <> '' then ts || (p->>'log') || E'\n' else '' end, 8000),
    updated_at = now()
  where r.client = p->>'client' and r.month = p->>'month';
end $$;

-- a request email (Hilton staff) → draft invoice, not yet checked; one per email thread
create or replace function public.bot_add_request(secret text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare gid text := 'req:' || (p->>'thread_id'); c text := coalesce(nullif(p->>'client',''), 'Hilton');
        m text := coalesce(p->>'month', to_char(nullif(p->>'start_date','')::date, 'YYYY-MM')); cur public.invoices%rowtype; n text;
begin
  perform public.bot_check(secret);
  if coalesce(p->>'thread_id','') = '' then raise exception 'thread_id_required'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'lines_required'; end if;
  select * into cur from public.invoices where gmail_id = gid;
  if found then
    if cur.lines = p->'lines' and cur.start_date is not distinct from nullif(p->>'start_date','')::date then return 'same'; end if;
    if cur.checked or cur.status <> 'draft' then
      perform public.queue_notify('Փոփոխված պատվեր՝ հաշիվ #' || cur.num || ' (' || c || ')',
        'Պատվերի նամակում նոր փոփոխություն կա, բայց հաշիվ #' || cur.num || '-ն արդեն ստուգված է, ուստի չեմ փոխել։ Նայեք կայքում։' || E'\n\n' || coalesce(p->>'note',''));
      return 'locked';
    end if;
    update public.invoices set lines = p->'lines',
      start_date = coalesce(nullif(p->>'start_date','')::date, start_date), end_date = coalesce(nullif(p->>'end_date','')::date, end_date),
      month = coalesce(m, month), note = left(coalesce(p->>'note', note), 2000), updated_at = now()
    where id = cur.id;
    return 'updated:' || cur.num;
  end if;
  select lpad((coalesce(max(nullif(regexp_replace(num, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0') into n
    from public.invoices where client = c and coalesce(month, to_char(coalesce(end_date, start_date), 'YYYY-MM')) = m;
  insert into public.invoices (num, client, start_date, end_date, month, lines, shares, status, note, gmail_id, checked)
  values (n, c, nullif(p->>'start_date','')::date, nullif(p->>'end_date','')::date, m, p->'lines',
          coalesce((select value from public.settings where key = 'shares'), '[]'), 'draft', left(coalesce(p->>'note',''), 2000), gid, false);
  return 'added:' || n;
end $$;

revoke all on function public.bot_add_request(text,jsonb) from public;
grant execute on function public.bot_add_request(text,jsonb), public.bot_run(text,jsonb), public.bot_settings(text) to anon, authenticated;
