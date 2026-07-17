-- ============================================================
-- SHIBA PIMS - RUN ALL PENDING PATCHES (one paste)
-- Run this ONCE in the Supabase dashboard: SQL Editor -> Run.
--
-- Safe to run even if some patches were already applied — every
-- statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS then re-add). Bundles patches 3, 5, 6, 7, 8:
--   3  audit history survives deletions
--   5  account lock (5 failed logins -> 15 min)
--   6  permission groups
--   7  temporary permissions
--   8  certificates + secure QR verification
-- ============================================================


-- ---------- PATCH 3 : audit history survives deletions ----------

alter table public.audit_logs
  drop constraint if exists audit_logs_officer_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_officer_id_fkey
  foreign key (officer_id) references public.officers(id) on delete set null;

alter table public.audit_logs
  drop constraint if exists audit_logs_user_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_user_id_fkey
  foreign key (user_id) references public.users(id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_receiver_id_fkey;
alter table public.notifications
  add constraint notifications_receiver_id_fkey
  foreign key (receiver_id) references public.users(id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_sender_id_fkey;
alter table public.notifications
  add constraint notifications_sender_id_fkey
  foreign key (sender_id) references public.users(id) on delete set null;


-- ---------- PATCH 5 : account lock ----------

alter table public.users
  add column if not exists failed_logins integer not null default 0;
alter table public.users
  add column if not exists locked_at timestamp with time zone;

create or replace function public.account_lock_status(p_username text)
returns json language plpgsql security definer as $$
declare v record; v_remaining integer;
begin
  select * into v from public.users
   where lower(username) = lower(trim(p_username)) limit 1;
  if v.id is null then
    return json_build_object('exists', false, 'locked', false);
  end if;
  if v.locked_at is not null
     and v.locked_at + interval '15 minutes' > now() then
    v_remaining := ceil(extract(epoch from
      (v.locked_at + interval '15 minutes' - now())) / 60);
    return json_build_object('exists', true, 'locked', true,
      'minutes', v_remaining);
  end if;
  return json_build_object('exists', true, 'locked', false,
    'failed', v.failed_logins);
end; $$;

create or replace function public.register_failed_login(p_username text)
returns json language plpgsql security definer as $$
declare v record; v_count integer;
begin
  select * into v from public.users
   where lower(username) = lower(trim(p_username)) limit 1;
  if v.id is null then
    return json_build_object('exists', false);
  end if;
  v_count := coalesce(v.failed_logins, 0) + 1;
  if v_count >= 5 then
    update public.users set failed_logins = v_count, locked_at = now()
     where id = v.id;
    return json_build_object('exists', true, 'locked', true, 'user_id', v.id);
  end if;
  update public.users set failed_logins = v_count where id = v.id;
  return json_build_object('exists', true, 'locked', false,
    'failed', v_count, 'remaining', 5 - v_count);
end; $$;

create or replace function public.reset_failed_logins(p_user uuid)
returns void language plpgsql security definer as $$
begin
  update public.users set failed_logins = 0, locked_at = null where id = p_user;
end; $$;

grant execute on function public.account_lock_status(text) to anon, authenticated;
grant execute on function public.register_failed_login(text) to anon, authenticated;
grant execute on function public.reset_failed_logins(uuid) to anon, authenticated;


-- ---------- PATCH 6 : permission groups ----------

alter table public.officers
  add column if not exists permission_groups text[] not null default '{}';


-- ---------- PATCH 7 : temporary permissions ----------

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


-- ---------- PATCH 8 : certificates + secure QR ----------


create table if not exists public.certificates (
  id uuid not null default gen_random_uuid(),
  certificate_id text unique,
  officer_id uuid references public.officers(id) on delete cascade,
  type text not null default 'Award',
  title text,
  reason text,
  new_rank_id uuid references public.ranks(id),
  effective_date date,
  status text not null default 'Pending',
  issued_by text,
  approved_by text,
  approved_at timestamp with time zone,
  qr_token uuid not null default gen_random_uuid(),
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint certificates_pkey primary key (id),
  constraint certificates_qr_token_key unique (qr_token)
);

create index if not exists certificates_officer_idx
  on public.certificates (officer_id);

-- Secure QR verification: the scanner calls this with a token.
-- Valid only if the token exists in OUR database.
create or replace function public.verify_qr_token(p_token text)
returns json
language plpgsql
security definer
as $$
declare
  v record;
begin
  begin
    select c.*, o.officer_id as officer_public_id,
           o.first_name, o.last_name,
           r.name as new_rank_name
      into v
      from public.certificates c
      left join public.officers o on o.id = c.officer_id
      left join public.ranks r on r.id = c.new_rank_id
     where c.qr_token::text = trim(p_token)
     limit 1;
  exception when others then
    return json_build_object('valid', false);
  end;

  if v.id is null then
    return json_build_object('valid', false);
  end if;

  return json_build_object(
    'valid', true,
    'certificate_id', v.certificate_id,
    'type', v.type,
    'title', v.title,
    'status', v.status,
    'revoked', v.revoked_at is not null,
    'officer_name',
      coalesce(trim(v.first_name || ' ' || v.last_name), '—'),
    'officer_public_id', v.officer_public_id,
    'new_rank', v.new_rank_name,
    'effective_date', v.effective_date,
    'issued_by', v.issued_by,
    'approved_by', v.approved_by,
    'approved_at', v.approved_at,
    'created_at', v.created_at);
end;
$$;

grant execute on function public.verify_qr_token(text) to anon, authenticated;

select 'PATCH 8 applied - certificates + secure QR verification ready' as result;


-- ---------- PATCH 9 : applications ----------

create table if not exists public.applications (
  id uuid not null default gen_random_uuid(),
  application_id text unique,
  officer_id uuid references public.officers(id) on delete cascade,
  type text not null,
  motivation text,
  answers jsonb,
  status text not null default 'Submitted',
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
insert into public.public_ids (type, prefix, with_year)
values ('APPLICATION', 'APP', true)
on conflict (type) do nothing;


-- ---------- PATCH 10 : applications certificate link + edit ----------

alter table public.applications
  add column if not exists linked_certificate text;
alter table public.applications
  add column if not exists updated_at timestamp with time zone;


-- ---------- PATCH 11 : cases + case assignments (Phase 6) ----------

-- the original dump left EMPTY legacy cases/case_assignments/case_notes
-- tables with the wrong shape (case_number/assigned_to, no case_id).
-- drop them ONLY if legacy + empty; abort if any row exists.
do $$
declare n bigint;
begin
  if to_regclass('public.cases') is not null
     and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'cases'
          and column_name = 'case_id') then
    execute 'select count(*) from public.cases' into n;
    if n > 0 then
      raise exception
        'Legacy public.cases holds % row(s) — aborting so no data is lost.', n;
    end if;
    drop table if exists public.case_notes cascade;
    drop table if exists public.case_assignments cascade;
    drop table if exists public.cases cascade;
  end if;
end $$;

create table if not exists public.cases (
  id uuid not null default gen_random_uuid(),
  case_id text unique,
  title text not null,
  incident_type text,
  division_id uuid references public.divisions(id) on delete set null,
  priority text not null default 'Medium',
  location text,
  incident_date date,
  incident_time text,
  description text,
  status text not null default 'Open',
  lead_officer_id uuid references public.officers(id) on delete set null,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  closed_at timestamp with time zone,
  constraint cases_pkey primary key (id)
);
create index if not exists cases_status_idx   on public.cases (status);
create index if not exists cases_division_idx on public.cases (division_id);
create index if not exists cases_lead_idx     on public.cases (lead_officer_id);

create table if not exists public.case_assignments (
  id uuid not null default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  officer_id uuid references public.officers(id) on delete cascade,
  role text not null default 'Officer',
  assigned_by text,
  assigned_at timestamp with time zone default now(),
  status text not null default 'Active',
  constraint case_assignments_pkey primary key (id),
  constraint case_assignments_unique unique (case_id, officer_id)
);
create index if not exists case_assignments_case_idx
  on public.case_assignments (case_id);
create index if not exists case_assignments_officer_idx
  on public.case_assignments (officer_id);


select 'ALL PENDING PATCHES applied (3, 5, 6, 7, 8, 9, 10, 11)' as result;
