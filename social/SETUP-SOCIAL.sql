-- ============================================================
-- SHIBA SOCIAL - schema (one-time, run in Supabase SQL Editor)
--
-- A small-community photo + story app that SHARES the SHIBA
-- account system (public.users) with PIMS. Signing up here
-- creates a normal SHIBA account with NO officer — the police
-- side stays gated behind the existing activation flow, which
-- is UNCHANGED (complete_activation already upserts users with
-- "on conflict (id) do nothing", so a social account can later
-- be activated into an officer with no edits to that flow).
--
-- Photos live in the existing public "cloud" storage bucket
-- under a social/ path prefix. Safe to run more than once.
-- ============================================================

-- social profile — extends the shared account with social bits
create table if not exists public.social_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  avatar_path text,
  bio text,
  date_of_birth date,
  email text,
  phone text,
  created_at timestamp with time zone default now()
);

-- columns added over time (safe on existing databases)
alter table public.social_profiles
  add column if not exists date_of_birth date;
alter table public.social_profiles
  add column if not exists email text;
alter table public.social_profiles
  add column if not exists phone text;

-- a photo post in the (global, for now) community feed
create table if not exists public.social_posts (
  id uuid not null default gen_random_uuid(),
  author_id uuid references public.users(id) on delete cascade,
  image_url text not null,
  image_path text,
  caption text,
  created_at timestamp with time zone default now(),
  constraint social_posts_pkey primary key (id)
);
create index if not exists social_posts_created_idx
  on public.social_posts (created_at desc);
create index if not exists social_posts_author_idx
  on public.social_posts (author_id);

-- a post can have a title/name and counts views
alter table public.social_posts
  add column if not exists title text;
alter table public.social_posts
  add column if not exists view_count integer not null default 0;

-- atomic view bump (returns the new count)
create or replace function public.increment_post_views(p_post_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.social_posts
     set view_count = coalesce(view_count, 0) + 1
   where id = p_post_id
  returning view_count;
$$;

grant execute on function public.increment_post_views(uuid)
  to anon, authenticated;

create table if not exists public.social_likes (
  id uuid not null default gen_random_uuid(),
  post_id uuid references public.social_posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  constraint social_likes_pkey primary key (id),
  constraint social_likes_unique unique (post_id, user_id)
);
create index if not exists social_likes_post_idx
  on public.social_likes (post_id);

create table if not exists public.social_comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid references public.social_posts(id) on delete cascade,
  author_id uuid references public.users(id) on delete cascade,
  body text not null,
  created_at timestamp with time zone default now(),
  constraint social_comments_pkey primary key (id)
);
create index if not exists social_comments_post_idx
  on public.social_comments (post_id);

-- 24h ephemeral photo stories
create table if not exists public.social_stories (
  id uuid not null default gen_random_uuid(),
  author_id uuid references public.users(id) on delete cascade,
  image_url text not null,
  image_path text,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone not null
    default (now() + interval '24 hours'),
  constraint social_stories_pkey primary key (id)
);
create index if not exists social_stories_expires_idx
  on public.social_stories (expires_at);

-- ------------------------------------------------------------
-- self-signup: create the shared SHIBA account (users row) +
-- social profile. Called AFTER the client makes the Supabase
-- auth user. Does NOT touch the officer/activation flow.
-- ------------------------------------------------------------
-- drop older signatures so the name resolves unambiguously to the
-- newest one below (records display name, DOB, email and phone).
drop function if exists public.social_register(uuid, text, text);
drop function if exists public.social_register(uuid, text, text, date);

