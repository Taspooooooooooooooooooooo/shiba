-- ============================================================
-- SHIBA PIMS - PATCH 5 (one-time, run for v0.13.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Account Lock: after 5 wrong passwords an account locks for
-- 15 minutes. The login page checks the lock, counts failures,
-- and locks + audits automatically. Until this patch is run,
-- login works normally without the lock (graceful fallback).
-- ============================================================

alter table public.users
  add column if not exists failed_logins integer not null default 0;

alter table public.users
  add column if not exists locked_at timestamp with time zone;

-- Is this account currently locked? (returns minutes remaining)
create or replace function public.account_lock_status(p_username text)
returns json
language plpgsql
security definer
as $$
declare
  v record;
  v_remaining integer;
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
end;
$$;

-- Record a wrong password. Locks at 5. Returns lock state.
create or replace function public.register_failed_login(p_username text)
returns json
language plpgsql
security definer
as $$
declare
  v record;
  v_count integer;
begin
  select * into v from public.users
   where lower(username) = lower(trim(p_username)) limit 1;

  if v.id is null then
    return json_build_object('exists', false);
  end if;

  v_count := coalesce(v.failed_logins, 0) + 1;

  if v_count >= 5 then
    update public.users
       set failed_logins = v_count, locked_at = now()
     where id = v.id;
    return json_build_object('exists', true, 'locked', true,
      'user_id', v.id);
  end if;

  update public.users set failed_logins = v_count where id = v.id;

  return json_build_object('exists', true, 'locked', false,
    'failed', v_count, 'remaining', 5 - v_count);
end;
$$;

-- Clear counters after a good login.
create or replace function public.reset_failed_logins(p_user uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.users
     set failed_logins = 0, locked_at = null
   where id = p_user;
end;
$$;

grant execute on function public.account_lock_status(text) to anon, authenticated;
grant execute on function public.register_failed_login(text) to anon, authenticated;
grant execute on function public.reset_failed_logins(uuid) to anon, authenticated;

select 'PATCH 5 applied - account lock ready' as result;
