-- ============================================================
-- SHIBA PIMS - RUN ALL PENDING PATCHES (one paste)
-- Run this ONCE in the Supabase dashboard: SQL Editor -> Run.
--
-- Safe to run even if some patches were already applied — every
-- statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS then re-add). Bundles patches 3, 5, 6, 7:
--   3  audit history survives deletions
--   5  account lock (5 failed logins -> 15 min)
--   6  permission groups
--   7  temporary permissions
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


select 'ALL PENDING PATCHES applied (3, 5, 6, 7)' as result;
