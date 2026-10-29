-- ArmEquipment — email link (run once, after schema.sql and 002_clients.sql)
-- Emails are sent from armequipment@gmail.com by a small Google Apps Script robot
-- (gmail-robot/Code.gs). The site only puts messages into the "outbox" table;
-- the robot picks them up every few minutes, sends them and marks them as sent.

-- ========== Tables ==========

create table if not exists public.outbox (
  id          bigserial primary key,
  kind        text not null check (kind in ('notify','invoice','summary')),
  to_addr     text not null,
  cc          text not null default '',
  reply_to    text not null default '',
  subject     text not null,
  body        text not null default '',
  html        text,
  att_name    text,
  att_html    text,
  invoice_id  bigint references public.invoices(id) on delete set null,
  new_status  text check (new_status is null or new_status in ('manager','accountant')),
  status      text not null default 'queued' check (status in ('queued','sent','error')),
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists outbox_status_idx on public.outbox(status);
create index if not exists outbox_invoice_idx on public.outbox(invoice_id);

create table if not exists public.inquiries (
  id          bigserial primary key,
  name        text not null default '',
  org         text not null default '',
  email       text not null default '',
  phone       text not null default '',
  details     text not null default '',
  created_at  timestamptz not null default now()
);

-- one row: the robot's password and when it last checked in
create table if not exists public.bot_config (
  id         integer primary key default 1 check (id = 1),
  secret     text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  last_seen  timestamptz
);
insert into public.bot_config (id) values (1) on conflict (id) do nothing;

alter table public.invoices add column if not exists gmail_id text;
create unique index if not exists invoices_gmail_id_idx on public.invoices(gmail_id) where gmail_id is not null;

insert into public.settings (key, value) values
  ('email', '{"notifyTo":"armequipment@gmail.com","summaryTo":"armequipment@gmail.com","notifyClients":true,"notifyOrders":true,"notifyInquiries":true,"gmailImport":true}')
on conflict (key) do nothing;

-- ========== Access ==========

alter table public.outbox     enable row level security;
alter table public.inquiries  enable row level security;
alter table public.bot_config enable row level security;

drop policy if exists outbox_admin on public.outbox;
create policy outbox_admin on public.outbox for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists inquiries_admin on public.inquiries;
create policy inquiries_admin on public.inquiries for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists bot_config_admin on public.bot_config;
create policy bot_config_admin on public.bot_config for select using (public.is_admin());

revoke all on public.outbox, public.inquiries, public.bot_config from anon;
revoke all on public.bot_config from authenticated;
grant select, insert, update, delete on public.outbox to authenticated;
grant select, delete on public.inquiries to authenticated;
grant select on public.bot_config to authenticated;
grant usage on sequence public.outbox_id_seq to authenticated;

-- ========== Notifications (put into the outbox automatically) ==========

create or replace function public.email_cfg() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = 'email'), '{}'::jsonb);
$$;

create or replace function public.queue_notify(subj text, txt text, reply text default '') returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb := public.email_cfg();
begin
  if coalesce(c->>'notifyTo','') = '' then return; end if;
  insert into public.outbox (kind, to_addr, reply_to, subject, body)
  values ('notify', c->>'notifyTo', coalesce(reply,''), left(subj, 200), left(txt, 20000));
end $$;

create or replace function public.trg_notify_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin or coalesce((public.email_cfg()->>'notifyClients')::boolean, true) = false then return new; end if;
  perform public.queue_notify(
    'Նոր գրանցում — ' || coalesce(nullif(new.org,''), new.email),
    'Կայքում գրանցվել է նոր պատվիրատու և սպասում է հաստատման։' || E'\n\n' ||
    'Անուն: ' || new.full_name || E'\n' || 'Կազմակերպություն: ' || new.org || E'\n' ||
    'Էլ. փոստ: ' || coalesce(new.email,'') || E'\n' || 'Հեռ.: ' || new.phone || E'\n\n' ||
    'Հաստատել՝ https://www.arm-equipment.com/portal',
    coalesce(new.email,''));
  return new;
end $$;
drop trigger if exists notify_new_profile on public.profiles;
create trigger notify_new_profile after insert on public.profiles
  for each row execute function public.trg_notify_profile();

