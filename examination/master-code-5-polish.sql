/* ============================================================
   CREST EXAMINATION — POLISH MIGRATION
   Adds a versioned examination-creation RPC and safeguards.
   Safe/additive: no tables or student records are dropped.
   Run in the CREST Examination Supabase SQL Editor.
   ============================================================ */

CREATE OR REPLACE FUNCTION public.crest_teacher_create_examination_v2(
    p_title TEXT,
    p_subject TEXT,
    p_subject_id UUID DEFAULT NULL,
    p_duration_minutes INTEGER DEFAULT 60,
    p_total_marks NUMERIC DEFAULT 0,
    p_pass_mark NUMERIC DEFAULT 50,
    p_instructions TEXT DEFAULT NULL,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam_id UUID;
    v_teacher_id UUID;
    v_email TEXT;
    v_is_admin BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_email := auth.jwt() ->> 'email';
    v_is_admin := public.crest_is_super_admin();

    SELECT id INTO v_teacher_id
    FROM public.exam_teachers
    WHERE lower(email) = lower(v_email)
    LIMIT 1;

    IF NOT v_is_admin AND v_teacher_id IS NULL THEN
        RAISE EXCEPTION 'You are not authorised to create examinations';
    END IF;

    IF COALESCE(trim(p_title), '') = '' THEN
        RAISE EXCEPTION 'Examination title is required';
    END IF;

    IF COALESCE(trim(p_subject), '') = '' THEN
        RAISE EXCEPTION 'Subject is required';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 600 THEN
        RAISE EXCEPTION 'Duration must be between 1 and 600 minutes';
    END IF;

    IF p_total_marks IS NULL OR p_total_marks < 0 THEN
        RAISE EXCEPTION 'Total marks cannot be negative';
    END IF;

    IF p_pass_mark IS NULL OR p_pass_mark NOT BETWEEN 0 AND 100 THEN
        RAISE EXCEPTION 'Pass mark must be between 0 and 100 percent';
    END IF;

    IF p_start_time IS NOT NULL
       AND p_ends_at IS NOT NULL
       AND p_ends_at <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    INSERT INTO public.examinations (
        title, subject, subject_id, teacher_id,
        duration_minutes, total_marks, pass_mark,
        instructions, status, start_time, scheduled_at,
        ends_at, created_by, updated_at
    )
    VALUES (
        trim(p_title), trim(p_subject), p_subject_id, v_teacher_id,
        p_duration_minutes, p_total_marks, p_pass_mark,
        NULLIF(trim(COALESCE(p_instructions, '')), ''),
        'draft', p_start_time, p_start_time,
        p_ends_at, auth.uid(), now()
    )
    RETURNING id INTO v_exam_id;

    RETURN v_exam_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crest_teacher_create_examination_v2(
    TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC,
    TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crest_teacher_create_examination_v2(
    TEXT, TEXT, UUID, INTEGER, NUMERIC, NUMERIC,
    TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated;


/* Prevent changes to a question after students have answered it.
   This protects answer history and option references. */
CREATE OR REPLACE FUNCTION public.crest_exam_protect_answered_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.student_exam_answers
        WHERE question_id = OLD.id
    ) THEN
        RAISE EXCEPTION
            'This question already has student answers and cannot be edited or deleted. Preserve it to protect examination records.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crest_exam_protect_answered_question
ON public.examination_questions;

CREATE TRIGGER crest_exam_protect_answered_question
BEFORE UPDATE OR DELETE ON public.examination_questions
FOR EACH ROW
EXECUTE FUNCTION public.crest_exam_protect_answered_question();


/* Keep the examination total in sync with the marks assigned to its questions. */
CREATE OR REPLACE FUNCTION public.crest_exam_refresh_total_marks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_exam_id := OLD.examination_id;
    ELSE
        v_exam_id := NEW.examination_id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.examination_id IS DISTINCT FROM NEW.examination_id THEN
            UPDATE public.examinations
            SET total_marks = COALESCE((
                SELECT SUM(marks)
                FROM public.examination_questions
                WHERE examination_id = OLD.examination_id
            ), 0),
            updated_at = now()
            WHERE id = OLD.examination_id;
        END IF;
    END IF;

    UPDATE public.examinations
    SET total_marks = COALESCE((
        SELECT SUM(marks)
        FROM public.examination_questions
        WHERE examination_id = v_exam_id
    ), 0),
    updated_at = now()
    WHERE id = v_exam_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crest_exam_refresh_total_marks
ON public.examination_questions;

CREATE TRIGGER crest_exam_refresh_total_marks
AFTER INSERT OR UPDATE OR DELETE
ON public.examination_questions
FOR EACH ROW
EXECUTE FUNCTION public.crest_exam_refresh_total_marks();
