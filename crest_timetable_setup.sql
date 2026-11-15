-- CREST Academy weekly timetable
-- Already run successfully in the MAIN CREST Supabase project.
-- Kept here for reference only; do not run again unless troubleshooting.

create table if not exists public.crest_timetable (
  id uuid primary key default gen_random_uuid(),
  day text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  period integer not null check (period between 1 and 5),
  start_time time not null,
  end_time time not null,
  subject text not null,
  teacher text not null default '',
  room text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crest_timetable_day_period_unique unique(day,period),
  constraint crest_timetable_valid_time check (end_time > start_time)
);
alter table public.crest_timetable enable row level security;
revoke all on public.crest_timetable from anon, authenticated;

create or replace function public.crest_timetable_public()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by
    case t.day when 'Monday' then 1 when 'Tuesday' then 2 when 'Wednesday' then 3 when 'Thursday' then 4 else 5 end,
    t.period), '[]'::jsonb)
  from public.crest_timetable t where t.published = true;
$$;

create or replace function public.crest_timetable_admin_list(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.admin_check(p_key), false) then raise exception 'Administrator authentication required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by
    case t.day when 'Monday' then 1 when 'Tuesday' then 2 when 'Wednesday' then 3 when 'Thursday' then 4 else 5 end,
    t.period) from public.crest_timetable t), '[]'::jsonb);
end;
$$;

create or replace function public.crest_timetable_admin_save(p_key text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not coalesce(public.admin_check(p_key), false) then raise exception 'Administrator authentication required'; end if;
  if nullif(trim(p_entry->>'subject'),'') is null then raise exception 'Subject is required'; end if;
  if (p_entry->>'day') not in ('Monday','Tuesday','Wednesday','Thursday','Friday') then raise exception 'Invalid day'; end if;
  if (p_entry->>'period')::integer not between 1 and 5 then raise exception 'Invalid period'; end if;
  if (p_entry->>'end_time')::time <= (p_entry->>'start_time')::time then raise exception 'End time must be after start time'; end if;
  v_id := nullif(p_entry->>'id','')::uuid;
  if v_id is null then
    insert into public.crest_timetable(day,period,start_time,end_time,subject,teacher,room,published)
    values(p_entry->>'day',(p_entry->>'period')::integer,(p_entry->>'start_time')::time,(p_entry->>'end_time')::time,
      trim(p_entry->>'subject'),coalesce(p_entry->>'teacher',''),coalesce(p_entry->>'room',''),coalesce((p_entry->>'published')::boolean,false))
    on conflict(day,period) do update set start_time=excluded.start_time,end_time=excluded.end_time,subject=excluded.subject,
      teacher=excluded.teacher,room=excluded.room,published=excluded.published,updated_at=now()
    returning id into v_id;
  else
    update public.crest_timetable set day=p_entry->>'day',period=(p_entry->>'period')::integer,
      start_time=(p_entry->>'start_time')::time,end_time=(p_entry->>'end_time')::time,subject=trim(p_entry->>'subject'),
      teacher=coalesce(p_entry->>'teacher',''),room=coalesce(p_entry->>'room',''),published=coalesce((p_entry->>'published')::boolean,false),updated_at=now()
    where id=v_id;
    if not found then raise exception 'Timetable entry not found'; end if;
  end if;
  return (select to_jsonb(t) from public.crest_timetable t where t.id=v_id);
end;
$$;

create or replace function public.crest_timetable_admin_delete(p_key text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.admin_check(p_key), false) then raise exception 'Administrator authentication required'; end if;
  delete from public.crest_timetable where id=p_id;
  return found;
end;
$$;

create or replace function public.crest_timetable_admin_publish_all(p_key text, p_published boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not coalesce(public.admin_check(p_key), false) then raise exception 'Administrator authentication required'; end if;
  update public.crest_timetable set published=p_published,updated_at=now();
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.crest_timetable_public() to anon, authenticated;
grant execute on function public.crest_timetable_admin_list(text) to anon, authenticated;
grant execute on function public.crest_timetable_admin_save(text,jsonb) to anon, authenticated;
grant execute on function public.crest_timetable_admin_delete(text,uuid) to anon, authenticated;
grant execute on function public.crest_timetable_admin_publish_all(text,boolean) to anon, authenticated;
notify pgrst, 'reload schema';
