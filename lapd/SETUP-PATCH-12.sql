-- ============================================================
-- SHIBA PIMS - PATCH 12 (one-time, run for v0.29.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 6 · Sprint 6.2 — the case file comes alive.
--
--   * case_timeline - the case's own chronological history
--     (Case created -> Officer assigned -> Status changed -> ...).
--     Separate from officer_timeline: this belongs to the CASE.
--   * case_notes - investigator notes with author, pinned flag
--     and an edited marker. Notes are never deleted.
--
-- Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.case_timeline (
  id uuid not null default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  event text not null,
  details text,
  actor text,
  created_at timestamp with time zone default now(),
  constraint case_timeline_pkey primary key (id)
);

create index if not exists case_timeline_case_idx
  on public.case_timeline (case_id);

create table if not exists public.case_notes (
  id uuid not null default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  author text,
  body text not null,
  pinned boolean not null default false,
  edited_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint case_notes_pkey primary key (id)
);

create index if not exists case_notes_case_idx
  on public.case_notes (case_id);

select 'PATCH 12 applied - case timeline + notes ready' as result;
