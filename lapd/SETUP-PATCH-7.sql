-- ============================================================
-- SHIBA PIMS - PATCH 7 (one-time, run for v0.16.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Temporary permissions: grant a single permission to an
-- officer that automatically expires. Covers three flavours
-- (all the same mechanism, different intent):
--   * Temporary  — a time-boxed extra power
--   * Delegation — hand an approval power over while away
--   * Emergency  — a very short (e.g. 2-hour) override
-- Expired or revoked grants stop counting automatically.
-- Until this table exists, temporary grants simply don't
-- apply (the app degrades gracefully).
-- ============================================================

create table if not exists public.permission_grants (
  id uuid not null default gen_random_uuid(),
  officer_id uuid references public.officers(id) on delete cascade,
  permission text not null,
  kind text not null default 'Temporary',
  reason text,
  granted_by text,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint permission_grants_pkey primary key (id)
);

create index if not exists permission_grants_officer_idx
  on public.permission_grants (officer_id);

select 'PATCH 7 applied - permission_grants ready' as result;
