-- ============================================================
-- SHIBA PIMS - PATCH 19 (one-time, run for v0.40.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 7 · Sprint 7.5 — Bodycam module (the last Phase 7 piece).
-- A bodycam SESSION is a real recording clip on a shift, not just
-- an id string. Officers start/stop recording, drop MARKERS
-- (bookmarks / evidence / incident) at a point in the footage,
-- and upload the footage through SHIBA Cloud. An EVIDENCE marker
-- placed while responding to a case turns into real case_evidence
-- (type "Bodycam") automatically — this is how Shifts feed Cases.
--
--   * bodycam_sessions - one recording clip: BODY-2026-000001,
--     status, recorded seconds, and the uploaded footage
--     (through SHIBA Cloud: cloud_id + SHA-256 hash).
--   * bodycam_markers  - a point in a session: offset seconds,
--     kind, label/note, and (for Evidence markers) the case +
--     case_evidence row it was promoted into.
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- BODY prefix is already seeded by the id engine; re-assert it so
-- sessions always mint BODY-YYYY-NNNNNN ids even on older installs.
insert into public.public_ids (type, prefix, with_year) values
  ('BODYCAM', 'BODY', true)
on conflict (type) do nothing;

create table if not exists public.bodycam_sessions (
  id uuid not null default gen_random_uuid(),
  session_id text unique,                         -- BODY-2026-000001
  shift_id uuid references public.shifts(id) on delete cascade,
  officer_id uuid references public.officers(id) on delete set null,

  -- Recording | Stopped | Uploaded | Archived
  status text not null default 'Recording',

  started_at timestamp with time zone default now(),
  stopped_at timestamp with time zone,
  recorded_seconds integer not null default 0,

  -- footage upload (routed THROUGH SHIBA Cloud, same as evidence)
  file_url text,
  file_name text,
  file_size bigint,
  hash text,
  cloud_id text,
  uploaded_at timestamp with time zone,
  uploaded_by text,

  notes text,
  created_by text,
  created_at timestamp with time zone default now(),
  constraint bodycam_sessions_pkey primary key (id)
);

create index if not exists bodycam_sessions_shift_idx
  on public.bodycam_sessions (shift_id);

create index if not exists bodycam_sessions_officer_idx
  on public.bodycam_sessions (officer_id);

create table if not exists public.bodycam_markers (
  id uuid not null default gen_random_uuid(),
  session_id uuid references public.bodycam_sessions(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,   -- denormalized

  -- Bookmark | Evidence | Incident
  kind text not null default 'Bookmark',

  offset_seconds integer not null default 0,   -- position within the recording
  label text,
  note text,

  -- when an Evidence marker is promoted it becomes case_evidence:
  linked_case_id uuid references public.cases(id) on delete set null,
  linked_evidence_id uuid references public.case_evidence(id) on delete set null,

  created_by text,
  created_at timestamp with time zone default now(),
  constraint bodycam_markers_pkey primary key (id)
);

create index if not exists bodycam_markers_session_idx
  on public.bodycam_markers (session_id);

create index if not exists bodycam_markers_shift_idx
  on public.bodycam_markers (shift_id);

select 'PATCH 19 applied - bodycam sessions + markers ready' as result;
