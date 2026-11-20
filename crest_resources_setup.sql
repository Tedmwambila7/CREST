-- CREST Academy: Junior / Senior Slides and Notes
-- Applied to the CREST Academy Supabase project.
create table if not exists public.crest_resources (
  id text primary key,
  title text not null check (char_length(trim(title)) between 1 and 180),
  subject text not null check (char_length(trim(subject)) between 1 and 100),
  topic text not null default '',
  level text not null check (level in ('Junior','Senior')),
  file_url text not null check (file_url ~ '^https://'),
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crest_resources_level_published_idx
  on public.crest_resources(level, published, created_at desc);
alter table public.crest_resources enable row level security;
revoke all on public.crest_resources from anon, authenticated;

create or replace function public.crest_resource_admin_list(p_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.crest_need_admin(p_key);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc)
    from public.crest_resources r), '[]'::jsonb);
end $$;

create or replace function public.crest_resource_admin_save(p_key text, p_resource jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id text := coalesce(nullif(trim(p_resource->>'id'), ''), 'resource-' || encode(gen_random_bytes(9), 'hex'));
  v_row public.crest_resources;
  v_level text := trim(coalesce(p_resource->>'level',''));
  v_url text := trim(coalesce(p_resource->>'file_url',''));
begin
  perform public.crest_need_admin(p_key);
  if v_level not in ('Junior','Senior') then raise exception 'Choose Junior or Senior'; end if;
  if v_url !~ '^https://' then raise exception 'A secure file URL is required'; end if;
  if nullif(trim(p_resource->>'title'),'') is null then raise exception 'Enter a resource title'; end if;
  if nullif(trim(p_resource->>'subject'),'') is null then raise exception 'Enter a subject'; end if;
  insert into public.crest_resources
    (id,title,subject,topic,level,file_url,file_name,file_type,file_size,published,updated_at)
  values (
    v_id, trim(p_resource->>'title'), trim(p_resource->>'subject'),
    coalesce(trim(p_resource->>'topic'),''), v_level, v_url,
    coalesce(nullif(trim(p_resource->>'file_name'),''), trim(p_resource->>'title')),
    coalesce(nullif(trim(p_resource->>'file_type'),''),'application/octet-stream'),
    nullif(p_resource->>'file_size','')::bigint,
    coalesce((p_resource->>'published')::boolean,false), now()
  )
  on conflict (id) do update set
    title=excluded.title, subject=excluded.subject, topic=excluded.topic,
    level=excluded.level, file_url=excluded.file_url, file_name=excluded.file_name,
    file_type=excluded.file_type, file_size=excluded.file_size,
    published=excluded.published, updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.crest_resource_admin_delete(p_key text, p_id text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.crest_need_admin(p_key);
  delete from public.crest_resources where id=p_id;
  return true;
end $$;

create or replace function public.crest_resource_student_list(p_token text, p_level text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_phone text := public.crest_me(p_token);
begin
  if v_phone is null then raise exception 'Session expired'; end if;
  if p_level not in ('Junior','Senior') then raise exception 'Choose Junior or Senior'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'title',r.title,'subject',r.subject,'topic',r.topic,
      'level',r.level,'file_url',r.file_url,'file_name',r.file_name,
      'file_type',r.file_type,'file_size',r.file_size,'created_at',r.created_at
    ) order by r.subject,r.topic,r.title)
    from public.crest_resources r
    where r.level=p_level and r.published=true
  ), '[]'::jsonb);
end $$;

revoke all on function public.crest_resource_admin_list(text) from public, anon, authenticated;
revoke all on function public.crest_resource_admin_save(text,jsonb) from public, anon, authenticated;
revoke all on function public.crest_resource_admin_delete(text,text) from public, anon, authenticated;
revoke all on function public.crest_resource_student_list(text,text) from public, anon, authenticated;
grant execute on function public.crest_resource_admin_list(text) to anon, authenticated;
grant execute on function public.crest_resource_admin_save(text,jsonb) to anon, authenticated;
grant execute on function public.crest_resource_admin_delete(text,text) to anon, authenticated;
grant execute on function public.crest_resource_student_list(text,text) to anon, authenticated;
