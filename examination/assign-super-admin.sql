-- CRESTACADA: assign the Super Admin role to an EXISTING Supabase Auth account.
-- 1) First create/confirm your account in Supabase Authentication > Users.
-- 2) Replace the email below with the exact email of YOUR account.
-- 3) Run this in the SQL Editor of the SAME Supabase project used by examinations.
--
-- This script does not create an Auth user, does not change passwords, and does
-- not grant teacher/admin privileges to anyone else. It only updates the role
-- for the matching existing profile. It intentionally stops if no profile exists.

do $$
declare
  v_admin_email text := lower(trim('REPLACE_WITH_YOUR_ADMIN_EMAIL'));
  v_user_id uuid;
begin
  if v_admin_email = 'replace_with_your_admin_email' or v_admin_email = '' then
    raise exception 'Edit v_admin_email with your real Supabase Auth email before running.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = v_admin_email
  limit 1;

  if v_user_id is null then
    raise exception 'No Supabase Auth user found for %. Create the account first.', v_admin_email;
  end if;

  update public.profiles
     set role = 'super_admin'
   where id = v_user_id;

  if not found then
    raise exception 'Auth user exists, but no matching public.profiles row exists. Stop and inspect the profiles setup; no profile was created.';
  end if;
end
$$;

-- Verify the role assignment:
select u.email, p.id, p.full_name, p.role
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('REPLACE_WITH_YOUR_ADMIN_EMAIL');
