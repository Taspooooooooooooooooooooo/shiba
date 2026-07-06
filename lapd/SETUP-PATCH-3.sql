-- ============================================================
-- SHIBA PIMS - PATCH 3 (one-time, run before/with v0.7.0)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- v0.7.0 starts writing real audit logs and notifications.
-- Audit history must SURVIVE deletions: when an officer or
-- user account is removed, their audit/notification rows stay
-- (the text columns keep the details) - only the dead link is
-- cleared. Without this, deleting an audited officer fails.
-- ============================================================

alter table public.audit_logs
  drop constraint if exists audit_logs_officer_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_officer_id_fkey
  foreign key (officer_id) references public.officers(id)
  on delete set null;

alter table public.audit_logs
  drop constraint if exists audit_logs_user_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_user_id_fkey
  foreign key (user_id) references public.users(id)
  on delete set null;

alter table public.notifications
  drop constraint if exists notifications_receiver_id_fkey;

alter table public.notifications
  add constraint notifications_receiver_id_fkey
  foreign key (receiver_id) references public.users(id)
  on delete set null;

alter table public.notifications
  drop constraint if exists notifications_sender_id_fkey;

alter table public.notifications
  add constraint notifications_sender_id_fkey
  foreign key (sender_id) references public.users(id)
  on delete set null;

select 'PATCH 3 applied - audit history survives deletions' as result;
