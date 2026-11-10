/* CREST STUDENT DELIVERY V2 — current examination_questions model
   Additive migration. Does not alter or drop legacy examination tables.
   Run in the CREST Examination Supabase project after master-code-5-polish.sql.
*/

-- Resolve the existing CREST student session without exposing student records.
CREATE OR REPLACE FUNCTION public.crest_online_student_id(p_session_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_phone text; v_student_id uuid;
BEGIN
  IF COALESCE(trim(p_session_token),'') = '' THEN
    RAISE EXCEPTION 'Student session is missing. Sign in to CREST Academy again.';
  END IF;
  SELECT s.phone INTO v_phone
  FROM public.crest_sessions s
  WHERE s.token = p_session_token
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Your student session has expired. Sign in again.'; END IF;
  SELECT c.exam_student_id INTO v_student_id
  FROM public.crest_students c WHERE c.phone = v_phone LIMIT 1;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Your student account is not ready for online examinations. Contact the school administrator.'; END IF;
  RETURN v_student_id;
END; $$;

ALTER TABLE public.crest_students ADD COLUMN IF NOT EXISTS exam_student_id uuid DEFAULT gen_random_uuid();
UPDATE public.crest_students SET exam_student_id=gen_random_uuid() WHERE exam_student_id IS NULL;
ALTER TABLE public.crest_students ALTER COLUMN exam_student_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crest_students_exam_student_id_v2_uidx ON public.crest_students(exam_student_id);

CREATE TABLE IF NOT EXISTS public.crest_online_exam_attempts_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  submitted_at timestamptz,
  automatic_marks numeric(10,2) NOT NULL DEFAULT 0,
  manual_marks numeric(10,2) NOT NULL DEFAULT 0,
  total_marks numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','pending_review','marked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crest_online_exam_attempts_v2_student_exam_idx
  ON public.crest_online_exam_attempts_v2(student_id, examination_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crest_online_exam_answers_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.crest_online_exam_attempts_v2(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.examination_questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.examination_question_options(id) ON DELETE SET NULL,
  answer_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.crest_online_exam_results_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.crest_online_exam_attempts_v2(id) ON DELETE CASCADE,
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  automatic_marks numeric(10,2) NOT NULL DEFAULT 0,
  manual_marks numeric(10,2) NOT NULL DEFAULT 0,
  total_marks numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending review',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crest_online_exam_attempts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crest_online_exam_answers_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crest_online_exam_results_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crest_online_exam_attempts_v2, public.crest_online_exam_answers_v2, public.crest_online_exam_results_v2 FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.crest_online_list_exams_v2(p_session_token text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid;
BEGIN
  v_student := public.crest_online_student_id(p_session_token);
  RETURN COALESCE((SELECT json_agg(json_build_object(
    'id',e.id,'title',e.title,'subject',e.subject,'duration_minutes',e.duration_minutes,
    'total_marks',e.total_marks,'instructions',e.instructions,'start_time',COALESCE(e.start_time,e.scheduled_at),'ends_at',e.ends_at
  ) ORDER BY COALESCE(e.start_time,e.scheduled_at) NULLS FIRST, e.created_at DESC)
  FROM public.examinations e
  WHERE lower(e.status)='published'
    AND (COALESCE(e.start_time,e.scheduled_at) IS NULL OR now() >= COALESCE(e.start_time,e.scheduled_at))
    AND (e.ends_at IS NULL OR now() <= e.ends_at)
    AND EXISTS (SELECT 1 FROM public.examination_questions q WHERE q.examination_id=e.id)), '[]'::json);
END; $$;

CREATE OR REPLACE FUNCTION public.crest_online_start_exam_v2(p_session_token text,p_exam_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid; v_exam public.examinations%rowtype; v_attempt uuid; v_deadline timestamptz; v_prior integer;
BEGIN
  v_student := public.crest_online_student_id(p_session_token);
  SELECT * INTO v_exam FROM public.examinations e WHERE e.id=p_exam_id AND lower(e.status)='published'
    AND (COALESCE(e.start_time,e.scheduled_at) IS NULL OR now() >= COALESCE(e.start_time,e.scheduled_at))
    AND (e.ends_at IS NULL OR now() <= e.ends_at);
  IF NOT FOUND THEN RAISE EXCEPTION 'This examination is not available at the moment.'; END IF;
  SELECT count(*) INTO v_prior FROM public.crest_online_exam_attempts_v2
    WHERE examination_id=p_exam_id AND student_id=v_student AND status IN ('submitted','pending_review','marked');
  IF v_prior >= 1 THEN RAISE EXCEPTION 'You have already submitted this examination.'; END IF;
  IF EXISTS (SELECT 1 FROM public.crest_online_exam_attempts_v2 WHERE examination_id=p_exam_id AND student_id=v_student AND status='in_progress') THEN
    SELECT id,deadline INTO v_attempt,v_deadline FROM public.crest_online_exam_attempts_v2
      WHERE examination_id=p_exam_id AND student_id=v_student AND status='in_progress' ORDER BY started_at DESC LIMIT 1;
    IF now() > v_deadline THEN
      UPDATE public.crest_online_exam_attempts_v2 SET status='submitted',submitted_at=now() WHERE id=v_attempt;
    ELSE
      RETURN json_build_object('attempt_id',v_attempt,'deadline',v_deadline,'title',v_exam.title,'instructions',v_exam.instructions);
    END IF;
  END IF;
  v_deadline := now() + make_interval(mins => COALESCE(v_exam.duration_minutes,60));
  IF v_exam.ends_at IS NOT NULL THEN v_deadline := LEAST(v_deadline,v_exam.ends_at); END IF;
  INSERT INTO public.crest_online_exam_attempts_v2(examination_id,student_id,deadline,total_marks)
    VALUES(p_exam_id,v_student,v_deadline,COALESCE(v_exam.total_marks,0)) RETURNING id INTO v_attempt;
  RETURN json_build_object('attempt_id',v_attempt,'deadline',v_deadline,'title',v_exam.title,'instructions',v_exam.instructions);
END; $$;

CREATE OR REPLACE FUNCTION public.crest_online_get_questions_v2(p_session_token text,p_attempt_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid; v_exam uuid; v_deadline timestamptz;
BEGIN
  v_student := public.crest_online_student_id(p_session_token);
  SELECT examination_id,deadline INTO v_exam,v_deadline FROM public.crest_online_exam_attempts_v2
    WHERE id=p_attempt_id AND student_id=v_student AND status='in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'Examination attempt not found or already submitted.'; END IF;
  IF now()>v_deadline THEN RAISE EXCEPTION 'The examination time has expired.'; END IF;
  RETURN COALESCE((SELECT json_agg(json_build_object(
    'id',q.id,'question_order',q.question_order,'question_text',q.question_text,
    'question_type',q.question_type,'marks',q.marks,'image_url',q.image_url,
    'options',COALESCE((SELECT json_agg(json_build_object('id',o.id,'label',o.option_label,'text',o.option_text) ORDER BY o.option_label)
      FROM public.examination_question_options o WHERE o.question_id=q.id),'[]'::json)
  ) ORDER BY q.question_order)
  FROM public.examination_questions q WHERE q.examination_id=v_exam),'[]'::json);
END; $$;

CREATE OR REPLACE FUNCTION public.crest_online_save_answer_v2(
  p_session_token text,p_attempt_id uuid,p_question_id uuid,p_selected_option_id uuid DEFAULT NULL,p_answer_text text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid; v_exam uuid; v_deadline timestamptz;
BEGIN
  v_student := public.crest_online_student_id(p_session_token);
  SELECT examination_id,deadline INTO v_exam,v_deadline FROM public.crest_online_exam_attempts_v2
    WHERE id=p_attempt_id AND student_id=v_student AND status='in_progress';
  IF NOT FOUND OR now()>v_deadline THEN RAISE EXCEPTION 'Attempt is no longer active.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_questions WHERE id=p_question_id AND examination_id=v_exam) THEN
    RAISE EXCEPTION 'Question does not belong to this examination.';
  END IF;
  IF p_selected_option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.examination_question_options WHERE id=p_selected_option_id AND question_id=p_question_id
  ) THEN RAISE EXCEPTION 'Selected option is invalid for this question.'; END IF;
  INSERT INTO public.crest_online_exam_answers_v2(attempt_id,question_id,selected_option_id,answer_text,updated_at)
    VALUES(p_attempt_id,p_question_id,p_selected_option_id,NULLIF(trim(COALESCE(p_answer_text,'')),''),now())
  ON CONFLICT(attempt_id,question_id) DO UPDATE SET
    selected_option_id=EXCLUDED.selected_option_id,answer_text=EXCLUDED.answer_text,updated_at=now();
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.crest_online_submit_exam_v2(p_session_token text,p_attempt_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid; v_exam uuid; v_deadline timestamptz; v_auto numeric; v_total numeric; v_manual_count integer; v_status text;
BEGIN
  v_student := public.crest_online_student_id(p_session_token);
  SELECT examination_id,deadline INTO v_exam,v_deadline FROM public.crest_online_exam_attempts_v2
    WHERE id=p_attempt_id AND student_id=v_student AND status='in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found or already submitted.'; END IF;
  SELECT COALESCE(SUM(q.marks),0) INTO v_total FROM public.examination_questions q WHERE q.examination_id=v_exam;
  SELECT COALESCE(SUM(CASE WHEN o.is_correct THEN q.marks ELSE 0 END),0) INTO v_auto
    FROM public.examination_questions q
    LEFT JOIN public.crest_online_exam_answers_v2 a ON a.question_id=q.id AND a.attempt_id=p_attempt_id
    LEFT JOIN public.examination_question_options o ON o.id=a.selected_option_id AND o.question_id=q.id
    WHERE q.examination_id=v_exam AND q.question_type IN ('multiple_choice','true_false');
  SELECT count(*) INTO v_manual_count FROM public.examination_questions q
    WHERE q.examination_id=v_exam AND q.question_type IN ('short_answer','essay');
  v_status := CASE WHEN v_manual_count>0 THEN 'pending review' ELSE 'marked' END;
  UPDATE public.crest_online_exam_attempts_v2 SET submitted_at=now(),automatic_marks=v_auto,
    total_marks=v_total,status=CASE WHEN v_manual_count>0 THEN 'pending_review' ELSE 'marked' END
    WHERE id=p_attempt_id;
  INSERT INTO public.crest_online_exam_results_v2(attempt_id,examination_id,student_id,automatic_marks,total_marks,status)
    VALUES(p_attempt_id,v_exam,v_student,v_auto,v_total,v_status)
    ON CONFLICT(attempt_id) DO UPDATE SET automatic_marks=EXCLUDED.automatic_marks,total_marks=EXCLUDED.total_marks,status=EXCLUDED.status;
  RETURN json_build_object('automatic_marks',v_auto,'total_marks',v_total,'status',v_status,
    'percentage',CASE WHEN v_total=0 THEN 0 ELSE round(v_auto/v_total*100,1) END);
END; $$;

CREATE OR REPLACE FUNCTION public.crest_teacher_publish_exam_v2(p_exam_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid; v_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examinations WHERE id=p_exam_id AND created_by=v_uid AND lower(status)='draft') THEN
    RAISE EXCEPTION 'Draft examination not found or you do not own it.';
  END IF;
  SELECT count(*) INTO v_count FROM public.examination_questions WHERE examination_id=p_exam_id;
  IF v_count=0 THEN RAISE EXCEPTION 'Add at least one question before publishing.'; END IF;
  UPDATE public.examinations SET status='published',updated_at=now() WHERE id=p_exam_id AND created_by=v_uid;
  RETURN 'published';
END; $$;

REVOKE ALL ON FUNCTION public.crest_online_student_id(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crest_online_list_exams_v2(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crest_online_start_exam_v2(text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crest_online_get_questions_v2(text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crest_online_save_answer_v2(text,uuid,uuid,uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crest_online_submit_exam_v2(text,uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.crest_teacher_publish_exam_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crest_teacher_publish_exam_v2(uuid) TO authenticated;