create or replace function public.social_register(
  p_user uuid,
  p_username text,
  p_display_name text default null,
  p_dob date default null,
  p_email text default null,
  p_phone text default null
)
returns json
language plpgsql
security definer
as $$
begin
  insert into public.users (id, username, password_hash, pin_hash, active)
  values (p_user, lower(trim(p_username)),
          'SUPABASE_AUTH', 'IN_AUTH_METADATA', true)
  on conflict (id) do nothing;

  insert into public.social_profiles
    (user_id, display_name, date_of_birth, email, phone)
  values (p_user,
          coalesce(nullif(trim(p_display_name), ''), p_username),
          p_dob,
          nullif(trim(p_email), ''),
          nullif(trim(p_phone), ''))
  on conflict (user_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

grant execute on function
  public.social_register(uuid, text, text, date, text, text)
  to anon, authenticated;

-- best-effort cleanup of expired stories (called opportunistically
-- from the app; a scheduled job can be added later)
create or replace function public.purge_expired_stories()
returns void
language sql
security definer
as $$
  delete from public.social_stories where expires_at < now();
$$;

grant execute on function public.purge_expired_stories()
  to anon, authenticated;

-- ============================================================
-- S3 — social graph (follows), privacy & badges
-- ============================================================

-- who follows whom. A "friend" is a mutual follow (A→B and B→A).
create table if not exists public.social_follows (
  id uuid not null default gen_random_uuid(),
  follower_id uuid references public.users(id) on delete cascade,
  following_id uuid references public.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  constraint social_follows_pkey primary key (id),
  constraint social_follows_unique unique (follower_id, following_id),
  constraint social_follows_no_self check (follower_id <> following_id)
);
create index if not exists social_follows_follower_idx
  on public.social_follows (follower_id);
create index if not exists social_follows_following_idx
  on public.social_follows (following_id);

-- profile: privacy, a verified flag, and per-badge visibility.
-- Each badge visibility is 'public' | 'friends' | 'hidden'.
alter table public.social_profiles
  add column if not exists is_private boolean default false;
alter table public.social_profiles
  add column if not exists is_verified boolean default false;
alter table public.social_profiles
  add column if not exists badge_officer_vis text default 'public';
alter table public.social_profiles
  add column if not exists badge_admin_vis text default 'public';
alter table public.social_profiles
  add column if not exists badge_verified_vis text default 'public';

-- derived badges (officer / admin) for a set of users. SECURITY
-- DEFINER so the public site can read just these two booleans
-- without exposing the officers/permissions tables.
--   Officer = the account is linked to an officer record.
--   Admin   = that officer holds an active 'socialmedia.admin'
--             permission grant (granted in their PIMS file).
create or replace function public.social_badges(p_user_ids uuid[])
returns table(user_id uuid, is_officer boolean, is_admin boolean)
language sql
security definer
set search_path = public
as $$
  select u.id,
         (o.id is not null) as is_officer,
         coalesce(exists(
           select 1
             from public.permission_grants pg
            where pg.officer_id = o.id
              and pg.permission = 'socialmedia.admin'
              and pg.revoked_at is null
              and pg.expires_at > now()
         ), false) as is_admin
  from public.users u
  left join public.officers o on o.user_id = u.id
  where u.id = any(p_user_ids);
$$;

grant execute on function public.social_badges(uuid[]) to anon, authenticated;

-- ============================================================
-- S5 — moderation: an auto-flag bot + admin review + bans
-- ============================================================

-- banned terms the bot looks for (admin-managed; the actual word
-- list lives here in the DB, NOT in the public repo).
create table if not exists public.social_mod_terms (
  id uuid not null default gen_random_uuid(),
  term text not null,
  category text not null default 'Hate ideology',
  active boolean not null default true,
  created_by text,
  created_at timestamp with time zone default now(),
  constraint social_mod_terms_pkey primary key (id)
);
create unique index if not exists social_mod_terms_uniq
  on public.social_mod_terms (lower(term));

-- terms the bot LEARNED are safe (added when an admin marks a
-- flag as False). The bot skips these on future scans.
create table if not exists public.social_mod_allow (
  id uuid not null default gen_random_uuid(),
  term text not null,
  created_by text,
  created_at timestamp with time zone default now(),
  constraint social_mod_allow_pkey primary key (id)
);
create unique index if not exists social_mod_allow_uniq
  on public.social_mod_allow (lower(term));

-- a flag the bot raised on a post, awaiting admin review. Keeps a
-- snapshot so the record survives the post being deleted.
create table if not exists public.social_flags (
  id uuid not null default gen_random_uuid(),
  post_id uuid references public.social_posts(id) on delete set null,
  author_id uuid references public.users(id) on delete set null,
  category text,
  matched text,                    -- comma-joined matched terms
  reason text,                     -- human summary of why it flagged
  snapshot_title text,
  snapshot_caption text,
  snapshot_image text,
  status text not null default 'Pending',  -- Pending|Confirmed|Cancelled|False
  reviewed_by text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint social_flags_pkey primary key (id)
);
create index if not exists social_flags_status_idx
  on public.social_flags (status, created_at desc);

-- a punishment issued on Confirm, tied to the offender's contacts
-- so a ban follows the email / phone / IP. RLS-locked: only the
-- SECURITY DEFINER functions below can read or write it (the PII
-- must never be listable from the browser).
create table if not exists public.social_punishments (
  id uuid not null default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  post_id uuid,
  email text,
  phone text,
  ip text,
  category text,
  reason text,
  issued_by text,
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  constraint social_punishments_pkey primary key (id)
);
alter table public.social_punishments enable row level security;

-- profile: ban flag + the IP captured at signup (for enforcement)
alter table public.social_profiles
  add column if not exists banned boolean default false;
alter table public.social_profiles
  add column if not exists banned_reason text;
alter table public.social_profiles
  add column if not exists signup_ip text;

-- is this email / phone / ip under an active punishment?
create or replace function public.social_check_banned(
  p_email text, p_phone text, p_ip text)
returns boolean
language sql security definer set search_path = public
as $$
  select exists(
    select 1 from public.social_punishments
     where active
       and (
         (nullif(trim(p_email),'') is not null
            and lower(email) = lower(trim(p_email)))
      or (nullif(regexp_replace(coalesce(p_phone,''),'\D','','g'),'') is not null
            and regexp_replace(coalesce(phone,''),'\D','','g')
                = regexp_replace(coalesce(p_phone,''),'\D','','g'))
      or (nullif(trim(p_ip),'') is not null and ip = trim(p_ip))
       )
  );
$$;
grant execute on function public.social_check_banned(text,text,text)
  to anon, authenticated;

-- who counts as a Social admin (linked officer + active grant)
create or replace function public.social_is_admin(p_user uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.officers o
    join public.permission_grants pg on pg.officer_id = o.id
    where o.user_id = p_user
      and pg.permission = 'socialmedia.admin'
      and pg.revoked_at is null and pg.expires_at > now());
$$;
grant execute on function public.social_is_admin(uuid) to anon, authenticated;

-- CONFIRM: punish the author (record email/phone/ip), ban them,
-- delete the post, and resolve the flag. Admins only.
create or replace function public.social_confirm_flag(
  p_flag uuid, p_reason text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_flag record; v_prof record; v_admin uuid := auth.uid();
        v_by text;
begin
  if not public.social_is_admin(v_admin) then
    return json_build_object('ok', false, 'reason', 'not authorized');
  end if;
  select username into v_by from public.users where id = v_admin;
  select * into v_flag from public.social_flags where id = p_flag;
  if v_flag.id is null then
    return json_build_object('ok', false, 'reason', 'flag not found');
  end if;
  select * into v_prof from public.social_profiles where user_id = v_flag.author_id;
  insert into public.social_punishments
    (user_id, post_id, email, phone, ip, category, reason, issued_by)
  values (v_flag.author_id, v_flag.post_id, v_prof.email, v_prof.phone,
          v_prof.signup_ip, v_flag.category,
          coalesce(p_reason, v_flag.reason), v_by);
  update public.social_profiles
     set banned = true, banned_reason = coalesce(p_reason, v_flag.category)
   where user_id = v_flag.author_id;
  if v_flag.post_id is not null then
    delete from public.social_posts where id = v_flag.post_id;
  end if;
  update public.social_flags
     set status = 'Confirmed', reviewed_at = now(), reviewed_by = v_by
   where id = p_flag;
  return json_build_object('ok', true);
end; $$;
grant execute on function public.social_confirm_flag(uuid, text) to authenticated;

-- CANCEL: dismiss the flag, keep the post. Admins only.
create or replace function public.social_cancel_flag(p_flag uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_by text;
begin
  if not public.social_is_admin(v_admin) then
    return json_build_object('ok', false, 'reason', 'not authorized');
  end if;
  select username into v_by from public.users where id = v_admin;
  update public.social_flags
     set status = 'Cancelled', reviewed_at = now(), reviewed_by = v_by
   where id = p_flag;
  return json_build_object('ok', true);
end; $$;
grant execute on function public.social_cancel_flag(uuid) to authenticated;

-- FALSE: mark a false positive, keep the post, and TEACH the bot
-- by allow-listing the matched terms. Admins only.
create or replace function public.social_false_flag(p_flag uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_by text; v_matched text; t text;
begin
  if not public.social_is_admin(v_admin) then
    return json_build_object('ok', false, 'reason', 'not authorized');
  end if;
  select username into v_by from public.users where id = v_admin;
  select matched into v_matched from public.social_flags where id = p_flag;
  if v_matched is not null then
    foreach t in array string_to_array(v_matched, ',') loop
      if length(trim(t)) > 0 then
        insert into public.social_mod_allow (term, created_by)
        values (lower(trim(t)), v_by) on conflict do nothing;
      end if;
    end loop;
  end if;
  update public.social_flags
     set status = 'False', reviewed_at = now(), reviewed_by = v_by
   where id = p_flag;
  return json_build_object('ok', true);
end; $$;
grant execute on function public.social_false_flag(uuid) to authenticated;

-- starter banned terms (extremist / hate markers). Add your own
-- community-specific terms from the moderation page.
insert into public.social_mod_terms (term, category) values
  ('heil hitler','Hate ideology'),
  ('sieg heil','Hate ideology'),
  ('white power','Hate ideology'),
  ('racial holy war','Hate ideology'),
  ('1488','Hate ideology'),
  ('14 words','Hate ideology'),
  ('gas the','Violence / genocide'),
  ('ethnic cleansing','Violence / genocide'),
  ('master race','Hate ideology')
on conflict do nothing;

-- ============================================================
-- S6 — richer sanctions (ban / timeout / mute / warn) + admin
-- ============================================================

alter table public.social_punishments
  add column if not exists kind text default 'ban';
alter table public.social_punishments
  add column if not exists expires_at timestamp with time zone;

-- only active, non-expired BAN or TIMEOUT sanctions block signup
create or replace function public.social_check_banned(
  p_email text, p_phone text, p_ip text)
returns boolean
language sql security definer set search_path = public
as $$
  select exists(
    select 1 from public.social_punishments
     where active
       and coalesce(kind,'ban') in ('ban','timeout')
       and (expires_at is null or expires_at > now())
       and (
         (nullif(trim(p_email),'') is not null
            and lower(email)=lower(trim(p_email)))
      or (nullif(regexp_replace(coalesce(p_phone,''),'\D','','g'),'') is not null
            and regexp_replace(coalesce(phone,''),'\D','','g')
                = regexp_replace(coalesce(p_phone,''),'\D','','g'))
      or (nullif(trim(p_ip),'') is not null and ip=trim(p_ip))
       )
  );
$$;
grant execute on function public.social_check_banned(text,text,text)
  to anon, authenticated;

-- issue a sanction (admins only). p_minutes null = no expiry.
create or replace function public.social_sanction(
  p_user uuid, p_kind text, p_reason text default null,
  p_minutes integer default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_by text; v_prof record;
        v_exp timestamptz;
begin
  if not public.social_is_admin(v_admin) then
    return json_build_object('ok',false,'reason','not authorized'); end if;
  if p_kind not in ('ban','timeout','mute','warn') then
    return json_build_object('ok',false,'reason','bad kind'); end if;
  select username into v_by from public.users where id=v_admin;
  select * into v_prof from public.social_profiles where user_id=p_user;
  if p_minutes is not null and p_minutes>0 then
    v_exp := now() + make_interval(mins => p_minutes); end if;
  insert into public.social_punishments
    (user_id, kind, reason, email, phone, ip, issued_by, active, expires_at)
  values (p_user, p_kind, p_reason, v_prof.email, v_prof.phone,
          v_prof.signup_ip, v_by, true, v_exp);
  if p_kind='ban' then
    update public.social_profiles
       set banned=true, banned_reason=coalesce(p_reason,'Banned')
     where user_id=p_user;
  end if;
  return json_build_object('ok',true);
end; $$;
grant execute on function public.social_sanction(uuid,text,text,integer)
  to authenticated;

-- lift active sanctions of a kind (or all). Admins only.
create or replace function public.social_lift(p_user uuid, p_kind text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid();
begin
  if not public.social_is_admin(v_admin) then
    return json_build_object('ok',false,'reason','not authorized'); end if;
  update public.social_punishments set active=false
   where user_id=p_user and active and (p_kind is null or kind=p_kind);
  if p_kind is null or p_kind='ban' then
    update public.social_profiles set banned=false, banned_reason=null
     where user_id=p_user;
  end if;
  return json_build_object('ok',true);
end; $$;
grant execute on function public.social_lift(uuid,text) to authenticated;

-- the caller's own moderation status (so the app can enforce it)
create or replace function public.social_self_status()
returns json language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_block record; v_mute record; v_warn record;
begin
  if v_me is null then return json_build_object('blocked',false); end if;
  select * into v_block from public.social_punishments
   where user_id=v_me and active and coalesce(kind,'ban') in ('ban','timeout')
     and (expires_at is null or expires_at>now())
   order by created_at desc limit 1;
  select * into v_mute from public.social_punishments
   where user_id=v_me and active and kind='mute'
     and (expires_at is null or expires_at>now())
   order by created_at desc limit 1;
  select * into v_warn from public.social_punishments
   where user_id=v_me and active and kind='warn'
   order by created_at desc limit 1;
  return json_build_object(
    'blocked', v_block.id is not null,
    'block_kind', v_block.kind,
    'block_reason', v_block.reason,
    'block_until', v_block.expires_at,
    'muted', v_mute.id is not null,
    'mute_until', v_mute.expires_at,
    'warning', v_warn.reason);
end; $$;
grant execute on function public.social_self_status() to authenticated;

-- a user's sanction history (admins only)
create or replace function public.social_admin_sanctions(p_user uuid)
returns setof public.social_punishments
language sql security definer set search_path = public as $$
  select * from public.social_punishments
   where public.social_is_admin(auth.uid()) and user_id=p_user
   order by created_at desc;
$$;
grant execute on function public.social_admin_sanctions(uuid) to authenticated;

-- grant the owner (vladko) the Social admin permission (permanent)
insert into public.permission_grants
  (officer_id, permission, kind, reason, granted_by, expires_at)
select o.id, 'socialmedia.admin', 'Permanent',
       'SHIBA Social administrator', 'system', now() + interval '100 years'
from public.officers o
join public.users u on u.id = o.user_id
where u.username = 'vladko'
  and not exists (
    select 1 from public.permission_grants pg
     where pg.officer_id = o.id and pg.permission = 'socialmedia.admin'
       and pg.revoked_at is null and pg.expires_at > now());

select 'SHIBA SOCIAL schema ready' as result;
