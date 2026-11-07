-- Optional migration: allow the Super Admin profile role used by the CREST
-- examination admin interface. Run in the CREST-EXAMINATION project only.
-- This preserves existing profile rows and existing teacher/admin roles.
begin;
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin', 'super_admin'));

create or replace function public.crest_exam_teacher_check()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Teacher sign-in is required.'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('teacher', 'admin', 'super_admin') then
    raise exception 'Teacher or administrator access is required.';
  end if;
  return auth.uid();
end;
$$;
commit;