-- runs at the end of the transaction, when the order already has its items and total
create or replace function public.trg_notify_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; p public.profiles%rowtype; items text;
begin
  if coalesce((public.email_cfg()->>'notifyOrders')::boolean, true) = false then return null; end if;
  select * into o from public.orders where id = new.id;
  if not found then return null; end if;
  select * into p from public.profiles where id = o.client_id;
  if tg_op = 'INSERT' then
    select string_agg('• ' || name_hy || ' × ' || qty || coalesce(' — ' || (price*qty)::text || ' դր.', ' — գինը ըստ պահանջի'), E'\n' order by id)
      into items from public.order_items where order_id = o.id;
    perform public.queue_notify(
      'Նոր պատվեր #' || o.id || ' — ' || coalesce(nullif(p.org,''), p.full_name) || ' — ' || to_char(o.start_date,'DD.MM.YYYY'),
      'Պատվիրատու: ' || p.full_name || ' (' || p.org || '), ' || coalesce(p.email,'') || ', ' || p.phone || E'\n' ||
      'Ամսաթիվ: ' || to_char(o.start_date,'DD.MM.YYYY') || coalesce(' – ' || to_char(o.end_date,'DD.MM.YYYY'),'') || E'\n' ||
      'Վայր: ' || o.city || ', ' || o.venue || E'\n' || 'Միջոցառում: ' || o.event_type ||
      coalesce(', ' || o.guests || ' մասնակից','') || coalesce(', ' || o.speakers || ' ելույթ ունեցող','') || E'\n' ||
      'Լեզուներ: ' || o.languages || E'\n\n' || coalesce(items,'') || E'\n\n' ||
      'Ընդամենը (ըստ գնացուցակի): ' || o.total || ' դր.' || case when o.has_unpriced then ' + գինը ըստ պահանջի' else '' end || E'\n' ||
      case when o.notes <> '' then 'Նշումներ: ' || o.notes || E'\n' else '' end ||
      E'\nԴիտել՝ https://www.arm-equipment.com/portal',
      coalesce(p.email,''));
  elsif o.status = 'cancelled' and old.status <> 'cancelled' and not public.is_admin() then
    perform public.queue_notify('Պատվեր #' || o.id || ' չեղարկվեց — ' || coalesce(nullif(p.org,''), p.full_name),
      'Պատվիրատուն չեղարկել է պատվերը #' || o.id || ' (' || to_char(o.start_date,'DD.MM.YYYY') || ').', coalesce(p.email,''));
  end if;
  return null;
end $$;
drop trigger if exists notify_new_order on public.orders;
create constraint trigger notify_new_order after insert on public.orders
  deferrable initially deferred for each row execute function public.trg_notify_order();
drop trigger if exists notify_cancel_order on public.orders;
create trigger notify_cancel_order after update of status on public.orders
  for each row execute function public.trg_notify_order();

create or replace function public.trg_notify_inquiry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((public.email_cfg()->>'notifyInquiries')::boolean, true) = false then return new; end if;
  perform public.queue_notify('Հարցում կայքից — ' || coalesce(nullif(new.org,''), nullif(new.name,''), new.email),
    new.details || E'\n\n— ' || new.name || ', ' || new.org || ', ' || new.email || ', ' || new.phone, new.email);
  return new;
end $$;
drop trigger if exists notify_new_inquiry on public.inquiries;
create trigger notify_new_inquiry after insert on public.inquiries
  for each row execute function public.trg_notify_inquiry();

-- Public site: send a request without opening a mail program
create or replace function public.submit_inquiry(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p->>'website','') <> '' then return; end if;                 -- bots fill the hidden field
  if coalesce(p->>'email','') = '' and coalesce(p->>'phone','') = '' then raise exception 'contact_required'; end if;
  if length(coalesce(p->>'details','')) < 10 then raise exception 'details_required'; end if;
  if (select count(*) from public.inquiries where created_at > now() - interval '1 hour') >= 30 then raise exception 'busy'; end if;
  insert into public.inquiries (name, org, email, phone, details) values (
    left(coalesce(p->>'name',''),120), left(coalesce(p->>'org',''),160), left(coalesce(p->>'email',''),160),
    left(coalesce(p->>'phone',''),40), left(coalesce(p->>'details',''),6000));
end $$;
revoke all on function public.submit_inquiry(jsonb) from public;
grant execute on function public.submit_inquiry(jsonb) to anon, authenticated;

-- ========== Robot functions (need the robot password from bot_config) ==========

