/* ================================================================
   CREST ACADEMY — UNIFIED TEACHER DASHBOARD SUPPORT
   Uses the confirmed workflow tables:
   examinations, questions, exam_attempts, student_answers, exam_results.
   Additive only: does not drop tables or delete student records.
   Run once in Supabase SQL Editor while signed in as project owner.
   ================================================================ */


/* Teacher-owned examination creation RPC used by create-exam.js. */
CREATE OR REPLACE FUNCTION public.crest_teacher_create_examination_v2(
  p_title text, p_subject text, p_subject_id uuid DEFAULT NULL,
  p_duration_minutes integer DEFAULT 60, p_total_marks numeric DEFAULT 0,
  p_pass_mark numeric DEFAULT 50, p_instructions text DEFAULT NULL,
  p_start_time timestamptz DEFAULT NULL, p_ends_at timestamptz DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_exam_id uuid; v_teacher_id uuid; v_email text; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  SELECT id INTO v_teacher_id FROM public.exam_teachers WHERE lower(email)=v_email LIMIT 1;
  SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
  IF v_teacher_id IS NULL AND COALESCE(v_role,'') NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'This account is not authorised to create examinations.';
  END IF;
  IF COALESCE(trim(p_title),'')='' OR COALESCE(trim(p_subject),'')='' THEN
    RAISE EXCEPTION 'Examination title and subject are required.';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 600 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 600 minutes.';
  END IF;
  IF p_total_marks IS NULL OR p_total_marks < 0 THEN RAISE EXCEPTION 'Total marks cannot be negative.'; END IF;
  IF p_pass_mark IS NULL OR p_pass_mark NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Pass mark must be between 0 and 100.'; END IF;
  IF p_start_time IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_start_time THEN
    RAISE EXCEPTION 'End time must be after start time.';
  END IF;
  INSERT INTO public.examinations(title,subject,subject_id,teacher_id,duration_minutes,total_marks,pass_mark,instructions,status,start_time,scheduled_at,ends_at,created_by,updated_at)
  VALUES(trim(p_title),trim(p_subject),p_subject_id,v_teacher_id,p_duration_minutes,p_total_marks,p_pass_mark,
    NULLIF(trim(COALESCE(p_instructions,'')),''),'draft',p_start_time,p_start_time,p_ends_at,auth.uid(),now())
  RETURNING id INTO v_exam_id;
  RETURN v_exam_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crest_teacher_create_examination_v2(text,text,uuid,integer,numeric,numeric,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crest_teacher_create_examination_v2(text,text,uuid,integer,numeric,numeric,text,timestamptz,timestamptz) TO authenticated;


/* Secure data feeds for the teacher workspace and results register. */
CREATE OR REPLACE FUNCTION public.crest_teacher_dashboard_exams()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_email text; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
    FROM (
      SELECT e.id,e.title,e.subject,e.status,e.duration_minutes,e.total_marks,
             e.start_time,e.scheduled_at,e.ends_at,e.created_at,e.instructions,e.pass_mark
      FROM public.examinations e
      WHERE e.created_by=auth.uid()
         OR EXISTS (SELECT 1 FROM public.exam_teachers t WHERE t.id=e.teacher_id AND lower(t.email)=v_email)
         OR COALESCE(v_role,'') IN ('admin','super_admin')
    ) x
  ),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.crest_teacher_results_list(p_exam_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_email text; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
  IF p_exam_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.examinations e WHERE e.id=p_exam_id AND (
      e.created_by=auth.uid() OR EXISTS (SELECT 1 FROM public.exam_teachers t WHERE t.id=e.teacher_id AND lower(t.email)=v_email)
      OR COALESCE(v_role,'') IN ('admin','super_admin')
    )
  ) THEN RAISE EXCEPTION 'You do not have permission to view these results.'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
    FROM public.exam_results r
    JOIN public.examinations e ON e.id=r.examination_id
    WHERE (p_exam_id IS NULL OR r.examination_id=p_exam_id)
      AND (e.created_by=auth.uid()
        OR EXISTS (SELECT 1 FROM public.exam_teachers t WHERE t.id=e.teacher_id AND lower(t.email)=v_email)
        OR COALESCE(v_role,'') IN ('admin','super_admin'))
  ),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.crest_teacher_dashboard_exams() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crest_teacher_results_list(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crest_teacher_dashboard_exams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crest_teacher_results_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.crest_teacher_questions_list(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  IF NOT EXISTS (
    SELECT 1 FROM public.examinations e
    WHERE e.id = p_exam_id AND (
      e.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.exam_teachers t
        WHERE t.id = e.teacher_id AND lower(t.email) = v_email
      )
    )
  ) THEN RAISE EXCEPTION 'You do not have permission to manage this examination.'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(q) ORDER BY q.question_number)
    FROM public.questions q WHERE q.examination_id = p_exam_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.crest_teacher_save_question(
  p_question_id uuid,
  p_exam_id uuid,
  p_question_text text,
  p_question_type text,
  p_marks numeric,
  p_question_number integer,
  p_options jsonb,
  p_correct_answer text,
  p_image_url text,
  p_is_required boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_question_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  IF NOT EXISTS (
    SELECT 1 FROM public.examinations e
    WHERE e.id = p_exam_id AND (
      e.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.exam_teachers t
        WHERE t.id = e.teacher_id AND lower(t.email) = v_email
      )
    )
  ) THEN RAISE EXCEPTION 'You do not have permission to manage this examination.'; END IF;
  IF COALESCE(trim(p_question_text),'') = '' THEN RAISE EXCEPTION 'Question text is required.'; END IF;
  IF p_question_type NOT IN ('multiple_choice','true_false','short_answer','essay') THEN
    RAISE EXCEPTION 'Unsupported question type.';
  END IF;
  IF p_marks IS NULL OR p_marks <= 0 THEN RAISE EXCEPTION 'Question marks must be greater than zero.'; END IF;
  IF p_question_number IS NULL OR p_question_number < 1 THEN RAISE EXCEPTION 'Question number must be at least one.'; END IF;
  IF p_question_type IN ('multiple_choice','true_false') THEN
    IF jsonb_typeof(COALESCE(p_options,'[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(p_options,'[]'::jsonb)) < 2 THEN
      RAISE EXCEPTION 'At least two answer options are required.';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(COALESCE(p_options,'[]'::jsonb)) x WHERE COALESCE((x->>'is_correct')::boolean,false)) <> 1 THEN
      RAISE EXCEPTION 'Select exactly one correct answer option.';
    END IF;
  END IF;

  IF p_question_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_answers WHERE question_id = p_question_id
  ) THEN
    RAISE EXCEPTION 'This question already has student answers and cannot be edited. Preserve it to protect examination records.';
  END IF;

  IF p_question_id IS NULL THEN
    INSERT INTO public.questions(
      examination_id, question_text, question_type, marks, options,
      correct_answer, question_number, image_url, is_required
    ) VALUES (
      p_exam_id, trim(p_question_text), p_question_type, p_marks,
      COALESCE(p_options,'[]'::jsonb), NULLIF(trim(COALESCE(p_correct_answer,'')),''),
      p_question_number, NULLIF(trim(COALESCE(p_image_url,'')),''), COALESCE(p_is_required,true)
    ) RETURNING id INTO v_question_id;
  ELSE
    UPDATE public.questions SET
      question_text = trim(p_question_text), question_type = p_question_type,
      marks = p_marks, options = COALESCE(p_options,'[]'::jsonb),
      correct_answer = NULLIF(trim(COALESCE(p_correct_answer,'')),''),
      question_number = p_question_number,
      image_url = NULLIF(trim(COALESCE(p_image_url,'')),''),
      is_required = COALESCE(p_is_required,true)
    WHERE id = p_question_id AND examination_id = p_exam_id
    RETURNING id INTO v_question_id;
    IF v_question_id IS NULL THEN RAISE EXCEPTION 'Question not found in this examination.'; END IF;
  END IF;

  UPDATE public.examinations SET total_marks = COALESCE((
    SELECT SUM(marks) FROM public.questions WHERE examination_id = p_exam_id
  ),0), updated_at = now() WHERE id = p_exam_id;
  RETURN v_question_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crest_teacher_delete_question(p_question_id uuid, p_exam_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  IF NOT EXISTS (
    SELECT 1 FROM public.examinations e
    WHERE e.id = p_exam_id AND (
      e.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.exam_teachers t
        WHERE t.id = e.teacher_id AND lower(t.email) = v_email
      )
    )
  ) THEN RAISE EXCEPTION 'You do not have permission to manage this examination.'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_answers WHERE question_id = p_question_id) THEN
    RAISE EXCEPTION 'This question already has student answers and cannot be deleted.';
  END IF;
  DELETE FROM public.questions WHERE id = p_question_id AND examination_id = p_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found.'; END IF;
  UPDATE public.examinations SET total_marks = COALESCE((
    SELECT SUM(marks) FROM public.questions WHERE examination_id = p_exam_id
  ),0), updated_at = now() WHERE id = p_exam_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.crest_teacher_publish_exam_master2(p_exam_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  v_email := lower(COALESCE(auth.jwt()->>'email',''));
  IF NOT EXISTS (
    SELECT 1 FROM public.examinations e
    WHERE e.id = p_exam_id AND (
      e.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.exam_teachers t
        WHERE t.id = e.teacher_id AND lower(t.email) = v_email
      )
    )
  ) THEN RAISE EXCEPTION 'You do not have permission to publish this examination.'; END IF;
  SELECT count(*) INTO v_count FROM public.questions WHERE examination_id = p_exam_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'Add at least one question before publishing.'; END IF;
  UPDATE public.examinations SET status = 'published', updated_at = now() WHERE id = p_exam_id;
  RETURN 'published';
