-- ============================================================
-- SHIBA PIMS - PATCH 17 (one-time, run for v0.37.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 7 · Sprint 7.2 — Shift File.
--   * shift_notes - the officer's own notes DURING the shift
--     (not case notes): "vehicle had a technical issue", etc.
--
-- Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.shift_notes (
  id uuid not null default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete cascade,
  author text,
  body text not null,
  created_at timestamp with time zone default now(),
  constraint shift_notes_pkey primary key (id)
);

create index if not exists shift_notes_shift_idx
  on public.shift_notes (shift_id);

select 'PATCH 17 applied - shift notes ready' as result;
