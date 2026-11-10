/* ============================================================
   CREST EXAMINATION — PDF QUESTION PAPER UPLOAD
   Additive migration. Run once in the CREST Examination Supabase project.
   Creates private storage and metadata for teacher-uploaded PDF papers.
   ============================================================ */

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crest-question-papers',
  'crest-question-papers',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf'];

CREATE TABLE IF NOT EXISTS public.examination_pdf_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.examination_pdf_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers view own examination PDF uploads" ON public.examination_pdf_uploads;
CREATE POLICY "Teachers view own examination PDF uploads"
ON public.examination_pdf_uploads FOR SELECT TO authenticated
USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Teachers add own examination PDF uploads" ON public.examination_pdf_uploads;
CREATE POLICY "Teachers add own examination PDF uploads"
ON public.examination_pdf_uploads FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.examinations e
    WHERE e.id = examination_id AND e.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers delete own examination PDF uploads" ON public.examination_pdf_uploads;
CREATE POLICY "Teachers delete own examination PDF uploads"
ON public.examination_pdf_uploads FOR DELETE TO authenticated
USING (created_by = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.examination_pdf_uploads TO authenticated;
REVOKE ALL ON public.examination_pdf_uploads FROM anon;

DROP POLICY IF EXISTS "Teachers upload own question PDFs" ON storage.objects;
CREATE POLICY "Teachers upload own question PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crest-question-papers'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Teachers read own question PDFs" ON storage.objects;
CREATE POLICY "Teachers read own question PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crest-question-papers'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Teachers delete own question PDFs" ON storage.objects;
CREATE POLICY "Teachers delete own question PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'crest-question-papers'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
