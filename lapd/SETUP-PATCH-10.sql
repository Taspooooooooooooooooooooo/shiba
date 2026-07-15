-- ============================================================
-- SHIBA PIMS - PATCH 10 (one-time, run for v0.25.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Applications rework:
--   * linked_certificate  - lets an applicant attach one of
--     their certificates (e.g. a Firearm Qualification) to an
--     application. Stores the certificate's public id (CERT-...).
--   * updated_at           - bumped whenever an applicant edits
--     and resubmits a "Changes Requested" application.
--
-- Safe to run more than once (idempotent).
-- ============================================================

alter table public.applications
  add column if not exists linked_certificate text;

alter table public.applications
  add column if not exists updated_at timestamp with time zone;

select 'PATCH 10 applied - applications: certificate link + edit ready' as result;
