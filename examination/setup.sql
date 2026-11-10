-- LEGACY STUDENT-FLOW MIGRATION — NOT FOR ROUTINE USE WITH THE CURRENT SCHEMA.
-- This script targets the earlier crest_students/questions/answer_keys flow.
-- The current staff question editor uses examination_questions and
-- examination_question_options. Review README.txt before running this file.
-- Do not run this script simply to fix the current staff dashboard.
--
-- CREST examination module migration
-- Run once in Supabase SQL Editor after backing up your project.
-- This script reuses existing tables and adds server-side RPC functions.

begin;

-- Add a stable UUID identifier for legacy CREST students. Existing student
-- login remains based on crest_sessions token + phone.
alter table public.crest_students
  add column if not exists exam_student_id uuid default gen_random_uuid();

update public.crest_students
set exam_student_id = gen_random_uuid()
where exam_student_id is null;

alter table public.crest_students
  alter column exam_student_id set not null;

create unique index if not exists crest_students_exam_student_id_uidx
  on public.crest_students(exam_student_id);

-- Ensure only trusted server-side RPCs can access answer keys.
alter table public.answer_keys enable row level security;
alter table public.student_answers enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_results enable row level security;

-- Remove broad policies that might expose the answer key. Existing custom
-- policies on other tables are intentionally not dropped.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname='public' and tablename='answer_keys'
  loop
    execute format('drop policy if exists %I on public.answer_keys', p.policyname);
  end loop;
end $$;

-- Helpers: verify legacy student session and retrieve its UUID.
create or replace function public.crest_exam_student_uuid(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_phone text; v_id uuid;
begin
  if p_session_token is null or length(trim(p_session_token))=0 then
    raise exception 'Student session is missing. Sign in again.';
  end if;
  select s.phone into v_phone
  from public.crest_sessions s
  where s.token=p_session_token
  order by s.created_at desc limit 1;
  if v_phone is null then raise exception 'Student session is invalid. Sign in again.'; end if;
  select c.exam_student_id into v_id
  from public.crest_students c where c.phone=v_phone limit 1;
  if v_id is null then raise exception 'Student account was not found.'; end if;
  return v_id;
end;
$$;

create or replace function public.crest_exam_teacher_check()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Teacher sign-in is required.'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role not in ('teacher','admin') then raise exception 'Teacher or administrator access is required.'; end if;
  return auth.uid();
end;
$$;

-- Teacher: create a draft exam.
create or replace function public.crest_teacher_create_exam(
 p_title text, p_subject text, p_instructions text,
 p_duration_minutes integer, p_max_attempts integer,
 p_access_type text, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_teacher uuid; v_id uuid;
begin
 v_teacher:=public.crest_exam_teacher_check();
 if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_subject,'')))=0 then
   raise exception 'Title and subject are required.';
 end if;
 if p_duration_minutes not between 1 and 600 then raise exception 'Duration must be between 1 and 600 minutes.'; end if;
 if coalesce(p_max_attempts,1) not between 1 and 10 then raise exception 'Maximum attempts must be between 1 and 10.'; end if;
 if p_access_type not in ('code','open') then raise exception 'Invalid access type.'; end if;
 if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then raise exception 'End time must be after start time.'; end if;
 insert into public.examinations(title,subject,instructions,duration_minutes,max_attempts,access_code,access_type,status,starts_at,ends_at,created_by)
 values(trim(p_title),trim(p_subject),nullif(trim(coalesce(p_instructions,'')),''),p_duration_minutes,
 coalesce(p_max_attempts,1),case when p_access_type='code' then upper(substr(encode(gen_random_bytes(6),'hex'),1,8)) else null end,
 p_access_type,'draft',p_starts_at,p_ends_at,v_teacher)
 returning id into v_id;
 return v_id;
end;
$$;

