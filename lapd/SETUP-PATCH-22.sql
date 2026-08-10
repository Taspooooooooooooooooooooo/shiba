-- ============================================================
-- SHIBA PIMS - PATCH 22 (one-time, run for v0.44.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 8 · Sprint 8.4 — Marker categories + the bodycam Player.
--
--   * bodycam_markers.category - the EVENT type of a marker
--     (Traffic Stop / Arrest / Use of Force / Weapon Drawn /
--     Evidence Found / Interview / Other). The existing `kind`
--     (Bookmark/Evidence/Incident) still drives auto-evidence.
--   * bodycam_annotations - review-time notes on the footage:
--     supervisor BOOKMARKS (a labelled point) and timestamped
--     COMMENTS (which the officer sees). Distinct from the
--     officer's in-recording markers.
--
-- Safe to run more than once (idempotent).
-- ============================================================

alter table public.bodycam_markers
  add column if not exists category text;

create table if not exists public.bodycam_annotations (
  id uuid not null default gen_random_uuid(),
  session_id uuid references public.bodycam_sessions(id) on delete cascade,
  kind text not null default 'Comment',     -- Bookmark | Comment
  offset_seconds integer not null default 0,
  body text,
  author text,
  author_officer_id uuid references public.officers(id) on delete set null,
  created_at timestamp with time zone default now(),
  constraint bodycam_annotations_pkey primary key (id)
);

create index if not exists bodycam_annotations_session_idx
  on public.bodycam_annotations (session_id);

select 'PATCH 22 applied - marker categories + bodycam annotations ready' as result;
