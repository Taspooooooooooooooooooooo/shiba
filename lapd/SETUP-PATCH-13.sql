-- ============================================================
-- SHIBA PIMS - PATCH 13 (one-time, run for v0.30.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 6 · Sprint 6.3 — Evidence & People + PDF417 everywhere.
--
--   * case_evidence - every piece of evidence is its own object:
--     EVID-2026-000001 id, type, uploader, SHA-256 file hash,
--     the file (stored through SHIBA Cloud: cloud_id) and a
--     SECRET scan_token - the PDF417 barcode carries this token,
--     never a link, and the scanner validates it against our DB.
--   * case_persons - victims / witnesses / suspects, each with
--     their own PRSN- id.
--   * officers.scan_token - the Digital ID card's PDF417 token
--     (replaces the old link-based QR).
--   * verify_scan_token(p_token) - ONE scanner RPC that
--     recognises certificate, officer and evidence tokens.
--
-- Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.case_evidence (
  id uuid not null default gen_random_uuid(),
  evidence_id text unique,
  case_id uuid references public.cases(id) on delete cascade,
  type text not null default 'Other',
  description text,
  file_url text,
  file_name text,
  file_size bigint,
  hash text,
  cloud_id text,
  uploaded_by text,
  scan_token uuid not null default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  constraint case_evidence_pkey primary key (id),
  constraint case_evidence_scan_token_key unique (scan_token)
);

create index if not exists case_evidence_case_idx
  on public.case_evidence (case_id);

create table if not exists public.case_persons (
  id uuid not null default gen_random_uuid(),
  person_id text unique,
  case_id uuid references public.cases(id) on delete cascade,
  role text not null default 'Other',   -- Victim | Witness | Suspect | Other
  name text not null,
  details text,
  added_by text,
  created_at timestamp with time zone default now(),
  constraint case_persons_pkey primary key (id)
);

create index if not exists case_persons_case_idx
  on public.case_persons (case_id);

-- officers get a scan token for the ID-card PDF417
alter table public.officers
  add column if not exists scan_token uuid not null default gen_random_uuid();

create unique index if not exists officers_scan_token_key
  on public.officers (scan_token);

insert into public.public_ids (type, prefix, with_year) values
  ('EVIDENCE', 'EVID', true),
  ('PERSON', 'PRSN', true)
on conflict (type) do nothing;

-- ------------------------------------------------------------
-- ONE verification RPC for every PDF417 in the system.
-- A code is valid ONLY if its token exists in our database.
-- ------------------------------------------------------------

create or replace function public.verify_scan_token(p_token text)
returns json
language plpgsql
security definer
as $$
declare
  c record;
  o record;
  e record;
begin
  -- certificate?
  begin
    select cr.*, ofc.officer_id as officer_public_id,
           ofc.first_name, ofc.last_name,
           r.name as new_rank_name
      into c
      from public.certificates cr
      left join public.officers ofc on ofc.id = cr.officer_id
      left join public.ranks r on r.id = cr.new_rank_id
     where cr.qr_token::text = trim(p_token)
     limit 1;
  exception when others then c := null; end;

  if c.id is not null then
    return json_build_object(
      'valid', true, 'kind', 'certificate',
      'certificate_id', c.certificate_id,
      'type', c.type, 'title', c.title, 'status', c.status,
      'revoked', c.revoked_at is not null,
      'officer_name',
        coalesce(trim(c.first_name || ' ' || c.last_name), '—'),
      'officer_public_id', c.officer_public_id,
      'new_rank', c.new_rank_name,
      'effective_date', c.effective_date,
      'issued_by', c.issued_by, 'approved_by', c.approved_by,
      'created_at', c.created_at);
  end if;

  -- officer identity card?
  begin
    select ofc.*, r.name as rank_name, d.name as division_name
      into o
      from public.officers ofc
      left join public.ranks r on r.id = ofc.rank_id
      left join public.divisions d on d.id = ofc.division_id
     where ofc.scan_token::text = trim(p_token)
     limit 1;
  exception when others then o := null; end;

  if o.id is not null then
    return json_build_object(
      'valid', true, 'kind', 'officer',
      'officer_public_id', o.officer_id,
      'officer_name',
        coalesce(trim(o.first_name || ' ' || o.last_name), '—'),
      'badge', o.badge_number,
      'rank', o.rank_name, 'division', o.division_name,
      'status', o.status);
  end if;

  -- evidence?
  begin
    select ev.*, cs.case_id as case_public_id
      into e
      from public.case_evidence ev
      left join public.cases cs on cs.id = ev.case_id
     where ev.scan_token::text = trim(p_token)
     limit 1;
  exception when others then e := null; end;

  if e.id is not null then
    return json_build_object(
      'valid', true, 'kind', 'evidence',
      'evidence_id', e.evidence_id,
      'case_public_id', e.case_public_id,
      'type', e.type, 'description', e.description,
      'file_name', e.file_name, 'hash', e.hash,
      'uploaded_by', e.uploaded_by, 'created_at', e.created_at);
  end if;

  return json_build_object('valid', false);
end;
$$;

grant execute on function public.verify_scan_token(text)
  to anon, authenticated;

select 'PATCH 13 applied - evidence + persons + scan tokens ready' as result;
