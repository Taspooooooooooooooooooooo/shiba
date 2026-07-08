-- ============================================================
-- SHIBA PIMS - PATCH 6 (one-time, run for v0.15.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Permission Groups: an officer can be given named permission
-- bundles (e.g. "Training Officer") on top of their rank. The
-- assigned group keys live in this column. Until it exists,
-- groups simply don't apply (the app degrades gracefully).
-- ============================================================

alter table public.officers
  add column if not exists permission_groups text[] not null default '{}';

select 'PATCH 6 applied - permission_groups ready' as result;
