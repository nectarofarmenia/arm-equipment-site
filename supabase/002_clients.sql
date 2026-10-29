-- 002: organizations (client) on invoices + source file. Run once.
alter table public.invoices add column if not exists client text not null default 'Hilton';
alter table public.invoices add column if not exists source_file text;
create index if not exists invoices_client_idx on public.invoices(client);
insert into public.settings (key, value) values
  ('client_folders', '{"Hilton":"1.1 Hilton"}')
on conflict (key) do nothing;
