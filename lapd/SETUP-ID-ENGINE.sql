-- ============================================================
-- SHIBA PIMS - ID ENGINE (one-time setup)
-- Run this ONCE in the Supabase dashboard: SQL Editor -> Run
--
-- Central registry for all public IDs (OFCR-000001,
-- CASE-2026-000001, ...). One row per ID type, one function
-- that hands out the next number atomically - two officers
-- created at the same moment can never get the same ID.
-- ============================================================

create table if not exists public.public_ids (
  type text not null,
  prefix text not null,
  with_year boolean not null default false,
  current_number bigint not null default 0,
  updated_at timestamp with time zone default now(),
  constraint public_ids_pkey primary key (type)
);

insert into public.public_ids (type, prefix, with_year) values
  ('OFFICER',      'OFCR',  false),
  ('BADGE',        'BDG',   false),
  ('CASE',         'CASE',  true),
  ('CERTIFICATE',  'CERT',  true),
  ('REPORT',       'RPT',   true),
  ('SHIFT',        'SHIFT', true),
  ('PROMOTION',    'PROMO', true),
  ('ACTIVATION',   'ACT',   true),
  ('AUDIT',        'AUDIT', true),
  ('NOTIFICATION', 'NOTIF', true),
  ('BODYCAM',      'BODY',  true),
  ('MESSAGE',      'MSG',   true)
on conflict (type) do nothing;

-- Atomic: UPDATE..RETURNING locks the row, so concurrent calls
-- always get different numbers (no count+1 collisions).
create or replace function public.next_public_id(id_type text)
returns text
language plpgsql
security definer
as $$
declare
  rec public.public_ids%rowtype;
begin
  update public.public_ids
     set current_number = current_number + 1,
         updated_at = now()
   where type = id_type
   returning * into rec;

  if rec.type is null then
    raise exception 'Unknown public id type: %', id_type;
  end if;

  if rec.with_year then
    return rec.prefix || '-' ||
           extract(year from now())::text || '-' ||
           lpad(rec.current_number::text, 6, '0');
  end if;

  return rec.prefix || '-' || lpad(rec.current_number::text, 6, '0');
end;
$$;

grant execute on function public.next_public_id(text) to anon;
grant execute on function public.next_public_id(text) to authenticated;
