CREST EXAMINATION — INTEGRATION CHECKLIST
=========================================

The examination folder has been consolidated around the current staff-side
schema and file layout. See README.txt for the page map and workflow.

Before using the updated staff pages:
[ ] Run master-code-5-polish.sql in the CREST Examination Supabase project.
[ ] Confirm MASTER CODE 5A and 5B functions exist.
[ ] Upload the complete contents of this examination folder together.
[ ] Open teacher-login.html and sign in.
[ ] Create a draft examination.
[ ] Add one multiple-choice question and one written question.
[ ] Confirm the examination total marks update after saving questions.
[ ] Edit and delete a test question before any student answers it.
[ ] Confirm results.html opens without a missing-column error.

Not yet unified:
The student page in this folder is a legacy session-token implementation.
It uses a separate questions/answers data model. The staff-side question editor
uses examination_questions/examination_question_options. The student delivery,
autosave, submission and marking functions must be migrated together before
this student page is considered compatible with questions created here.

Do not run setup.sql as a shortcut for the current schema. It describes the
legacy data model and may conflict with the current examination tables.


PDF QUESTION IMPORT
[ ] Run pdf-question-upload-migration.sql in the CREST Examination Supabase project.
[ ] Confirm private bucket `crest-question-papers` exists.
[ ] Upload a text-based sample PDF and verify extracted text.
[ ] Confirm the original PDF opens through its temporary signed URL.
[ ] Transfer a sample question, complete its answer/marks, and save it.
[ ] Test with a scanned PDF and confirm the OCR limitation is clearly reported.
