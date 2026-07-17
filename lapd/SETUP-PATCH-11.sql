-- ============================================================
-- SHIBA PIMS - PATCH 11 (one-time, run for v0.28.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 6 · Sprint 6.1 — Case Management (core).
-- A case is a container (a digital case file), not a form.
-- This patch creates the case + assignment tables; later
-- sprints add notes/timeline/evidence/persons/relationships.
--
-- The ID engine already has a CASE prefix (CASE-2026-000001),
-- so nothing to seed here. Safe to run more than once.
-- ============================================================

create table if not exists public.cases (
  id uuid not null default gen_random_uuid(),
  case_id text unique,
  title text not null,
  incident_type text,
  division_id uuid references public.divisions(id) on delete set null,
  priority text not null default 'Medium',      -- Low | Medium | High | Critical
  location text,
  incident_date date,
  incident_time text,
  description text,
  status text not null default 'Open',           -- Draft|Open|Investigation|Evidence Collection|Supervisor Review|Approved For Closing|Closed|Archived
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
  role text not null default 'Officer',          -- Lead Investigator | Officer | Supervisor | Evidence Technician
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
