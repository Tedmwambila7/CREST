-- CREST private lesson storage migration
-- Applied to Supabase project otjybdiyoqnsynjbofuj on 2026-11-26.
-- Teacher uploads remain under pending/teachers/<teacher-id> until admin approval.
-- Admin approval moves them to published/ before writing the published path to lesson records.

alter table public.crest_voice_lessons
  add column if not exists audio_storage_bucket text,
  add column if not exists audio_storage_path text,
  add column if not exists audio_file_name text;

alter table public.crest_video_lessons
  add column if not exists video_storage_bucket text,
  add column if not exists video_storage_path text,
  add column if not exists video_file_name text;

create or replace function public.crest_voice_admin_save(p_key text,p_lesson jsonb)
returns boolean language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare v_id text; v_url text; v_bucket text; v_path text;
begin
 perform public.crest_need_admin(p_key);
 v_id:=coalesce(nullif(p_lesson->>'id',''),'voice-'||gen_random_uuid()::text);
 v_url:=coalesce(p_lesson->>'audio_url',''); v_bucket:=nullif(p_lesson->>'audio_storage_bucket',''); v_path:=nullif(p_lesson->>'audio_storage_path','');
 if coalesce(v_url,'') !~ '^https://' and not (v_bucket='crest-lesson-media' and coalesce(v_path,'') like 'published/%') then raise exception 'A valid private audio file or secure audio URL is required'; end if;
 insert into public.crest_voice_lessons(id,subject,topic,lesson_number,audio_url,audio_public_id,audio_storage_bucket,audio_storage_path,audio_file_name,published,updated_at)
 values(v_id,trim(p_lesson->>'subject'),trim(p_lesson->>'topic'),(p_lesson->>'lesson_number')::integer,coalesce(v_url,''),p_lesson->>'audio_public_id',v_bucket,v_path,p_lesson->>'audio_file_name',coalesce((p_lesson->>'published')::boolean,false),now())
 on conflict(id) do update set subject=excluded.subject,topic=excluded.topic,lesson_number=excluded.lesson_number,audio_url=excluded.audio_url,audio_public_id=excluded.audio_public_id,audio_storage_bucket=excluded.audio_storage_bucket,audio_storage_path=excluded.audio_storage_path,audio_file_name=excluded.audio_file_name,published=excluded.published,updated_at=now();
 return true;
end $function$;

create or replace function public.crest_video_admin_save(p_key text,p_lesson jsonb)
returns boolean language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare v_id text; v_url text; v_bucket text; v_path text;
begin
 perform public.crest_need_admin(p_key);
 v_id:=coalesce(nullif(p_lesson->>'id',''),'video-'||gen_random_uuid()::text);
 v_url:=coalesce(p_lesson->>'video_url','');v_bucket:=nullif(p_lesson->>'video_storage_bucket','');v_path:=nullif(p_lesson->>'video_storage_path','');
 if coalesce(v_url,'') !~ '^https://' and not (v_bucket='crest-lesson-media' and coalesce(v_path,'') like 'published/%') then raise exception 'A valid private video file or secure video URL is required'; end if;
 if nullif(trim(p_lesson->>'subject'),'') is null or nullif(trim(p_lesson->>'topic'),'') is null then raise exception 'Subject and topic are required'; end if;
 if coalesce((p_lesson->>'lesson_number')::integer,0)<1 then raise exception 'Lesson number must be positive'; end if;
 insert into public.crest_video_lessons(id,subject,topic,lesson_number,video_url,video_public_id,video_storage_bucket,video_storage_path,video_file_name,published,updated_at)
 values(v_id,trim(p_lesson->>'subject'),trim(p_lesson->>'topic'),(p_lesson->>'lesson_number')::integer,coalesce(v_url,''),p_lesson->>'video_public_id',v_bucket,v_path,p_lesson->>'video_file_name',coalesce((p_lesson->>'published')::boolean,false),now())
 on conflict(id) do update set subject=excluded.subject,topic=excluded.topic,lesson_number=excluded.lesson_number,video_url=excluded.video_url,video_public_id=excluded.video_public_id,video_storage_bucket=excluded.video_storage_bucket,video_storage_path=excluded.video_storage_path,video_file_name=excluded.video_file_name,published=excluded.published,updated_at=now();
 return true;
