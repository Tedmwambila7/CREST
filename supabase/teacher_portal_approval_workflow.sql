
-- CREST Academy teacher portal and administrator approval workflow.
-- Additive migration; existing student/admin data is preserved.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.crest_teacher_accounts (
 id uuid primary key default gen_random_uuid(), full_name text not null, email text not null,
 subject text not null default '', password_hash text not null, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists crest_teacher_accounts_email_lower_uq on public.crest_teacher_accounts(lower(email));
create table if not exists public.crest_teacher_sessions (
 token text primary key, teacher_id uuid not null references public.crest_teacher_accounts(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists crest_teacher_sessions_teacher_idx on public.crest_teacher_sessions(teacher_id);
create table if not exists public.crest_approval_items (
 id uuid primary key default gen_random_uuid(), source_item_id text unique,
 parent_id uuid references public.crest_approval_items(id) on delete set null,
 submitter_role text not null check(submitter_role in ('student','teacher')),
 submitter_teacher_id uuid references public.crest_teacher_accounts(id) on delete set null,
 submitter_phone text, assigned_teacher_id uuid references public.crest_teacher_accounts(id) on delete set null,
 item_type text not null check(item_type in ('question','assignment_submission','lesson','assignment','teacher_response','assignment_mark')),
 status text not null default 'pending_admin' check(status in ('pending_admin','forwarded','responded_pending_admin','approved','published','rejected','returned_for_correction')),
 title text not null default '', subject text not null default '', payload jsonb not null default '{}'::jsonb,
 review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crest_approval_items_status_created_idx on public.crest_approval_items(status,created_at desc);
create index if not exists crest_approval_items_teacher_status_idx on public.crest_approval_items(assigned_teacher_id,status,created_at desc);
create index if not exists crest_approval_items_submitter_phone_idx on public.crest_approval_items(submitter_phone,created_at desc);
create index if not exists crest_approval_items_parent_idx on public.crest_approval_items(parent_id);
create index if not exists crest_approval_items_submitter_teacher_idx on public.crest_approval_items(submitter_teacher_id);
create table if not exists public.crest_approval_events (
 id bigint generated always as identity primary key,
 item_id uuid not null references public.crest_approval_items(id) on delete cascade,
 actor_role text not null check(actor_role in ('admin','teacher','system')),
 actor_label text not null default '', action text not null, notes text, created_at timestamptz not null default now()
);
create index if not exists crest_approval_events_item_created_idx on public.crest_approval_events(item_id,created_at desc);
alter table public.crest_teacher_accounts enable row level security;
alter table public.crest_teacher_sessions enable row level security;
alter table public.crest_approval_items enable row level security;
alter table public.crest_approval_events enable row level security;
revoke all on public.crest_teacher_accounts,public.crest_teacher_sessions,public.crest_approval_items,public.crest_approval_events from anon,authenticated;
drop policy if exists crest_teacher_accounts_deny_api on public.crest_teacher_accounts;
create policy crest_teacher_accounts_deny_api on public.crest_teacher_accounts for all to anon,authenticated using(false) with check(false);
drop policy if exists crest_teacher_sessions_deny_api on public.crest_teacher_sessions;
create policy crest_teacher_sessions_deny_api on public.crest_teacher_sessions for all to anon,authenticated using(false) with check(false);
drop policy if exists crest_approval_items_deny_api on public.crest_approval_items;
create policy crest_approval_items_deny_api on public.crest_approval_items for all to anon,authenticated using(false) with check(false);
drop policy if exists crest_approval_events_deny_api on public.crest_approval_events;
create policy crest_approval_events_deny_api on public.crest_approval_events for all to anon,authenticated using(false) with check(false);


CREATE OR REPLACE FUNCTION public.admin_add_teacher(p_key text, p_full_name text, p_email text, p_subject text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id uuid;
begin
  perform public.crest_need_admin(p_key);
  if length(trim(coalesce(p_full_name,''))) < 3 then raise exception 'Enter the teacher full name.'; end if;
  if lower(trim(coalesce(p_email,''))) !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Enter a valid teacher email address.';
  end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'Temporary password must be at least 8 characters.'; end if;
  if exists (select 1 from public.crest_teacher_accounts where lower(email)=lower(trim(p_email))) then
    raise exception 'A teacher with this email already exists.';
  end if;
  insert into public.crest_teacher_accounts(full_name,email,subject,password_hash)
  values (regexp_replace(trim(p_full_name), '\s+', ' ', 'g'), lower(trim(p_email)),
          trim(coalesce(p_subject,'')), extensions.crypt(p_password, extensions.gen_salt('bf')))
  returning id into v_id;
  return jsonb_build_object('id',v_id,'message','Teacher account created successfully.');
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_approval_action(p_key text, p_item_id uuid, p_action text, p_teacher_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_target text DEFAULT 'all'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_item public.crest_approval_items%rowtype;
  v_parent public.crest_approval_items%rowtype;
  v_teacher public.crest_teacher_accounts%rowtype;
  v_target text;
  v_phone text;
  v_sender text;
  v_id text;
  v_ts bigint := (extract(epoch from now())*1000)::bigint;
  v_data jsonb;
  v_score numeric;
  v_out_of numeric;
begin
  perform public.crest_need_admin(p_key);
  select * into v_item from public.crest_approval_items where id=p_item_id for update;
  if not found then raise exception 'Approval item not found.'; end if;

  if p_action='forward' then
    if v_item.item_type not in ('question','assignment_submission') then
      raise exception 'Only student questions and assignment submissions can be forwarded.';
    end if;
    select * into v_teacher from public.crest_teacher_accounts
      where id=p_teacher_id and is_active=true;
    if not found then raise exception 'Choose an active teacher.'; end if;
    update public.crest_approval_items
      set status='forwarded',assigned_teacher_id=v_teacher.id,review_note=null,updated_at=now()
      where id=v_item.id;
    insert into public.crest_approval_events(item_id,actor_role,actor_label,action,notes)
      values(v_item.id,'admin','CREST Admin','forwarded_to_teacher',v_teacher.full_name);
    return true;
  elsif p_action='reject' then
    update public.crest_approval_items
      set status='rejected',review_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now()
      where id=v_item.id;
    if v_item.parent_id is not null then
      update public.crest_approval_items set status='forwarded',updated_at=now()
        where id=v_item.parent_id and status='responded_pending_admin';
    end if;
    insert into public.crest_approval_events(item_id,actor_role,actor_label,action,notes)
      values(v_item.id,'admin','CREST Admin','rejected',p_note);
    return true;
  elsif p_action='return' then
    update public.crest_approval_items
      set status='returned_for_correction',review_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now()
      where id=v_item.id;
    insert into public.crest_approval_events(item_id,actor_role,actor_label,action,notes)
      values(v_item.id,'admin','CREST Admin','returned_for_correction',p_note);
    return true;
  elsif p_action<>'approve' then
    raise exception 'Unsupported approval action.';
  end if;

  if v_item.status<>'pending_admin' then raise exception 'This item is not awaiting administrator approval.'; end if;

  if v_item.item_type='lesson' then
    if coalesce(v_item.payload->>'file_url','') !~ '^https://' then raise exception 'Lesson link is missing or invalid.'; end if;
    if coalesce(v_item.payload->>'level','') not in ('Junior','Senior') then raise exception 'Lesson level is missing.'; end if;
    insert into public.crest_resources(
      id,title,subject,topic,level,file_url,file_name,file_type,file_size,published,updated_at
    ) values (
      'teacher-'||replace(v_item.id::text,'-',''),
      v_item.title,v_item.subject,coalesce(v_item.payload->>'topic',''),
      v_item.payload->>'level',v_item.payload->>'file_url',
      coalesce(nullif(v_item.payload->>'file_name',''),v_item.title),
      coalesce(nullif(v_item.payload->>'file_type',''),'application/octet-stream'),
      nullif(v_item.payload->>'file_size','')::bigint,true,now()
    )
    on conflict (id) do update set published=true,updated_at=now(),
      title=excluded.title,subject=excluded.subject,topic=excluded.topic,
      level=excluded.level,file_url=excluded.file_url,file_name=excluded.file_name,
      file_type=excluded.file_type,file_size=excluded.file_size;
    update public.crest_approval_items set status='published',updated_at=now() where id=v_item.id;

  elsif v_item.item_type='assignment' then
    v_target := coalesce(nullif(trim(p_target),''),nullif(trim(v_item.payload->>'to'),''),'all');
    if v_target<>'all' and not exists(select 1 from public.crest_students where phone=v_target) then
      raise exception 'The selected student phone number does not exist.';
    end if;
    v_id := 'a'||encode(extensions.gen_random_bytes(8),'hex');
    v_data := v_item.payload || jsonb_build_object(
      'id',v_id,'kind','assignment','to',v_target,'ts',v_ts
    );
    insert into public.crest_items(id,coll,phone,ts,data)
      values(v_id,'work',null,v_ts,v_data);
    update public.crest_approval_items set status='published',updated_at=now() where id=v_item.id;

  elsif v_item.item_type='teacher_response' then
    select * into v_parent from public.crest_approval_items where id=v_item.parent_id;
    v_phone := coalesce(v_parent.submitter_phone,v_item.submitter_phone);
    if v_phone is null then raise exception 'The student destination could not be found.'; end if;
    select full_name into v_sender from public.crest_teacher_accounts where id=v_item.submitter_teacher_id;
    v_id := 'm'||encode(extensions.gen_random_bytes(8),'hex');
    v_data := jsonb_build_object(
      'id',v_id,'phone',v_phone,'sender',coalesce(v_sender,'CREST Teacher'),
      'isTeacher',true,'to',v_phone,'ts',v_ts,
      'time',to_char(now() at time zone 'utc','HH24:MI'),
      'message',v_item.payload->>'response'
    );
    insert into public.crest_items(id,coll,phone,ts,data) values(v_id,'chat',v_phone,v_ts,v_data);
    update public.crest_approval_items set status='approved',updated_at=now() where id=v_item.id;
    update public.crest_approval_items set status='approved',updated_at=now() where id=v_item.parent_id;

  elsif v_item.item_type='assignment_mark' then
    select * into v_parent from public.crest_approval_items where id=v_item.parent_id;
    v_phone := coalesce(v_parent.submitter_phone,v_item.submitter_phone);
    if v_phone is null then raise exception 'The student destination could not be found.'; end if;
    v_score := (v_item.payload->>'score')::numeric;
    v_out_of := (v_item.payload->>'out_of')::numeric;
    v_id := 'g'||encode(extensions.gen_random_bytes(8),'hex');
    v_data := jsonb_build_object(
      'id',v_id,'kind','grade','title',v_parent.title,'subject',v_parent.subject,
      'to',v_phone,'score',v_score,'outOf',v_out_of,
      'grade',coalesce(v_item.payload->>'grade',''),
      'remarks',coalesce(v_item.payload->>'remarks',''),
      'date',to_char(now(),'DD Mon YYYY'),'ts',v_ts
    );
    insert into public.crest_items(id,coll,phone,ts,data) values(v_id,'work',v_phone,v_ts,v_data);
    update public.crest_approval_items set status='approved',updated_at=now() where id=v_item.id;
    update public.crest_approval_items set status='approved',updated_at=now() where id=v_item.parent_id;

  else
    raise exception 'Student submissions and questions must be forwarded to a teacher, not published.';
  end if;

  insert into public.crest_approval_events(item_id,actor_role,actor_label,action,notes)
    values(v_item.id,'admin','CREST Admin','approved',p_note);
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_approval_list(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform public.crest_need_admin(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'item_type',a.item_type,'title',a.title,'subject',a.subject,
      'payload',a.payload,'status',a.status,'submitter_role',a.submitter_role,
      'submitter_phone',a.submitter_phone,'assigned_teacher_id',a.assigned_teacher_id,
      'created_at',a.created_at,'parent_id',a.parent_id,
      'parent',case when p.id is null then null else jsonb_build_object(
        'id',p.id,'item_type',p.item_type,'title',p.title,'subject',p.subject,
        'submitter_phone',p.submitter_phone,'payload',p.payload
      ) end
    ) order by a.created_at)
    from public.crest_approval_items a
    left join public.crest_approval_items p on p.id=a.parent_id
    where a.status='pending_admin'
  ),'[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_teacher_password(p_key text, p_teacher_id uuid, p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform public.crest_need_admin(p_key);
  if length(coalesce(p_password,'')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  update public.crest_teacher_accounts
    set password_hash=extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at=now()
    where id=p_teacher_id;
  if not found then return false; end if;
  delete from public.crest_teacher_sessions where teacher_id=p_teacher_id;
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_teacher_active(p_key text, p_teacher_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform public.crest_need_admin(p_key);
  update public.crest_teacher_accounts
    set is_active=coalesce(p_active,false), updated_at=now()
    where id=p_teacher_id;
  if not found then return false; end if;
  if not coalesce(p_active,false) then
    delete from public.crest_teacher_sessions where teacher_id=p_teacher_id;
  end if;
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_teachers(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform public.crest_need_admin(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'full_name', full_name, 'email', email, 'subject', subject,
      'is_active', is_active, 'created_at', created_at
    ) order by full_name)
    from public.crest_teacher_accounts
  ), '[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.student_put_item(p_token text, p_coll text, p_item jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  me text := public.crest_me(p_token);
  nm text;
  it jsonb;
  v_type text;
  v_approval_id uuid;
  v_assignment jsonb;
  v_title text;
  v_subject text;
begin
  if me is null then raise exception 'Session expired'; end if;
  if p_coll not in ('chat','work') then raise exception 'Not allowed'; end if;
  if length(p_item::text)>20000 then raise exception 'Message too large'; end if;
  select name into nm from public.crest_students where phone=me;
  it := p_item || jsonb_build_object('phone',me);
  if p_coll='chat' then
    it := it || jsonb_build_object('isTeacher',false);
    v_type := 'question';
    v_title := left(coalesce(nullif(it->>'message',''),'Student question'),140);
    v_subject := coalesce(it->>'subject','');
  else
    if coalesce(p_item->>'kind','')<>'submission' then raise exception 'Not allowed'; end if;
    it := it || jsonb_build_object('name',nm);
    v_type := 'assignment_submission';
    select data into v_assignment
      from public.crest_items
      where coll='work' and id=it->>'assignmentId' and data->>'kind'='assignment'
      limit 1;
    v_title := coalesce(nullif(v_assignment->>'title',''),nullif(it->>'title',''),'Student assignment submission');
    v_subject := coalesce(nullif(v_assignment->>'subject',''),nullif(it->>'subject',''),'');
    it := it || jsonb_build_object(
      'assignmentTitle',v_title,
      'assignmentSubject',v_subject,
      'assignmentDescription',coalesce(v_assignment->>'description','')
    );
  end if;
  insert into public.crest_items(id,coll,phone,ts,data)
  values(it->>'id',p_coll,me,coalesce((it->>'ts')::bigint,(extract(epoch from now())*1000)::bigint),it)
  on conflict(id) do nothing;
  insert into public.crest_approval_items(
    source_item_id,submitter_role,submitter_phone,item_type,status,title,subject,payload
  ) values (
    it->>'id','student',me,v_type,'pending_admin',
    coalesce(v_title,'Student submission'),coalesce(v_subject,''),it
  )
  on conflict(source_item_id) do nothing
  returning id into v_approval_id;
  if v_approval_id is not null then
    insert into public.crest_approval_events(item_id,actor_role,actor_label,action)
    values(v_approval_id,'student',coalesce(nm,'Student'),'submitted');
  end if;
  if p_coll='chat' then perform public.crest_trim_chat(); end if;
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.teacher_inbox(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_teacher uuid;
begin
  select t.id into v_teacher
  from public.crest_teacher_sessions s
  join public.crest_teacher_accounts t on t.id=s.teacher_id
  where s.token=p_token and t.is_active=true;
  if v_teacher is null then raise exception 'Teacher session expired. Please sign in again.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'item_type',a.item_type,'title',a.title,'subject',a.subject,
      'payload',a.payload,'submitter_phone',a.submitter_phone,
      'created_at',a.created_at,'parent_id',a.parent_id
    ) order by a.created_at)
    from public.crest_approval_items a
    where a.assigned_teacher_id=v_teacher and a.status='forwarded'
  ),'[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.teacher_login(p_email text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_teacher public.crest_teacher_accounts%rowtype; v_token text;
begin
  select * into v_teacher from public.crest_teacher_accounts
    where lower(email)=lower(trim(coalesce(p_email,''))) and is_active=true;
  if not found then return null; end if;
  if v_teacher.password_hash <> extensions.crypt(coalesce(p_password,''), v_teacher.password_hash) then
    return null;
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.crest_teacher_sessions(token,teacher_id) values(v_token,v_teacher.id);
  return jsonb_build_object(
    'token',v_token,'id',v_teacher.id,'name',v_teacher.full_name,
    'email',v_teacher.email,'subject',v_teacher.subject
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.teacher_logout(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with deleted as (delete from public.crest_teacher_sessions where token=p_token returning 1)
  select true
$function$;

CREATE OR REPLACE FUNCTION public.teacher_me(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'id',t.id,'name',t.full_name,'email',t.email,'subject',t.subject
  )
  from public.crest_teacher_sessions s
  join public.crest_teacher_accounts t on t.id=s.teacher_id
  where s.token=p_token and t.is_active=true
$function$;

CREATE OR REPLACE FUNCTION public.teacher_my_submissions(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_teacher uuid;
begin
  select t.id into v_teacher
  from public.crest_teacher_sessions s
  join public.crest_teacher_accounts t on t.id=s.teacher_id
  where s.token=p_token and t.is_active=true;
  if v_teacher is null then raise exception 'Teacher session expired. Please sign in again.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'item_type',a.item_type,'title',a.title,'subject',a.subject,
      'status',a.status,'review_note',a.review_note,'created_at',a.created_at
    ) order by a.created_at desc)
    from (
      select id,item_type,title,subject,status,review_note,created_at
      from public.crest_approval_items
      where submitter_teacher_id=v_teacher
      order by created_at desc
      limit 30
    ) a
  ),'[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.teacher_submit_mark(p_token text, p_parent_id uuid, p_score numeric, p_out_of numeric, p_grade text, p_remarks text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_teacher uuid; v_name text; v_parent public.crest_approval_items%rowtype; v_id uuid;
begin
  select t.id,t.full_name into v_teacher,v_name
  from public.crest_teacher_sessions s
  join public.crest_teacher_accounts t on t.id=s.teacher_id
  where s.token=p_token and t.is_active=true;
  if v_teacher is null then raise exception 'Teacher session expired. Please sign in again.'; end if;
  if p_out_of is null or p_out_of<=0 or p_score is null or p_score<0 or p_score>p_out_of then
    raise exception 'Enter valid marks: score must be between zero and the total marks.';
  end if;
  select * into v_parent from public.crest_approval_items
    where id=p_parent_id and item_type='assignment_submission'
      and assigned_teacher_id=v_teacher and status='forwarded'
    for update;
  if not found then raise exception 'This submission is no longer assigned to you.'; end if;
  insert into public.crest_approval_items(
    parent_id,submitter_role,submitter_teacher_id,submitter_phone,item_type,status,
    title,subject,payload
  ) values (
    v_parent.id,'teacher',v_teacher,v_parent.submitter_phone,'assignment_mark','pending_admin',
    'Mark: '||v_parent.title,v_parent.subject,
    jsonb_build_object('score',p_score,'out_of',p_out_of,'grade',trim(coalesce(p_grade,'')),
                       'remarks',trim(coalesce(p_remarks,'')),'teacher_name',v_name)
  ) returning id into v_id;
  update public.crest_approval_items set status='responded_pending_admin',updated_at=now() where id=v_parent.id;
  insert into public.crest_approval_events(item_id,actor_role,actor_label,action)
  values(v_id,'teacher',v_name,'mark_submitted');
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.teacher_submit_material(p_token text, p_item_type text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_teacher uuid; v_id uuid; v_title text; v_subject text;
begin
  select t.id into v_teacher
  from public.crest_teacher_sessions s
  join public.crest_teacher_accounts t on t.id=s.teacher_id
  where s.token=p_token and t.is_active=true;
  if v_teacher is null then raise exception 'Teacher session expired. Please sign in again.'; end if;
  if p_item_type not in ('lesson','assignment') then raise exception 'Unsupported submission type.'; end if;
  if length(coalesce(p_payload::text,'')) > 50000 then raise exception 'Submission is too large.'; end if;
  v_title := trim(coalesce(p_payload->>'title',''));
  v_subject := trim(coalesce(p_payload->>'subject',''));
  if v_title='' or v_subject='' then raise exception 'Enter a title and subject.'; end if;
  if p_item_type='lesson' then
    if coalesce(p_payload->>'level','') not in ('Junior','Senior') then raise exception 'Choose Junior or Senior level.'; end if;
    if coalesce(p_payload->>'file_url','') !~ '^https://' then raise exception 'Upload a lesson file or provide a secure HTTPS link.'; end if;
  end if;
  insert into public.crest_approval_items(
    submitter_role,submitter_teacher_id,item_type,status,title,subject,payload
  ) values ('teacher',v_teacher,p_item_type,'pending_admin',v_title,v_subject,coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;
  insert into public.crest_approval_events(item_id,actor_role,actor_label,action)
  select v_id,'teacher',t.full_name,'submitted'
  from public.crest_teacher_accounts t where t.id=v_teacher;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.teacher_submit_response(p_token text, p_parent_id uuid, p_response text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_teacher uuid; v_parent public.crest_approval_items%rowtype; v_name text; v_id uuid;
begin
  select t.id,t.full_name into v_teacher,v_name
  from public.crest_teacher_sessions s
  join public.crest_teacher_accounts t on t.id=s.teacher_id
  where s.token=p_token and t.is_active=true;
  if v_teacher is null then raise exception 'Teacher session expired. Please sign in again.'; end if;
  if length(trim(coalesce(p_response,''))) < 2 then raise exception 'Write a response before sending.'; end if;
  select * into v_parent from public.crest_approval_items
    where id=p_parent_id and item_type='question' and assigned_teacher_id=v_teacher and status='forwarded'
    for update;
  if not found then raise exception 'This question is no longer assigned to you.'; end if;
  insert into public.crest_approval_items(
    parent_id,submitter_role,submitter_teacher_id,submitter_phone,item_type,status,
    title,subject,payload
  ) values (
    v_parent.id,'teacher',v_teacher,v_parent.submitter_phone,'teacher_response','pending_admin',
    'Response: '||v_parent.title,v_parent.subject,
    jsonb_build_object('response',trim(p_response),'teacher_name',v_name)
  ) returning id into v_id;
  update public.crest_approval_items set status='responded_pending_admin',updated_at=now() where id=v_parent.id;
  insert into public.crest_approval_events(item_id,actor_role,actor_label,action)
  values(v_id,'teacher',v_name,'response_submitted');
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.student_items(p_token text, p_coll text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare me text := public.crest_me(p_token);
begin
  if me is null then raise exception 'Session expired'; end if;
  if p_coll='chat' then
    return coalesce((
      select jsonb_agg(data order by ts) from public.crest_items
      where coll='chat' and (
        phone=me or (
          (data->>'isTeacher')='true' and
          (coalesce(data->>'to','') in ('','all') or data->>'to'=me)
        )
      )
    ),'[]'::jsonb);
  elsif p_coll='work' then
    return coalesce((
      select jsonb_agg(
        case when ci.data->>'kind'='submission' then
          ci.data || jsonb_build_object(
            'reviewStatus',coalesce(a.status,'legacy'),
            'reviewNote',coalesce(a.review_note,'')
          )
        else ci.data end
        order by ci.ts
      )
      from public.crest_items ci
      left join public.crest_approval_items a on a.source_item_id=ci.id
      where ci.coll='work' and (
        ((ci.data->>'kind') in ('assignment','grade') and (ci.data->>'to' in ('all',me)))
        or ((ci.data->>'kind')='submission' and ci.phone=me)
      )
    ),'[]'::jsonb);
  end if;
  return '[]'::jsonb;
end
$function$;

revoke all on function public.student_items(text,text) from public;
grant execute on function public.student_items(text,text) to anon,authenticated;
revoke all on function public.admin_teachers(text) from public;
revoke all on function public.admin_add_teacher(text,text,text,text,text) from public;
revoke all on function public.admin_set_teacher_active(text,uuid,boolean) from public;
revoke all on function public.admin_reset_teacher_password(text,uuid,text) from public;
revoke all on function public.teacher_login(text,text) from public;
revoke all on function public.teacher_me(text) from public;
revoke all on function public.teacher_logout(text) from public;
revoke all on function public.teacher_inbox(text) from public;
revoke all on function public.teacher_my_submissions(text) from public;
revoke all on function public.teacher_submit_material(text,text,jsonb) from public;
revoke all on function public.teacher_submit_response(text,uuid,text) from public;
revoke all on function public.teacher_submit_mark(text,uuid,numeric,numeric,text,text) from public;
revoke all on function public.admin_approval_list(text) from public;
revoke all on function public.admin_approval_action(text,uuid,text,uuid,text,text) from public;
revoke all on function public.student_put_item(text,text,jsonb) from public;
grant execute on function public.admin_teachers(text) to anon,authenticated;
grant execute on function public.admin_add_teacher(text,text,text,text,text) to anon,authenticated;
grant execute on function public.admin_set_teacher_active(text,uuid,boolean) to anon,authenticated;
grant execute on function public.admin_reset_teacher_password(text,uuid,text) to anon,authenticated;
grant execute on function public.teacher_login(text,text) to anon,authenticated;
grant execute on function public.teacher_me(text) to anon,authenticated;
grant execute on function public.teacher_logout(text) to anon,authenticated;
grant execute on function public.teacher_inbox(text) to anon,authenticated;
grant execute on function public.teacher_my_submissions(text) to anon,authenticated;
grant execute on function public.teacher_submit_material(text,text,jsonb) to anon,authenticated;
grant execute on function public.teacher_submit_response(text,uuid,text) to anon,authenticated;
grant execute on function public.teacher_submit_mark(text,uuid,numeric,numeric,text,text) to anon,authenticated;
grant execute on function public.admin_approval_list(text) to anon,authenticated;
grant execute on function public.admin_approval_action(text,uuid,text,uuid,text,text) to anon,authenticated;
grant execute on function public.student_put_item(text,text,jsonb) to anon,authenticated;
