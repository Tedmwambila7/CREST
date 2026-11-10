CREST ACADEMY — UNIFIED TEACHER DASHBOARD
========================================

WHAT IS INCLUDED
----------------
- Teacher sign-in and a unified teacher dashboard.
- Examination creation and scheduling.
- Question manager: multiple choice, true/false, short answer and essay.
- Teacher PDF question-paper upload and selectable-text extraction.
- Submitted-student list and written-answer marking with feedback.
- Results register using exam_results.
- Student examination-paper PDF and confidential marking-scheme PDF.
- Super Admin and master dashboard pages retained from the supplied project.

IMPORTANT DATABASE WORKFLOW
----------------------------
This teacher dashboard is aligned to the confirmed tables and functions used
by the current MASTER 1 and MASTER 2 marking work:
  examinations, questions, exam_attempts, student_answers, exam_results,
  exam_students, exam_teachers and profiles.

It does NOT use the parallel V2 tables such as:
  examination_questions, crest_online_exam_attempts_v2,
  crest_online_exam_answers_v2 or crest_online_exam_results_v2.

INSTALLATION
------------
1. Back up your current website files and Supabase database.
2. Extract this package.
3. Upload the contents of its `examination/` folder into your existing
   website `examination/` folder. Keep the folder name `examination`.
4. Keep your current `exam.js` if it contains your correct Supabase URL and
   anon/public key. Never put a service_role key in browser files.
5. Open the Supabase SQL Editor for the CREST Examination project.
6. Run `CREST-TEACHER-DASHBOARD-MASTER.sql` once. It creates the secure RPCs
   used by the teacher dashboard, question manager, results register,
   examination creation and private PDF uploads. It is additive and does not
   drop tables or delete student records.
7. Do NOT rerun MASTER 1 or MASTER 2 if they have already completed
   successfully. This package expects their marking functions to exist:
     crest_teacher_marking_exams
     crest_teacher_marking_list
     crest_mark_student_question
8. Hard-refresh the website (Ctrl + Shift + R), then sign in at
   `examination/teacher-login.html`.

TEACHER WORKFLOW
----------------
1. Sign in as an authorised teacher.
2. Open Teacher Dashboard.
3. Create an examination.
4. Open Question Manager. Add questions manually or upload a PDF, extract
   selectable text, review it, and transfer each question into the editor.
5. Publish the examination when it is ready.
6. Use Generate examination PDFs to preview and save the student paper or
   confidential marking scheme.
7. Use Mark written answers to mark submitted short-answer and essay answers.
8. Use Results Register to review recorded marks and publication status.

PDF NOTES
---------
- PDF upload limit: 20 MB.
- Uploaded originals are stored in a private Supabase Storage bucket.
- Selectable PDF text is extracted in the browser using PDF.js.
- Scanned/image-only PDFs are not OCR-processed; transcribe those questions.
- Student paper and marking scheme are separate print jobs. Choose
  "Save as PDF" in the browser print dialog.

STUDENT DELIVERY COMPATIBILITY
------------------------------
The supplied project contains a separate/older student-delivery page and
parallel V2 database scripts. Those components use a different question and
attempt data model from MASTER 1 / MASTER 2. This package deliberately does
not claim that those parallel V2 student pages have been migrated to the
current `questions` / `exam_attempts` workflow. Do not run the old
`student-delivery-v2.sql`, `teacher-marking-v2.sql` or `setup.sql` as part of
this installation. Keep using the student delivery flow already confirmed
for your live site until its backend is deliberately aligned and tested.

SAFETY
------
- Test with a draft examination and test student before publishing live work.
- A question with existing student answers cannot be edited or deleted by
  the new secure question RPCs.
- Do not delete tables or records to resolve an error.
- Never expose answer keys or service_role credentials in public JavaScript.
