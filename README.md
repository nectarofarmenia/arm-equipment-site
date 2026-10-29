# ArmEquipment կայք (arm-equipment.com)

## Ֆայլերը
- `index.html` — հանրային կայքը (Մուտք կոճակը տանում է պորտալ)
- `portal.html` — մուտք, գրանցում, պատվիրատուի էջ, ադմին էջ
- `invoices.js` — ադմինի հաշիվներ, կալենդար, եկամուտ ըստ անձերի
- `config.js` — Supabase-ի հասցեն և բանալին (լրացնել)
- `supabase/schema.sql` — տվյալների բազան և անվտանգության կանոնները
- `supabase/import_invoices.sql` — հին ադմին էջի 8 հաշիվների տեղափոխում

## Տեղադրում (մեկ անգամ)
1. **Supabase** (supabase.com) — New project, անունը՝ `arm-equipment`, տարածաշրջանը՝ Frankfurt։
2. SQL Editor → New query → տեղադրեք `supabase/schema.sql`-ը → Run։ Հետո նույնը `supabase/import_invoices.sql`-ի համար։
3. Authentication → URL Configuration → Site URL՝ `https://arm-equipment.com`, Redirect URLs-ում ավելացրեք `https://arm-equipment.com/portal`։
4. Project Settings → API → պատճենեք **Project URL**-ը և **anon public** բանալին `config.js`-ի մեջ։
5. **GitHub** — ստեղծեք `arm-equipment-site` repository և վերբեռնեք բոլոր ֆայլերը։
6. **Vercel** — Add New → Project → ընտրեք `arm-equipment-site` → Deploy։
7. Vercel → Settings → Domains → ավելացրեք `arm-equipment.com` և `www.arm-equipment.com`։ Hostinger-ի DNS-ում դրեք Vercel-ի ցույց տված գրառումները։
8. Բացեք `arm-equipment.com/portal`, գրանցվեք `armequipment@gmail.com`-ով, հաստատեք էլ. փոստը։ Supabase SQL Editor-ում աշխատացրեք՝
   `update public.profiles set is_admin = true, status = 'approved' where email = 'armequipment@gmail.com';`
   Այժմ դուք ադմին եք։

## Ինչպես է աշխատում
- Պատվիրատուն գրանցվում է → սպասում է ձեր հաստատմանը (Ադմին → Պատվիրատուներ → Հաստատել)։
- Հաստատված պատվիրատուն տեսնում է գները, ընտրում քանակները, տեսնում արժեքը և ուղարկում պատվեր։
- Գները միշտ վերցվում են բազայից, պատվիրատուն չի կարող փոխել դրանք։
- Ադմինը տեսնում է պատվերները, դնում վերջնական գինը, հաստատում և «Ստեղծել հաշիվ» կոճակով պատվերից հաշիվ կազմում։
- Հաշիվներ, Կալենդար, Եկամուտ բաժինները տեսնում է միայն ադմինը։

## Կարևոր
- `anon public` բանալին կարելի է հրապարակել։ **`service_role` բանալին երբեք մի դրեք** կայքում կամ GitHub-ում։

## Email (armequipment@gmail.com)

1. Supabase → SQL Editor → paste `supabase/004_email.sql`, then `supabase/005_workflow.sql` → Run.
2. Open https://script.google.com while signed in as armequipment@gmail.com → New project → paste `gmail-robot/Code.gs`.
3. Project Settings (⚙) → Script properties → add `SUPABASE_URL`, `SUPABASE_KEY` (publishable key) and `BOT_SECRET` (copy it from the site: Income → Email link → Robot password).
4. Choose the function `setup` → Run → allow access.

The robot sends queued emails every 5 minutes. Every 10 minutes it reads Gmail: invoice .docx files (new or changed) go to the site with a notification, and the hotel manager's reply to the month-end email is checked — approval and/or corrected invoices → invoices updated → sent to the accountant; anything unclear → you get an email. On the last day of the month at 18:00 (Yerevan) it sends all invoices of the month to the manager in English; on the 1st at 9:00 it sends you last month's summary. `gmail-robot/Code.gs` is built from `Code.src.gs` + `invoice-docx.js`.
