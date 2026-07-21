-- ============================================================
-- SHIBA PIMS - PATCH 16 (one-time, run for v0.36.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 7 · Sprint 7.1b — End Shift wizard.
-- The end-of-shift wizard captures a couple of extra facts and
-- a summary snapshot for shift history + statistics:
--   * bodycam_uploaded  - did the officer upload the bodycam?
--   * vehicle_returned   - was the vehicle handed back?
--   * end_summary        - jsonb snapshot (hours, break, activity
--     counts...) frozen at close time, so history/stats don't
--     have to recompute.
--
-- Safe to run more than once (idempotent).
-- ============================================================

alter table public.shifts
  add column if not exists bodycam_uploaded boolean;

alter table public.shifts
  add column if not exists vehicle_returned boolean;

alter table public.shifts
  add column if not exists end_summary jsonb;

select 'PATCH 16 applied - end-of-shift fields ready' as result;
