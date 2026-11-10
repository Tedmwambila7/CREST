/* CREST TEACHER MARKING V2 — additive migration; run after student-delivery-v2.sql */
ALTER TABLE public.crest_online_exam_answers_v2
  ADD COLUMN IF NOT EXISTS awarded_marks numeric(10,2),
  ADD COLUMN IF NOT EXISTS teacher_feedback text,
  ADD COLUMN IF NOT EXISTS marked_by uuid,
  ADD COLUMN IF NOT EXISTS marked_at timestamptz;

CREATE OR REPLACE FUNCTION public.crest_teacher_marking_list_v2(p_exam_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.examinations e WHERE e.id=p_exam_id AND e.created_by=v_uid
  ) THEN RAISE EXCEPTION 'You do not have permission to view marking for this examination.'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'attempt_id',a.id,'student_id',a.student_id,'started_at',a.started_at,'submitted_at',a.submitted_at,
      'automatic_marks',a.automatic_marks,'manual_marks',a.manual_marks,'total_marks',a.total_marks,'status',a.status,
      'questions',COALESCE((
        SELECT json_agg(json_build_object(
          'question_id',q.id,'question_order',q.question_order,'question_text',q.question_text,
          'question_type',q.question_type,'max_marks',q.marks,'expected_answer',q.correct_answer,
          'answer_text',ans.answer_text,'awarded_marks',ans.awarded_marks,'teacher_feedback',ans.teacher_feedback,
          'marked_at',ans.marked_at
        ) ORDER BY q.question_order)
        FROM public.examination_questions q
        LEFT JOIN public.crest_online_exam_answers_v2 ans ON ans.question_id=q.id AND ans.attempt_id=a.id
        WHERE q.examination_id=p_exam_id AND q.question_type IN ('short_answer','essay')
      ),'[]'::json)
    ) ORDER BY a.submitted_at DESC)
    FROM public.crest_online_exam_attempts_v2 a
    WHERE a.examination_id=p_exam_id AND a.submitted_at IS NOT NULL
  ),'[]'::json);
END; $$;

CREATE OR REPLACE FUNCTION public.crest_teacher_mark_answer_v2(
  p_attempt_id uuid,p_question_id uuid,p_awarded_marks numeric,p_feedback text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid; v_exam uuid; v_max numeric; v_manual numeric; v_auto numeric; v_total numeric; v_pending integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Teacher sign-in is required.'; END IF;
  SELECT a.examination_id,q.marks INTO v_exam,v_max
  FROM public.crest_online_exam_attempts_v2 a
  JOIN public.examinations e ON e.id=a.examination_id AND e.created_by=v_uid
  JOIN public.examination_questions q ON q.id=p_question_id AND q.examination_id=a.examination_id
  WHERE a.id=p_attempt_id AND a.submitted_at IS NOT NULL AND q.question_type IN ('short_answer','essay');
  IF NOT FOUND THEN RAISE EXCEPTION 'Submitted answer not found or access denied.'; END IF;
  IF p_awarded_marks IS NULL OR p_awarded_marks<0 OR p_awarded_marks>v_max THEN
    RAISE EXCEPTION 'Awarded marks must be between 0 and %.',v_max;
  END IF;
  INSERT INTO public.crest_online_exam_answers_v2(attempt_id,question_id,awarded_marks,teacher_feedback,marked_by,marked_at)
  VALUES(p_attempt_id,p_question_id,p_awarded_marks,NULLIF(trim(COALESCE(p_feedback,'')),''),v_uid,now())
  ON CONFLICT(attempt_id,question_id) DO UPDATE SET awarded_marks=EXCLUDED.awarded_marks,
    teacher_feedback=EXCLUDED.teacher_feedback,marked_by=EXCLUDED.marked_by,marked_at=now();

  SELECT count(*) INTO v_pending FROM public.examination_questions q
  LEFT JOIN public.crest_online_exam_answers_v2 ans ON ans.question_id=q.id AND ans.attempt_id=p_attempt_id
  WHERE q.examination_id=v_exam AND q.question_type IN ('short_answer','essay') AND ans.marked_at IS NULL;
  SELECT COALESCE(SUM(awarded_marks),0) INTO v_manual FROM public.crest_online_exam_answers_v2
    WHERE attempt_id=p_attempt_id AND marked_at IS NOT NULL;
  SELECT automatic_marks,total_marks INTO v_auto,v_total FROM public.crest_online_exam_attempts_v2 WHERE id=p_attempt_id;
  UPDATE public.crest_online_exam_attempts_v2 SET manual_marks=v_manual,
    status=CASE WHEN v_pending=0 THEN 'marked' ELSE 'pending_review' END WHERE id=p_attempt_id;
  UPDATE public.crest_online_exam_results_v2 SET manual_marks=v_manual,
    status=CASE WHEN v_pending=0 THEN 'marked' ELSE 'pending review' END WHERE attempt_id=p_attempt_id;
  RETURN json_build_object('manual_marks',v_manual,'automatic_marks',COALESCE(v_auto,0),
    'total_awarded',COALESCE(v_auto,0)+v_manual,'pending_questions',v_pending,
    'status',CASE WHEN v_pending=0 THEN 'marked' ELSE 'pending review' END);
END; $$;

REVOKE ALL ON FUNCTION public.crest_teacher_marking_list_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crest_teacher_mark_answer_v2(uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crest_teacher_marking_list_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crest_teacher_mark_answer_v2(uuid,uuid,numeric,text) TO authenticated;
