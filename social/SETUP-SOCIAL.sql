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

select 'SHIBA SOCIAL schema ready' as result;
