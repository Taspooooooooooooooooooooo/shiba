-- ============================================================
-- SHIBA PIMS - PATCH 14 (one-time, run for v0.31.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 6 · Sprint 6.4 — Related Cases.
-- Links two cases (same suspect, same location, follow-up...)
-- so the case file can show "Related Cases" automatically.
--
-- Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.case_relationships (
  id uuid not null default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  related_case_id uuid references public.cases(id) on delete cascade,
  created_by text,
  created_at timestamp with time zone default now(),
  constraint case_relationships_pkey primary key (id),
  constraint case_relationships_unique unique (case_id, related_case_id)
);

create index if not exists case_relationships_case_idx
  on public.case_relationships (case_id);

create index if not exists case_relationships_related_idx
  on public.case_relationships (related_case_id);

select 'PATCH 14 applied - related cases ready' as result;