-- Teacher: add MCQ and its correct answer atomically.
create or replace function public.crest_teacher_add_mcq(
 p_exam_id uuid,p_question_number integer,p_question_text text,
 p_option_a text,p_option_b text,p_option_c text,p_option_d text,
 p_correct_answer text,p_marks integer,p_explanation text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_teacher uuid; v_exam public.examinations%rowtype; v_q uuid;
begin
 v_teacher:=public.crest_exam_teacher_check();
 select * into v_exam from public.examinations where id=p_exam_id and created_by=v_teacher;
 if not found then raise exception 'Examination not found or you do not own it.'; end if;
 if v_exam.status<>'draft' then raise exception 'Questions can only be changed while the exam is a draft.'; end if;
 if p_question_number<1 or p_marks<1 or p_correct_answer not in ('A','B','C','D') then raise exception 'Check question number, marks and correct option.'; end if;
 if coalesce(trim(p_question_text),'')='' or coalesce(trim(p_option_a),'')='' or coalesce(trim(p_option_b),'')='' or coalesce(trim(p_option_c),'')='' or coalesce(trim(p_option_d),'')='' then raise exception 'Question and all four options are required.'; end if;
 insert into public.questions(examination_id,question_number,question_text,option_a,option_b,option_c,option_d,marks)
 values(p_exam_id,p_question_number,trim(p_question_text),trim(p_option_a),trim(p_option_b),trim(p_option_c),trim(p_option_d),p_marks)
 returning id into v_q;
 insert into public.answer_keys(question_id,correct_answer,explanation)
 values(v_q,p_correct_answer,nullif(trim(coalesce(p_explanation,'')),''));
 return v_q;
end;
$$;

-- Teacher: publish exam after confirming it has at least one keyed question.
create or replace function public.crest_teacher_publish_exam(p_exam_id uuid)
returns text
language plpgsql security definer set search_path=public
as $$
declare v_teacher uuid; v_code text; v_count integer;
begin
 v_teacher:=public.crest_exam_teacher_check();
 if not exists(select 1 from public.examinations where id=p_exam_id and created_by=v_teacher and status='draft') then
   raise exception 'Draft examination not found or you do not own it.';
 end if;
 select count(*) into v_count from public.questions q
 join public.answer_keys k on k.question_id=q.id where q.examination_id=p_exam_id;
 if v_count=0 then raise exception 'Add at least one question and answer key before publishing.'; end if;
 update public.examinations set status='published'
 where id=p_exam_id and created_by=v_teacher;
 select access_code into v_code from public.examinations where id=p_exam_id;
 return v_code;
end;
$$;

-- Student: start a new attempt. The server controls start time and deadline.
create or replace function public.crest_student_start_exam(p_session_token text,p_access_code text default null)
returns json
language plpgsql security definer set search_path=public
as $$
declare v_student uuid; v_exam public.examinations%rowtype; v_attempt uuid; v_num integer; v_deadline timestamptz;
begin
 v_student:=public.crest_exam_student_uuid(p_session_token);
 select * into v_exam from public.examinations e
 where e.status='published'
 and ((e.access_type='open') or (e.access_type='code' and upper(coalesce(e.access_code,''))=upper(coalesce(p_access_code,''))))
 and (e.starts_at is null or now()>=e.starts_at)
 and (e.ends_at is null or now()<=e.ends_at)
 order by e.created_at desc limit 1;
 if not found then raise exception 'No published examination matches that access code, or it is outside its scheduled time.'; end if;
 select count(*)+1 into v_num from public.exam_attempts
 where examination_id=v_exam.id and student_id=v_student;
 if v_num>coalesce(v_exam.max_attempts,1) then raise exception 'You have used all permitted attempts.'; end if;
 insert into public.exam_attempts(examination_id,student_id,attempt_number,started_at,result_status)
 values(v_exam.id,v_student,v_num,now(),'in_progress') returning id into v_attempt;
 v_deadline:=now()+make_interval(mins=>v_exam.duration_minutes);
 if v_exam.ends_at is not null then v_deadline:=least(v_deadline,v_exam.ends_at); end if;
 return json_build_object('attempt_id',v_attempt,'title',v_exam.title,'instructions',v_exam.instructions,'deadline',v_deadline);
end;
$$;

-- Student: fetch questions without answer keys.
create or replace function public.crest_student_get_questions(p_session_token text,p_attempt_id uuid)
returns json
language plpgsql security definer set search_path=public
as $$
declare v_student uuid; v_exam uuid; v_started timestamptz; v_duration integer; v_end timestamptz;
begin
 v_student:=public.crest_exam_student_uuid(p_session_token);
 select a.examination_id,a.started_at,e.duration_minutes,e.ends_at
 into v_exam,v_started,v_duration,v_end
 from public.exam_attempts a join public.examinations e on e.id=a.examination_id
 where a.id=p_attempt_id and a.student_id=v_student and a.result_status='in_progress';
 if not found then raise exception 'Attempt not found or already submitted.'; end if;
 if now()>least(v_started+make_interval(mins=>v_duration),coalesce(v_end,'infinity'::timestamptz)) then
   raise exception 'Examination time has expired.';
 end if;
 return (select coalesce(json_agg(json_build_object('id',q.id,'question_number',q.question_number,
 'question_text',q.question_text,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,'marks',q.marks)
 order by q.question_number),'[]'::json) from public.questions q where q.examination_id=v_exam);
end;
$$;

-- Student: save one selected option.
create or replace function public.crest_student_save_answer(
 p_session_token text,p_attempt_id uuid,p_question_id uuid,p_selected_answer text
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare v_student uuid; v_exam uuid; v_started timestamptz; v_duration integer; v_end timestamptz;
begin
 v_student:=public.crest_exam_student_uuid(p_session_token);
 if p_selected_answer is not null and p_selected_answer not in ('A','B','C','D') then raise exception 'Invalid answer option.'; end if;
 select a.examination_id,a.started_at,e.duration_minutes,e.ends_at into v_exam,v_started,v_duration,v_end
 from public.exam_attempts a join public.examinations e on e.id=a.examination_id
 where a.id=p_attempt_id and a.student_id=v_student and a.result_status='in_progress';
 if not found then raise exception 'Attempt not found or already submitted.'; end if;
 if now()>least(v_started+make_interval(mins=>v_duration),coalesce(v_end,'infinity'::timestamptz)) then raise exception 'Examination time has expired.'; end if;
 if not exists(select 1 from public.questions where id=p_question_id and examination_id=v_exam) then raise exception 'Question does not belong to this examination.'; end if;
 insert into public.student_answers(attempt_id,question_id,selected_answer,answered_at)
 values(p_attempt_id,p_question_id,p_selected_answer,now())
 on conflict (attempt_id,question_id) do update set selected_answer=excluded.selected_answer,answered_at=now();
 return true;
end;
$$;

-- Student: submit and mark on the server.
create or replace function public.crest_student_submit_exam(p_session_token text,p_attempt_id uuid)
returns json
language plpgsql security definer set search_path=public
as $$
declare v_student uuid; v_exam uuid; v_started timestamptz; v_duration integer; v_end timestamptz;
 v_total numeric; v_score numeric; v_pct numeric; v_result uuid;
begin
 v_student:=public.crest_exam_student_uuid(p_session_token);
 select a.examination_id,a.started_at,e.duration_minutes,e.ends_at into v_exam,v_started,v_duration,v_end
 from public.exam_attempts a join public.examinations e on e.id=a.examination_id
 where a.id=p_attempt_id and a.student_id=v_student and a.result_status='in_progress';
 if not found then raise exception 'Attempt not found or already submitted.'; end if;
 if now()>least(v_started+make_interval(mins=>v_duration),coalesce(v_end,'infinity'::timestamptz)) then
   -- Late submissions are still marked from answers already saved.
   null;
 end if;
 select coalesce(sum(q.marks),0) into v_total from public.questions q where q.examination_id=v_exam;
 select coalesce(sum(case when sa.selected_answer=ak.correct_answer then q.marks else 0 end),0)
 into v_score from public.questions q join public.answer_keys ak on ak.question_id=q.id
 left join public.student_answers sa on sa.question_id=q.id and sa.attempt_id=p_attempt_id
 where q.examination_id=v_exam;
 v_pct:=case when v_total=0 then 0 else round(v_score/v_total*100,2) end;
 update public.exam_attempts set submitted_at=now(),score=v_score,total_marks=v_total,percentage=v_pct,result_status='submitted'
 where id=p_attempt_id;
 insert into public.exam_results(attempt_id,student_id,examination_id,total_marks,marks_obtained,percentage,released_at)
 values(p_attempt_id,v_student,v_exam,v_total,v_score,v_pct,now()) returning id into v_result;
 return json_build_object('result_id',v_result,'marks_obtained',v_score,'total_marks',v_total,'percentage',v_pct);
end;
$$;

-- Allow the browser's anon/authenticated roles to call only the RPC endpoints.
revoke all on function public.crest_exam_student_uuid(text) from public, anon, authenticated;
revoke all on function public.crest_exam_teacher_check() from public, anon, authenticated;
grant execute on function public.crest_teacher_create_exam(text,text,text,integer,integer,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.crest_teacher_add_mcq(uuid,integer,text,text,text,text,text,text,integer,text) to authenticated;
grant execute on function public.crest_teacher_publish_exam(uuid) to authenticated;
grant execute on function public.crest_student_start_exam(text,text) to anon, authenticated;
grant execute on function public.crest_student_get_questions(text,uuid) to anon, authenticated;
grant execute on function public.crest_student_save_answer(text,uuid,uuid,text) to anon, authenticated;
grant execute on function public.crest_student_submit_exam(text,uuid) to anon, authenticated;

commit;

-- IMPORTANT POST-SETUP CHECK:
-- The student_answers table must have a UNIQUE constraint/index on
-- (attempt_id, question_id) for answer upsert to work. If it does not, run:
-- create unique index if not exists student_answers_attempt_question_uidx
-- on public.student_answers(attempt_id, question_id);

create unique index if not exists student_answers_attempt_question_uidx
on public.student_answers(attempt_id, question_id);


-- Browser read access: teachers can read only their own exam records/results.
-- All writes still go through the SECURITY DEFINER teacher RPC functions.
alter table public.examinations enable row level security;
alter table public.questions enable row level security;
alter table public.exam_results enable row level security;

drop policy if exists crest_teacher_read_own_examinations on public.examinations;
create policy crest_teacher_read_own_examinations
on public.examinations for select to authenticated
using (created_by = auth.uid());

drop policy if exists crest_teacher_read_own_questions on public.questions;
create policy crest_teacher_read_own_questions
on public.questions for select to authenticated
using (exists (
  select 1 from public.examinations e
  where e.id = questions.examination_id and e.created_by = auth.uid()
));

drop policy if exists crest_teacher_read_own_results on public.exam_results;
create policy crest_teacher_read_own_results
on public.exam_results for select to authenticated
using (exists (
  select 1 from public.examinations e
  where e.id = exam_results.examination_id and e.created_by = auth.uid()
));

-- Explicitly remove default PUBLIC execution from the public RPCs, then grant
-- only the intended roles.
revoke all on function public.crest_teacher_create_exam(text,text,text,integer,integer,text,timestamptz,timestamptz) from public, anon;
revoke all on function public.crest_teacher_add_mcq(uuid,integer,text,text,text,text,text,text,integer,text) from public, anon;
revoke all on function public.crest_teacher_publish_exam(uuid) from public, anon;
revoke all on function public.crest_student_start_exam(text,text) from public;
revoke all on function public.crest_student_get_questions(text,uuid) from public;
revoke all on function public.crest_student_save_answer(text,uuid,uuid,text) from public;
revoke all on function public.crest_student_submit_exam(text,uuid) from public;

grant execute on function public.crest_teacher_create_exam(text,text,text,integer,integer,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.crest_teacher_add_mcq(uuid,integer,text,text,text,text,text,text,integer,text) to authenticated;
grant execute on function public.crest_teacher_publish_exam(uuid) to authenticated;
grant execute on function public.crest_student_start_exam(text,text) to anon, authenticated;
grant execute on function public.crest_student_get_questions(text,uuid) to anon, authenticated;
grant execute on function public.crest_student_save_answer(text,uuid,uuid,text) to anon, authenticated;
grant execute on function public.crest_student_submit_exam(text,uuid) to anon, authenticated;