end $function$;

create or replace function public.admin_approval_set_storage_path(p_key text,p_item_id uuid,p_bucket text,p_path text)
returns boolean language plpgsql security definer set search_path to 'public','extensions'
as $function$
begin
 perform public.crest_need_admin(p_key);
 if p_bucket<>'crest-lesson-media' or coalesce(p_path,'') not like 'published/%' then raise exception 'Only published CREST lesson files can be attached to an approval item.'; end if;
 update public.crest_approval_items set payload=payload||jsonb_build_object('storage_bucket',p_bucket,'storage_path',p_path),updated_at=now()
 where id=p_item_id and status='pending_admin' and submitter_role='teacher';
 if not found then raise exception 'The teacher submission is no longer awaiting approval.'; end if;
 return true;
end $function$;
revoke all on function public.admin_approval_set_storage_path(text,uuid,text,text) from public;
grant execute on function public.admin_approval_set_storage_path(text,uuid,text,text) to anon,authenticated;

-- The live admin_approval_action() was updated to accept published storage_bucket/storage_path
-- for lesson, voice_lesson and video_lesson items and copy those references into the
-- corresponding crest_resources / crest_voice_lessons / crest_video_lessons records.


-- Allow teachers to submit private files from their own pending folder.
create or replace function public.teacher_submit_material(p_token text,p_item_type text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare v_teacher uuid;v_id uuid;v_title text;v_subject text;v_url text;v_bucket text;v_path text;
begin
 select t.id into v_teacher from public.crest_teacher_sessions s join public.crest_teacher_accounts t on t.id=s.teacher_id where s.token=p_token and t.is_active=true;
 if v_teacher is null then raise exception 'Teacher session expired. Please sign in again.'; end if;
 if p_item_type not in ('lesson','assignment','voice_lesson','video_lesson') then raise exception 'Unsupported submission type.'; end if;
 if length(coalesce(p_payload::text,''))>50000 then raise exception 'Submission is too large.'; end if;
 v_title:=trim(coalesce(p_payload->>'title',''));v_subject:=trim(coalesce(p_payload->>'subject',''));
 if v_title='' or v_subject='' then raise exception 'Enter a title and subject.'; end if;
 if p_item_type='lesson' and coalesce(p_payload->>'level','') not in ('Junior','Senior') then raise exception 'Choose Junior or Senior level.'; end if;
 v_url:=coalesce(p_payload->>'file_url','');v_bucket:=coalesce(p_payload->>'storage_bucket','');v_path:=coalesce(p_payload->>'storage_path','');
 if p_item_type in ('lesson','voice_lesson','video_lesson') and v_url !~ '^https://' and not (v_bucket='crest-lesson-media' and v_path like 'pending/teachers/'||v_teacher::text||'/%') then raise exception 'Upload a lesson file or provide a secure HTTPS link.'; end if;
 if p_item_type in ('voice_lesson','video_lesson') and trim(coalesce(p_payload->>'topic',''))='' then raise exception 'Enter the lesson topic.'; end if;
 insert into public.crest_approval_items(submitter_role,submitter_teacher_id,item_type,status,title,subject,payload)
 values('teacher',v_teacher,p_item_type,'pending_admin',v_title,v_subject,coalesce(p_payload,'{}'::jsonb)) returning id into v_id;
 insert into public.crest_approval_events(item_id,actor_role,actor_label,action)
 select v_id,'teacher',t.full_name,'submitted' from public.crest_teacher_accounts t where t.id=v_teacher;
 return v_id;
end $function$;
