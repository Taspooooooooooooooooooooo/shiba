-- ============================================================
-- SHIBA PIMS - PATCH 8 (one-time, run for v0.20.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
-- (also included at the end of RUN-ALL-PENDING.sql)
--
-- CERTIFICATES: the official document system. Rank changes,
-- awards, suspensions etc. become certificates that go
-- Pending -> Approved before anything takes effect. Every
-- certificate carries a secret qr_token that ONLY our
-- scanner/database can validate - a forged QR verifies as
-- invalid because its token is not in our records.
-- ============================================================

create table if not exists public.certificates (
  id uuid not null default gen_random_uuid(),
  certificate_id text unique,
  officer_id uuid references public.officers(id) on delete cascade,
  type text not null default 'Award',
  title text,
  reason text,
  new_rank_id uuid references public.ranks(id),
  effective_date date,
  status text not null default 'Pending',
  issued_by text,
  approved_by text,
  approved_at timestamp with time zone,
  qr_token uuid not null default gen_random_uuid(),
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint certificates_pkey primary key (id),
  constraint certificates_qr_token_key unique (qr_token)
);

create index if not exists certificates_officer_idx
  on public.certificates (officer_id);

-- Secure QR verification: the scanner calls this with a token.
-- Valid only if the token exists in OUR database.
create or replace function public.verify_qr_token(p_token text)
returns json
language plpgsql
security definer
as $$
declare
  v record;
begin
  begin
    select c.*, o.officer_id as officer_public_id,
           o.first_name, o.last_name,
           r.name as new_rank_name
      into v
      from public.certificates c
      left join public.officers o on o.id = c.officer_id
      left join public.ranks r on r.id = c.new_rank_id
     where c.qr_token::text = trim(p_token)
     limit 1;
  exception when others then
    return json_build_object('valid', false);
  end;

  if v.id is null then
    return json_build_object('valid', false);
  end if;

  return json_build_object(
    'valid', true,
    'certificate_id', v.certificate_id,
    'type', v.type,
    'title', v.title,
    'status', v.status,
    'revoked', v.revoked_at is not null,
    'officer_name',
      coalesce(trim(v.first_name || ' ' || v.last_name), '—'),
    'officer_public_id', v.officer_public_id,
    'new_rank', v.new_rank_name,
    'effective_date', v.effective_date,
    'issued_by', v.issued_by,
    'approved_by', v.approved_by,
    'approved_at', v.approved_at,
    'created_at', v.created_at);
end;
$$;

grant execute on function public.verify_qr_token(text) to anon, authenticated;

select 'PATCH 8 applied - certificates + secure QR verification ready' as result;
