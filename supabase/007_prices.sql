-- Price list update (2026-10-31): HD camera added; prices for laptop, recording, Zoom, teleprompter.
insert into public.equipment (code, name_hy, name_en, price, sort)
values ('cam', 'HD տեսախցիկ', 'HD camera', 35000, 105)
on conflict (code) do update set price = excluded.price, active = true;
update public.equipment set price = 10000 where code = 'pc';
update public.equipment set price = 15000 where code = 'rec';
update public.equipment set price = 90000 where code = 'zoom';
update public.equipment set price = 50000 where code = 'prompter';
