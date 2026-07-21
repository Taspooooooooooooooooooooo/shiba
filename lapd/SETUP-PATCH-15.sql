-- ============================================================
-- SHIBA PIMS - PATCH 15 (one-time, run for v0.35.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 7 · Sprint 7.1a — Shift Management (the spine).
-- A shift is a DIGITAL DUTY SESSION: who, when, which vehicle,
-- which callsign, what equipment, bodycam ready, what the
-- officer is doing right now, and every event in between.
--
--   * shifts         - one row per duty session (SHIFT-2026-…)
--   * shift_timeline - the shift's own chronological log
--
-- The SHIFT and BODYCAM id prefixes are already seeded in the
-- ID engine. Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.shifts (
  id uuid not null default gen_random_uuid(),
  shift_id text unique,
  officer_id uuid references public.officers(id) on delete cascade,

  -- lifecycle: Active | Break | Closed  (Scheduled/Ready arrive
  -- with the calendar sprint; Archived with history)
  status text not null default 'Active',

  -- what the officer is doing right now (status engine)
  activity text not null default 'Patrolling',

  -- vehicle & radio (free-typed for now; registry comes later)
  vehicle_unit text,
  vehicle_type text,
  callsign text,
  primary_channel text,
  secondary_channel text,

  -- equipment checklist: {"Radio":true,"Bodycam":false,...}
  equipment jsonb,

  -- bodycam
  bodycam_ready boolean not null default false,
  bodycam_session_id text,

  -- incident mode (Sprint 7.2 links a case here)
  current_case_id uuid references public.cases(id) on delete set null,

  -- breaks: while on break, break_started_at is set; on return
  -- the elapsed time is added to break_seconds
  break_started_at timestamp with time zone,
  break_type text,
  break_prev_activity text,
  break_seconds integer not null default 0,

  -- end-of-shift (Sprint 7.1b fills these)
  started_at timestamp with time zone default now(),
  ended_at timestamp with time zone,
  end_comments text,
  overtime boolean not null default false,

  created_at timestamp with time zone default now(),
  constraint shifts_pkey primary key (id)
);

create index if not exists shifts_officer_idx
  on public.shifts (officer_id);

create index if not exists shifts_open_idx
  on public.shifts (officer_id) where ended_at is null;

create table if not exists public.shift_timeline (
  id uuid not null default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete cascade,
  event text not null,
  details text,
  actor text,
  created_at timestamp with time zone default now(),
  constraint shift_timeline_pkey primary key (id)
);

create index if not exists shift_timeline_shift_idx
  on public.shift_timeline (shift_id);

select 'PATCH 15 applied - shifts + shift timeline ready' as result;
