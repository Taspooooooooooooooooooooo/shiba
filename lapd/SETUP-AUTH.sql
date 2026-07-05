-- ============================================================
-- SHIBA PIMS - ACTIVATION SYSTEM (one-time setup)
-- Run this ONCE in the Supabase dashboard: SQL Editor -> Run
--
-- Requires SETUP-ID-ENGINE.sql to be run first (uses
-- next_public_id for ACT-2026-000001 ids).
--
-- IMPORTANT: also disable email confirmation, or activation
-- cannot finish:
--   Dashboard -> Authentication -> Sign In / Providers
--   -> Email -> turn OFF "Confirm email"
--
-- The LAST line of this script prints your one-time
-- Super Administrator activation code. Copy it - you will
-- use it on the site (LOGIN -> ACTIVATE ACCOUNT) to create
-- your own real admin account.
-- ============================================================

create table if not exists public.activation_codes (
  id uuid not null default gen_random_uuid(),
  activation_id text unique,
  officer_id uuid references public.officers(id),
  code text not null,
  purpose text not null default 'activate',      -- 'activate' | 'reset'
  role text not null default 'Officer',
  expires_at timestamp with time zone not null,
  created_by uuid,
  used_at timestamp with time zone,
  used_by uuid,
  created_at timestamp with time zone default now(),
  constraint activation_codes_pkey primary key (id)
);

-- Codes must not be listable from the browser. RLS with no
-- policies blocks all direct access; the SECURITY DEFINER
-- functions below are the only doors in.
alter table public.activation_codes enable row level security;

-- ------------------------------------------------------------
-- Create a code (admin UI calls this when an officer is
-- created, or for a password reset)
-- ------------------------------------------------------------
create or replace function public.create_activation_code(
  p_officer uuid default null,
  p_role text default 'Officer',
  p_purpose text default 'activate'
)
returns json
language plpgsql
security definer
as $$
declare
  v_code text;
  v_act text;
  v_expires timestamp with time zone;
begin
  v_code := upper(
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  v_act := public.next_public_id('ACTIVATION');

  v_expires := now() + interval '48 hours';

  insert into public.activation_codes
    (activation_id, officer_id, code, purpose, role, expires_at)
  values
    (v_act, p_officer, v_code, p_purpose, p_role, v_expires);

  return json_build_object(
    'activation_id', v_act,
    'code', v_code,
    'expires_at', v_expires);
end;
$$;

-- ------------------------------------------------------------
-- Check a code (step 1 of the activation page)
-- ------------------------------------------------------------
create or replace function public.check_activation_code(
  p_officer_public text,
  p_code text
)
returns json
language plpgsql
security definer
as $$
declare
  v record;
begin
  select ac.*, o.officer_id as officer_public_id,
         o.first_name, o.last_name
    into v
    from public.activation_codes ac
    left join public.officers o on o.id = ac.officer_id
   where upper(ac.code) = upper(trim(p_code))
     and ac.used_at is null
     and ac.expires_at > now()
     and (
           (ac.officer_id is null
             and (p_officer_public is null or trim(p_officer_public) = ''))
        or (upper(o.officer_id) = upper(trim(p_officer_public)))
     )
   limit 1;

  if v.id is null then
    return json_build_object('valid', false);
  end if;

  return json_build_object(
    'valid', true,
    'purpose', v.purpose,
    'role', v.role,
    'officer_uuid', v.officer_id,
    'officer_name',
      coalesce(v.first_name || ' ' || v.last_name, 'Administrator'));
end;
$$;

-- ------------------------------------------------------------
-- Complete activation (step 2, after the auth account exists):
-- marks the code used, creates the profile row, links officer
-- ------------------------------------------------------------
create or replace function public.complete_activation(
  p_code text,
  p_user uuid,
  p_username text
)
returns json
language plpgsql
security definer
as $$
declare
  v record;
begin
  select * into v
    from public.activation_codes
   where upper(code) = upper(trim(p_code))
     and used_at is null
     and expires_at > now()
   limit 1;

  if v.id is null then
    return json_build_object('ok', false, 'reason', 'invalid code');
  end if;

  update public.activation_codes
     set used_at = now(),
         used_by = p_user
   where id = v.id;

  -- profile row (officers.user_id has a FK to users.id)
  insert into public.users (id, username, password_hash, pin_hash, active)
  values (p_user, lower(trim(p_username)), 'SUPABASE_AUTH', 'IN_AUTH_METADATA', true)
  on conflict (id) do nothing;

  if v.officer_id is not null then
    update public.officers
       set user_id = p_user
     where id = v.officer_id;
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.create_activation_code(uuid, text, text) to anon, authenticated;
grant execute on function public.check_activation_code(text, text) to anon, authenticated;
grant execute on function public.complete_activation(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- YOUR one-time Super Administrator code - copy the result!
-- ------------------------------------------------------------
select public.create_activation_code(null, 'Super Administrator', 'activate')
  as bootstrap_admin_code;
