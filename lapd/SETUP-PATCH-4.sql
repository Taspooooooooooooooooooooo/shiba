-- ============================================================
-- SHIBA PIMS - PATCH 4 (one-time, run for v0.11.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Leadership Notes: senior officers (Lieutenant+) leave notes
-- on a personnel file that the officer can only read. Stored
-- in their own table. The Personnel File shows a friendly
-- hint until this table exists, so the app keeps working
-- either way.
-- ============================================================

create table if not exists public.leadership_notes (
  id uuid not null default gen_random_uuid(),
  officer_id uuid references public.officers(id) on delete cascade,
  author_name text,
  author_role text,
  note text not null,
  created_at timestamp with time zone default now(),
  constraint leadership_notes_pkey primary key (id)
);

-- Alpha posture: access is gated in the UI (only Lieutenant+
-- see the "add note" box). Phase 3 RLS hardening will enforce
-- this server-side.

select 'PATCH 4 applied - leadership_notes ready' as result;
