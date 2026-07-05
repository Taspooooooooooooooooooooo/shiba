-- ============================================================
-- SHIBA PIMS - PATCH 2 (one-time, run after SETUP-AUTH.sql)
-- Run in the Supabase dashboard: SQL Editor -> Run
--
-- Activation now works with the CODE ALONE - officers no
-- longer need to type their Officer ID. If an Officer ID is
-- entered anyway (Advanced settings), it must match the code.
-- ============================================================

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
   limit 1;

  if v.id is null then
    return json_build_object('valid', false);
  end if;

  -- optional double-check: a typed Officer ID must match the code
  if p_officer_public is not null and trim(p_officer_public) <> '' then

    if v.officer_public_id is null
       or upper(v.officer_public_id) <> upper(trim(p_officer_public)) then
      return json_build_object('valid', false);
    end if;

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

select 'PATCH 2 applied - activation works with the code alone' as result;
