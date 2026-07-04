-- ============================================================
-- SHIBA CLOUD - one-time storage setup
-- Run this ONCE in the Supabase dashboard: SQL Editor -> Run
-- ============================================================

-- 1. The public storage bucket that holds the uploaded files
insert into storage.buckets (id, name, public)
values ('cloud', 'cloud', true)
on conflict (id) do nothing;

-- 2. Allow the website (anon key) to upload, read and delete
--    files in this bucket only
create policy "cloud anon read"
on storage.objects for select to anon
using (bucket_id = 'cloud');

create policy "cloud anon upload"
on storage.objects for insert to anon
with check (bucket_id = 'cloud');

create policy "cloud anon delete"
on storage.objects for delete to anon
using (bucket_id = 'cloud');

-- 3. Metadata table: maps a short share ID to the stored file
create table public.cloud_files (
  id text not null,
  name text not null,
  path text not null,
  size bigint,
  mime text,
  created_at timestamp with time zone default now(),
  constraint cloud_files_pkey primary key (id)
);
