-- ArmEquipment (Berry Line LLC) — client portal database
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- ========== Tables ==========

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  org         text not null default '',
  phone       text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.equipment (
  id        serial primary key,
  code      text unique,
  name_hy   text not null,
  name_en   text not null,
  price     integer check (price is null or price >= 0),   -- AMD per unit; null = price on request
  active    boolean not null default true,
  sort      integer not null default 100
);

create table if not exists public.orders (
  id          bigserial primary key,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  start_date  date not null,
  end_date    date,
  city        text not null default '',
  venue       text not null default '',
  event_type  text not null default '',
  guests      integer check (guests is null or guests >= 0),
  speakers    integer check (speakers is null or speakers >= 0),
  languages   text not null default '',
  layout      text not null default '',
  notes       text not null default '',
  total       integer not null default 0,          -- estimate from the price list
  final_total integer,                             -- set by admin when confirming
  has_unpriced boolean not null default false,     -- some items are "price on request"
  status      text not null default 'new' check (status in ('new','confirmed','done','cancelled')),
  admin_note  text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.order_items (
  id            bigserial primary key,
  order_id      bigint not null references public.orders(id) on delete cascade,
  equipment_id  integer references public.equipment(id) on delete set null,
  name_hy       text not null,
  name_en       text not null,
  price         integer,
  qty           integer not null check (qty > 0 and qty <= 5000)
);

create index if not exists orders_client_idx on public.orders(client_id);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ========== Helper functions ==========

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' or is_admin from public.profiles where id = auth.uid()), false);
$$;

-- New sign-up -> profile row (pending until the admin approves)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, org, phone)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data->>'org', ''), 160),
    left(coalesce(new.raw_user_meta_data->>'phone', ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== Row level security ==========

alter table public.profiles    enable row level security;
alter table public.equipment   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- profiles: each person sees their own; admin sees everyone
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- clients may edit only their contact fields (column grants below stop status/is_admin changes)
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, org, phone) on public.profiles to authenticated;

-- equipment: approved clients and admin read; only admin changes
drop policy if exists equipment_select on public.equipment;
create policy equipment_select on public.equipment for select
  using (public.is_approved());
drop policy if exists equipment_admin on public.equipment;
create policy equipment_admin on public.equipment for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.equipment from anon;
grant select, insert, update, delete on public.equipment to authenticated;
grant usage on sequence public.equipment_id_seq to authenticated;

-- orders: clients read their own; admin reads and updates all; creating goes through place_order()
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (client_id = auth.uid() or public.is_admin());
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists orders_admin_delete on public.orders;
create policy orders_admin_delete on public.orders for delete
  using (public.is_admin());

revoke all on public.orders from anon;
revoke insert on public.orders from authenticated;
grant select, update, delete on public.orders to authenticated;

drop policy if exists items_select on public.order_items;
create policy items_select on public.order_items for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and (o.client_id = auth.uid() or public.is_admin())));

revoke all on public.order_items from anon;
revoke insert, update, delete on public.order_items from authenticated;
grant select on public.order_items to authenticated;

-- ========== Actions (run with checks inside) ==========

