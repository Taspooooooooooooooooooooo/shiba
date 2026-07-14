-- ============================================================
-- SHIBA CLOUD - PRIVACY PATCH (one-time)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Gives each uploaded file an owner, so the cloud shows an
-- account only ITS OWN files (management/admins see all).
-- NOTE: this is UI-level privacy. The storage bucket is still
-- public, so a direct file URL still works if someone has it.
-- TRUE privacy needs a private bucket + a signed-URL edge
-- function (planned next) — see cloud/ADSTERRA-GUIDE.md notes.
-- ============================================================

alter table public.cloud_files
  add column if not exists owner_username text;

alter table public.cloud_files
  add column if not exists owner_id uuid;

create index if not exists cloud_files_owner_idx
  on public.cloud_files (owner_username);

select 'Cloud privacy columns ready' as result;
