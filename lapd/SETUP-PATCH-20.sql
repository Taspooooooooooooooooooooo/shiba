-- ============================================================
-- SHIBA PIMS - PATCH 20 (one-time, run for v0.41.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- PHASE 8 · Sprint 8.1 — Evidence backbone + Chain of Custody.
-- Evidence becomes a FIRST-CLASS object (bodycam is just one
-- type). Every piece carries a lifecycle status, its owning
-- officer + division, where it came from, lock + retention
-- fields, and — the heart of 8.1 — a full CHAIN OF CUSTODY:
-- who created / uploaded / viewed / attached / reviewed /
-- locked / archived it, forever.
--
--   * case_evidence  - extended into the evidence registry:
--       status, division_id, uploaded_by_officer, source,
--       bodycam_session_id, origin_shift_id, review + lock +
--       retention columns. case_id becomes optional (evidence
--       can exist before it's attached to a case).
--   * evidence_custody - the append-only custody log.
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- ---- extend case_evidence into the evidence registry ----

alter table public.case_evidence
  add column if not exists status text not null default 'Available';
alter table public.case_evidence
  add column if not exists division_id uuid
    references public.divisions(id) on delete set null;
alter table public.case_evidence
  add column if not exists uploaded_by_officer uuid
    references public.officers(id) on delete set null;
alter table public.case_evidence
  add column if not exists source text not null default 'Manual';
alter table public.case_evidence
  add column if not exists bodycam_session_id uuid
    references public.bodycam_sessions(id) on delete set null;
alter table public.case_evidence
  add column if not exists origin_shift_id uuid
    references public.shifts(id) on delete set null;
alter table public.case_evidence
  add column if not exists reviewed_at timestamp with time zone;
alter table public.case_evidence
  add column if not exists reviewed_by text;
alter table public.case_evidence
  add column if not exists locked boolean not null default false;
alter table public.case_evidence
  add column if not exists locked_by text;
alter table public.case_evidence
  add column if not exists locked_reason text;
alter table public.case_evidence
  add column if not exists locked_at timestamp with time zone;
alter table public.case_evidence
  add column if not exists retention_policy text not null default 'Standard';
alter table public.case_evidence
  add column if not exists retain_until date;
alter table public.case_evidence
  add column if not exists archived_at timestamp with time zone;

-- evidence survives a deleted / detached case (keep the chain intact)
alter table public.case_evidence
  drop constraint if exists case_evidence_case_id_fkey;
alter table public.case_evidence
  add constraint case_evidence_case_id_fkey
  foreign key (case_id) references public.cases(id) on delete set null;

create index if not exists case_evidence_status_idx
  on public.case_evidence (status);
create index if not exists case_evidence_division_idx
  on public.case_evidence (division_id);
create index if not exists case_evidence_officer_idx
  on public.case_evidence (uploaded_by_officer);

-- backfill lifecycle + division for rows created before this patch
update public.case_evidence ev
   set status = case when ev.case_id is not null
                     then 'Attached' else 'Available' end
 where ev.status is null or ev.status = 'Available';

update public.case_evidence ev
   set division_id = c.division_id
  from public.cases c
 where ev.case_id = c.id
   and ev.division_id is null
   and c.division_id is not null;

-- ---- the chain of custody ----

create table if not exists public.evidence_custody (
  id uuid not null default gen_random_uuid(),
  evidence_id uuid references public.case_evidence(id) on delete cascade,
  -- Created | Uploaded | Verified | Viewed | Attached | Detached
  -- | Reviewed | Locked | Unlocked | Downloaded | Archived
  action text not null,
  actor text,
  actor_officer_id uuid references public.officers(id) on delete set null,
  details text,
  created_at timestamp with time zone default now(),
  constraint evidence_custody_pkey primary key (id)
);

create index if not exists evidence_custody_evidence_idx
  on public.evidence_custody (evidence_id);

-- seed an opening custody trail for evidence that predates this patch
insert into public.evidence_custody (evidence_id, action, actor, details, created_at)
select ev.id, 'Created', ev.uploaded_by,
       'Backfilled from existing record', ev.created_at
  from public.case_evidence ev
 where not exists (
   select 1 from public.evidence_custody ec where ec.evidence_id = ev.id
 );

insert into public.evidence_custody (evidence_id, action, actor, details, created_at)
select ev.id, 'Attached', ev.uploaded_by,
       c.case_id, ev.created_at
  from public.case_evidence ev
  join public.cases c on c.id = ev.case_id
 where not exists (
   select 1 from public.evidence_custody ec
    where ec.evidence_id = ev.id and ec.action = 'Attached'
 );

select 'PATCH 20 applied - evidence registry + chain of custody ready' as result;