-- Client places an order. Prices are always taken from the equipment table, never from the browser.
create or replace function public.place_order(details jsonb, items jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  oid bigint;
  it jsonb;
  eq public.equipment%rowtype;
  q integer;
  n integer := 0;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'not_approved';
  end if;
  if (details->>'start_date') is null then
    raise exception 'start_date_required';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 60 then
    raise exception 'items_required';
  end if;

  insert into public.orders (client_id, start_date, end_date, city, venue, event_type,
                             guests, speakers, languages, layout, notes)
  values (
    auth.uid(),
    (details->>'start_date')::date,
    nullif(details->>'end_date','')::date,
    left(coalesce(details->>'city',''), 120),
    left(coalesce(details->>'venue',''), 200),
    left(coalesce(details->>'event_type',''), 120),
    nullif(details->>'guests','')::integer,
    nullif(details->>'speakers','')::integer,
    left(coalesce(details->>'languages',''), 300),
    left(coalesce(details->>'layout',''), 60),
    left(coalesce(details->>'notes',''), 4000)
  )
  returning id into oid;

  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::integer;
    if q is null or q <= 0 then continue; end if;
    select * into eq from public.equipment where id = (it->>'equipment_id')::integer and active;
    if not found then raise exception 'unknown_equipment'; end if;
    insert into public.order_items (order_id, equipment_id, name_hy, name_en, price, qty)
    values (oid, eq.id, eq.name_hy, eq.name_en, eq.price, least(q, 5000));
    n := n + 1;
  end loop;

  if n = 0 then raise exception 'items_required'; end if;

  update public.orders o set
    total = coalesce((select sum(price * qty) from public.order_items where order_id = oid and price is not null), 0),
    has_unpriced = exists (select 1 from public.order_items where order_id = oid and price is null)
  where o.id = oid;

  return oid;
end $$;

-- Client cancels their own order while it is still new
create or replace function public.cancel_my_order(order_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'cancelled'
  where id = order_id and client_id = auth.uid() and status = 'new';
  if not found then raise exception 'cannot_cancel'; end if;
end $$;

-- Admin approves / rejects a client
create or replace function public.set_client_status(client uuid, new_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if new_status not in ('pending','approved','rejected') then raise exception 'bad_status'; end if;
  update public.profiles set status = new_status where id = client and not is_admin;
end $$;

revoke all on function public.place_order(jsonb, jsonb)        from public, anon;
revoke all on function public.cancel_my_order(bigint)          from public, anon;
revoke all on function public.set_client_status(uuid, text)    from public, anon;
grant execute on function public.place_order(jsonb, jsonb)     to authenticated;
grant execute on function public.cancel_my_order(bigint)       to authenticated;
grant execute on function public.set_client_status(uuid, text) to authenticated;

-- ========== Price list (from the current ArmEquipment price list, AMD per unit) ==========

insert into public.equipment (code, name_hy, name_en, price, sort) values
  ('rx',       'Անլար ընդունիչ ականջակալով',  'Wireless interpretation receiver', 900,   10),
  ('tmic',     'Սեղանի միկրոֆոն',              'Table microphone',                 2800,  20),
  ('wmic',     'Անլար միկրոֆոն',               'Wireless microphone',              5000,  30),
  ('hmic',     'Գլխի միկրոֆոն',                'Head microphone',                  15000, 40),
  ('sound',    'Ձայնային համակարգ',            'Sound system',                     30000, 50),
  ('booth',    'Թարգմանչական խցիկ',            'Interpreter booth',                15000, 60),
  ('proj',     'Պրոյեկտոր',                    'Projector',                        20000, 70),
  ('screen',   'Էկրան (2 մ)',                  'Screen (2 m)',                     10000, 80),
  ('tv',       'Հեռուստացույց (TV)',           'TV screen',                        null,  90),
  ('pc',       'Համակարգիչ (նոութբուք)',       'Computer (laptop)',                null,  100),
  ('rec',      'Ձայնագրություն',               'Audio recording',                  null,  110),
  ('concert',  'Համերգային տեխնիկա',           'Concert equipment',                null,  120),
  ('prompter', 'Սուֆլոր (տելեպրոմպտեր)',       'Teleprompter',                     null,  130),
  ('zoom',     'Zoom կոնֆերանսի անցկացում',    'Zoom conference hosting',          null,  140)
on conflict (code) do nothing;

-- ========== Invoices and partner shares (admin only) ==========

create table if not exists public.invoices (
  id          bigserial primary key,
  num         text not null,
  start_date  date,
  end_date    date,
  month       text check (month is null or month ~ '^\d{4}-\d{2}$'),   -- reporting month YYYY-MM
  lines       jsonb not null default '[]',      -- [{name, price, qty}]
  shares      jsonb not null default '[]',      -- [{name, pct, tax}] frozen at creation
  status      text not null default 'draft' check (status in ('draft','manager','approved','accountant')),
  note        text not null default '',
  order_id    bigint references public.orders(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.settings (
  key    text primary key,
  value  jsonb not null
);

alter table public.invoices enable row level security;
alter table public.settings enable row level security;

drop policy if exists invoices_admin on public.invoices;
create policy invoices_admin on public.invoices for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.invoices from anon;
revoke all on public.settings from anon;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant usage on sequence public.invoices_id_seq to authenticated;

insert into public.settings (key, value) values
  ('shares', '[{"name":"Արմեն","pct":25},{"name":"Հարկ","pct":10,"tax":true},{"name":"Էմմա","pct":20},{"name":"Խաչիկ","pct":45}]'),
  ('invoice_template', '{"client":"","signer":"Արմեն Սարգսյան","managerEmail":"","accountantEmail":""}')
on conflict (key) do nothing;

-- ========== After you sign up on the site with armequipment@gmail.com, run this once ==========
-- update public.profiles set is_admin = true, status = 'approved' where email = 'armequipment@gmail.com';
