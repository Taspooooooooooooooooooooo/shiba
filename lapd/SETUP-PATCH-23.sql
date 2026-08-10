-- ============================================================
-- SHIBA PIMS - PATCH 23 (one-time, run for v0.45.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- SHIBA Links — a link shortener built INTO PIMS (shared
-- accounts). Officers mint short slugs that redirect through
-- /s/?<slug>; each resolve bumps a click counter atomically.
--
--   * short_links       - slug -> target_url, owner, clicks, active
--   * resolve_short_link - security-definer RPC: bump clicks +
--     return the target for an active slug (used by /s/).
--
-- Safe to run more than once (idempotent).
-- ============================================================

create table if not exists public.short_links (
  id uuid not null default gen_random_uuid(),
  slug text not null unique,
  target_url text not null,
  title text,
  created_by text,
  owner_id uuid,
  clicks integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  constraint short_links_pkey primary key (id)
);

create index if not exists short_links_owner_idx
  on public.short_links (created_by);

-- Atomic resolve: increment the counter and hand back the target
-- for an ACTIVE slug (null when missing/disabled). Runs as the
-- anon redirector on /s/.
create or replace function public.resolve_short_link(p_slug text)
returns text
language plpgsql
security definer
as $$
declare v_url text;
begin
  update public.short_links
     set clicks = clicks + 1
   where slug = p_slug and active = true
   returning target_url into v_url;
  return v_url;
end;
$$;

grant execute on function public.resolve_short_link(text) to anon, authenticated;

select 'PATCH 23 applied - SHIBA Links (short_links + resolver) ready' as result;
