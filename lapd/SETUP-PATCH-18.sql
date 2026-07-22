-- ============================================================
-- SHIBA PIMS - PATCH 18 (one-time, run for v0.38.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 7 · Sprint 7.3 — Shift scheduling (calendar).
-- Supervisors plan shifts ahead; an officer starting a shift
-- can fulfil a scheduled slot for that day.
--   * scheduled_shifts - planned duty slots on the calendar
--
-- Statistics + alerts (break > 30 min, overtime > 8 h) are
-- computed from the existing shifts data and need no table.
-- Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.scheduled_shifts (
  id uuid not null default gen_random_uuid(),
  officer_id uuid references public.officers(id) on delete cascade,
  shift_date date not null,
  start_time text,
  end_time text,
  notes text,
  status text not null default 'Scheduled',
  scheduled_by text,
  fulfilled_shift_id uuid references public.shifts(id) on delete set null,
  created_at timestamp with time zone default now(),
  constraint scheduled_shifts_pkey primary key (id)
);

create index if not exists scheduled_shifts_officer_idx
  on public.scheduled_shifts (officer_id);
create index if not exists scheduled_shifts_date_idx
  on public.scheduled_shifts (shift_date);

select 'PATCH 18 applied - shift scheduling ready' as result;
