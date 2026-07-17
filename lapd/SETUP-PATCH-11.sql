-- ============================================================
-- SHIBA PIMS - PATCH 11 (one-time, run for v0.28.x)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 6 · Sprint 6.1 — Case Management (core).
--
-- NOTE: the original database dump left behind EMPTY legacy
-- `cases` / `case_assignments` / `case_notes` tables with a
-- different shape (case_number / assigned_to, no case_id or
-- division_id). This patch detects that legacy shape and, only
-- if the tables are EMPTY, drops them so the correct schema can
-- be created. If any legacy row exists it ABORTS untouched so
-- nothing is ever lost. Safe to run more than once.
-- ============================================================

do $$
declare n bigint;
begin
  -- act only when a LEGACY cases table exists (one with no case_id column)
  if to_regclass('public.cases') is not null
     and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name  = 'cases'
          and column_name = 'case_id') then

    execute 'select count(*) from public.cases' into n;

    if n > 0 then
      raise exception
        'Legacy public.cases holds % row(s) — aborting so no data is lost.', n;
    end if;

    -- empty legacy leftovers: drop them so we can build the real schema
    drop table if exists public.case_notes cascade;
    drop table if exists public.case_assignments cascade;
    drop table if exists public.cases cascade;

  end if;
end $$;

create table if not exists public.cases (
  id uuid not null default gen_random_uuid(),
  case_id text unique,
  title text not null,
  incident_type text,
  division_id uuid references public.divisions(id) on delete set null,
  priority text not null default 'Medium',
  location text,
  incident_date date,
  incident_time text,
  description text,
  status text not null default 'Open',
  lead_officer_id uuid references public.officers(id) on delete set null,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  closed_at timestamp with time zone,
  constraint cases_pkey primary key (id)
);

create index if not exists cases_status_idx   on public.cases (status);
create index if not exists cases_division_idx on public.cases (division_id);
create index if not exists cases_lead_idx     on public.cases (lead_officer_id);

create table if not exists public.case_assignments (
  id uuid not null default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  officer_id uuid references public.officers(id) on delete cascade,
  role text not null default 'Officer',
  assigned_by text,
  assigned_at timestamp with time zone default now(),
  status text not null default 'Active',
  constraint case_assignments_pkey primary key (id),
  constraint case_assignments_unique unique (case_id, officer_id)
);

create index if not exists case_assignments_case_idx
  on public.case_assignments (case_id);
create index if not exists case_assignments_officer_idx
  on public.case_assignments (officer_id);

select 'PATCH 11 applied - cases + case_assignments ready' as result;