create or replace function public.bot_check(secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if secret is null or length(secret) < 32 or not exists (select 1 from public.bot_config where bot_config.secret = bot_check.secret) then
    raise exception 'bad_secret';
  end if;
  update public.bot_config set last_seen = now() where id = 1;
end $$;

create or replace function public.bot_take(secret text) returns setof public.outbox
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  return query select * from public.outbox where status = 'queued' order by id limit 25;
end $$;

create or replace function public.bot_done(secret text, msg_id bigint, ok boolean, err text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m public.outbox%rowtype;
begin
  perform public.bot_check(secret);
  update public.outbox set status = case when ok then 'sent' else 'error' end, error = left(err, 1000),
         sent_at = case when ok then now() end
  where id = msg_id returning * into m;
  if ok and m.invoice_id is not null and m.new_status is not null then
    update public.invoices set status = m.new_status, updated_at = now()
    where id = m.invoice_id and (status = 'draft' or (status = 'manager' and m.new_status = 'accountant')
                                 or (status = 'approved' and m.new_status = 'accountant'));
  end if;
end $$;

create or replace function public.bot_settings(secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_check(secret);
  return public.email_cfg() || jsonb_build_object('clients', (select coalesce(jsonb_agg(distinct client), '[]') from public.invoices));
end $$;

-- totals for one month (YYYY-MM): per organization and per partner
create or replace function public.bot_month_summary(secret text, ym text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.bot_check(secret);
  with inv as (
    select i.*, coalesce((select sum((l->>'price')::numeric * (l->>'qty')::numeric) from jsonb_array_elements(i.lines) l), 0) as total
    from public.invoices i
    where coalesce(i.month, to_char(coalesce(i.end_date, i.start_date), 'YYYY-MM')) = ym
  ), parts as (
    select s->>'name' as name, coalesce((s->>'tax')::boolean, false) as tax, round(inv.total * (s->>'pct')::numeric / 100) as amt
    from inv, jsonb_array_elements(case when jsonb_array_length(inv.shares) > 0 then inv.shares
                                        else (select value from public.settings where key = 'shares') end) s
  )
  select jsonb_build_object(
    'month', ym,
    'count', (select count(*) from inv),
    'total', (select coalesce(sum(total),0) from inv),
    'days',  (select count(distinct d) from inv, generate_series(inv.start_date, coalesce(inv.end_date, inv.start_date), interval '1 day') d where inv.start_date is not null),
    'clients', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (select client, count(*) as count, sum(total) as total from inv group by client) x),
    'people',  (select coalesce(jsonb_agg(x order by x.tax, x.amount desc), '[]') from (select name, bool_or(tax) as tax, sum(amt) as amount from parts group by name) x),
    'invoices',(select coalesce(jsonb_agg(jsonb_build_object('num',num,'client',client,'start',start_date,'end',end_date,'total',total,'status',status) order by start_date, num), '[]') from inv),
    'summaryTo', public.email_cfg()->>'summaryTo'
  ) into res;
  return res;
end $$;

-- invoice found in Gmail (.docx attachment). Skips ones already in the database.
create or replace function public.bot_add_invoice(secret text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare m text := p->>'month'; c text := coalesce(nullif(p->>'client',''), 'Այլ');
begin
  perform public.bot_check(secret);
  if coalesce(p->>'gmail_id','') = '' then raise exception 'gmail_id_required'; end if;
  if exists (select 1 from public.invoices where gmail_id = p->>'gmail_id') then return 'exists'; end if;
  if exists (select 1 from public.invoices where client = c and num = p->>'num'
             and coalesce(month, to_char(coalesce(end_date, start_date), 'YYYY-MM')) = m) then return 'exists'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'lines_required'; end if;
  insert into public.invoices (num, client, start_date, end_date, month, lines, shares, status, note, gmail_id)
  values (left(coalesce(p->>'num','?'),20), left(c,120), nullif(p->>'start_date','')::date, nullif(p->>'end_date','')::date, m,
          p->'lines', coalesce((select value from public.settings where key = 'shares'), '[]'),
          case when p->>'status' in ('draft','manager','approved','accountant') then p->>'status' else 'manager' end,
          left(coalesce(p->>'note',''),1000), p->>'gmail_id');
  return 'added';
end $$;

revoke all on function public.bot_check(text) from public, anon, authenticated;
revoke all on function public.bot_take(text), public.bot_done(text,bigint,boolean,text), public.bot_settings(text),
              public.bot_month_summary(text,text), public.bot_add_invoice(text,jsonb) from public;
grant execute on function public.bot_take(text), public.bot_done(text,bigint,boolean,text), public.bot_settings(text),
              public.bot_month_summary(text,text), public.bot_add_invoice(text,jsonb) to anon, authenticated;
revoke all on function public.queue_notify(text,text,text), public.email_cfg() from public, anon, authenticated;
