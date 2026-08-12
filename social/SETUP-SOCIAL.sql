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
  created_at timestamp with time zone default now()
);

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
create or replace function public.social_register(
  p_user uuid,
  p_username text,
  p_display_name text default null
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

  insert into public.social_profiles (user_id, display_name)
  values (p_user, coalesce(nullif(trim(p_display_name), ''), p_username))
  on conflict (user_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.social_register(uuid, text, text)
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

select 'SHIBA SOCIAL schema ready' as result;
