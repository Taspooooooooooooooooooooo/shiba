-- ============================================================
-- SHIBA PIMS - PATCH 21 (one-time, run for v0.43.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 8 · Sprint 8.3 — Bodycam lifecycle + integrity.
-- Bodycam footage gets a real, re-checkable integrity guarantee:
-- the SHA-256 taken at upload is compared against a fresh hash of
-- the STORED file. If they ever differ, the session is flagged
-- Tampered and supervisors are notified.
--
--   * bodycam_sessions - integrity tracking:
--       integrity_status      Unverified | Verified | Tampered
--       integrity_verified_at when it was last checked
--       integrity_hash        the hash re-computed from storage
--       integrity_by          who ran the check
--
-- Safe to run more than once (idempotent).
-- ============================================================

alter table public.bodycam_sessions
  add column if not exists integrity_status text not null default 'Unverified';
alter table public.bodycam_sessions
  add column if not exists integrity_verified_at timestamp with time zone;
alter table public.bodycam_sessions
  add column if not exists integrity_hash text;
alter table public.bodycam_sessions
  add column if not exists integrity_by text;

select 'PATCH 21 applied - bodycam integrity tracking ready' as result;
