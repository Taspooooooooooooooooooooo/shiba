-- ============================================================
-- SHIBA PIMS - PATCH 9 (one-time, run for v0.22.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Applications: officers apply for special assignments (SWAT,
-- K9, Detective, Transfer, Training, Special Permission).
-- Sergeant+ (applications.review) accept / deny / request
-- changes. Until this table exists the app degrades to a hint.
-- ============================================================

create table if not exists public.applications (
  id uuid not null default gen_random_uuid(),
  application_id text unique,
  officer_id uuid references public.officers(id) on delete cascade,
  type text not null,
  motivation text,
  answers jsonb,
  status text not null default 'Submitted',   -- Submitted | Under Review | Accepted | Denied | Changes Requested
  reviewed_by text,
  decision_reason text,
  decided_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint applications_pkey primary key (id)
);

create index if not exists applications_officer_idx
  on public.applications (officer_id);

create index if not exists applications_status_idx
  on public.applications (status);

-- give the ID engine an APPLICATION prefix (APP-2026-000001)
insert into public.public_ids (type, prefix, with_year)
values ('APPLICATION', 'APP', true)
on conflict (type) do nothing;

select 'PATCH 9 applied - applications ready' as result;
