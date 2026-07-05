-- ============================================================
-- SHIBA PIMS - PATCH 1 (one-time, run after SETUP-AUTH.sql)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- 1. Fixes: officers with activation codes could not be
--    deleted (foreign key blocked it). Codes are now removed
--    automatically together with their officer.
-- 2. Removes the "Test Activation" officer left over from
--    end-to-end testing and gives its sequential IDs back.
-- ============================================================

alter table public.activation_codes
  drop constraint activation_codes_officer_id_fkey;

alter table public.activation_codes
  add constraint activation_codes_officer_id_fkey
  foreign key (officer_id) references public.officers(id)
  on delete cascade;

-- remove the test officer (its used activation code goes with it)
delete from public.officers where officer_id = 'OFCR-000001';

-- hand the test IDs back so your first real officer is 000001
update public.public_ids set current_number = 0
 where type in ('OFFICER', 'BADGE');

select 'PATCH 1 applied' as result;