END;
$$;

REVOKE ALL ON FUNCTION public.crest_teacher_questions_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crest_teacher_save_question(uuid,uuid,text,text,numeric,integer,jsonb,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crest_teacher_delete_question(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crest_teacher_publish_exam_master2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crest_teacher_questions_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crest_teacher_save_question(uuid,uuid,text,text,numeric,integer,jsonb,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crest_teacher_delete_question(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crest_teacher_publish_exam_master2(uuid) TO authenticated;

/* Private PDF question-paper storage and metadata. Safe to run once. */
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crest-question-papers','crest-question-papers',false,20971520,ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=20971520, allowed_mime_types=ARRAY['application/pdf'];

CREATE TABLE IF NOT EXISTS public.examination_pdf_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.examination_pdf_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers view own examination PDF uploads" ON public.examination_pdf_uploads;
CREATE POLICY "Teachers view own examination PDF uploads" ON public.examination_pdf_uploads FOR SELECT TO authenticated USING (created_by=auth.uid());
DROP POLICY IF EXISTS "Teachers add own examination PDF uploads" ON public.examination_pdf_uploads;
CREATE POLICY "Teachers add own examination PDF uploads" ON public.examination_pdf_uploads FOR INSERT TO authenticated WITH CHECK (
  created_by=auth.uid() AND EXISTS (SELECT 1 FROM public.examinations e WHERE e.id=examination_id AND e.created_by=auth.uid())
);
DROP POLICY IF EXISTS "Teachers delete own examination PDF uploads" ON public.examination_pdf_uploads;
CREATE POLICY "Teachers delete own examination PDF uploads" ON public.examination_pdf_uploads FOR DELETE TO authenticated USING (created_by=auth.uid());
GRANT SELECT, INSERT, DELETE ON public.examination_pdf_uploads TO authenticated;
REVOKE ALL ON public.examination_pdf_uploads FROM anon;
DROP POLICY IF EXISTS "Teachers upload own question PDFs" ON storage.objects;
CREATE POLICY "Teachers upload own question PDFs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='crest-question-papers' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS "Teachers read own question PDFs" ON storage.objects;
CREATE POLICY "Teachers read own question PDFs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='crest-question-papers' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS "Teachers delete own question PDFs" ON storage.objects;
CREATE POLICY "Teachers delete own question PDFs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='crest-question-papers' AND (storage.foldername(name))[1]=auth.uid()::text);
