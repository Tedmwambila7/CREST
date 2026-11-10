CREST ACADEMY — EXAMINATION MODULE
=================================

CURRENT PROJECT STRUCTURE
-------------------------
This module is stored in the `examination/` folder of CREST-main.

Main pages:
- index.html              Examination Centre home
- teacher-login.html      Teacher sign-in
- teacher-dashboard.html  Teacher examination list
- crest-master.html       Searchable examination dashboard
- create-exam.html       Create an examination
- questions.html          Add, edit and manage questions
- results.html            View examination results
- student-exam.html       Legacy student examination entry
- admin.html              Super Admin portal

Shared assets:
- exam.js                 Supabase client and shared helpers
- exam.css                Shared styling
- questions.js/css        Question Management page
- teacher.js              Teacher dashboard
- create-exam.js          Examination creation
- crest-master.js/css     Master dashboard
- results.js              Results register
- admin.js                Super Admin page

IMPORTANT: KEEP THE FOLDER NAME
-------------------------------
The real folder name in this project is `examination`, not `exam`.
Keep all files listed above together in that folder. Page links are relative
to this folder. Do not move individual JavaScript or CSS files elsewhere.

SUPABASE PROJECT
----------------
The Examination module uses the Supabase project already configured in
`exam.js`. The browser must use only the Supabase anon/public key. Never put
a service_role key in HTML or JavaScript.

STAFF WORKFLOW
--------------
1. Open `teacher-login.html` and sign in.
2. Open `teacher-dashboard.html` or `crest-master.html`.
3. Create an examination from `create-exam.html`.
4. The creation page calls `crest_teacher_create_examination_v2`.
5. The page opens `questions.html?exam=<id>`.
6. Add multiple-choice, true/false, short-answer or essay questions.
7. Question marks are recalculated into `examinations.total_marks`.
8. Use `results.html?exam=<id>` to inspect submitted results.

REQUIRED DATABASE MIGRATION FOR THIS PACKAGE
---------------------------------------------
Run `master-code-5-polish.sql` in the SQL Editor of the CREST Examination
Supabase project. It:
- Adds a versioned examination-creation function that matches create-exam.js.
- Saves the pass-mark percentage.
- Prevents edits/deletions to questions that already have student answers.
- Keeps the examination total marks aligned with question marks.

The existing Question Management functions from MASTER CODE 5A and 5B must
also be present:
- crest_exam_save_question
- crest_exam_delete_question

Do not run this migration in the main CREST Academy project.

LEGACY STUDENT FLOW — IMPORTANT LIMITATION
------------------------------------------
`student-exam.html` and `student.js` are the earlier session-token student
flow. They call the legacy RPCs:
- crest_student_start_exam
- crest_student_get_questions
- crest_student_save_answer
- crest_student_submit_exam

That earlier flow uses the legacy `questions`, `answer_keys`, `exam_attempts`
and `student_answers` structure. The current staff Question Management page
uses `examination_questions` and `examination_question_options`, with the
newer `student_exam_attempts` / `student_exam_answers` structure.

These are two different examination data models. Do not assume the student
portal can sit questions created in the new Question Management page until
the student delivery and marking functions are migrated to the same model.
The legacy `setup.sql` is retained for reference but is NOT a general setup
script for the current schema. Do not rerun it blindly.

SUPER ADMIN
-----------
`admin.html` uses the existing `super-function` Supabase Edge Function for
teacher creation and listing. Keep that Edge Function deployed and configured.
Never place the Supabase service_role key in the browser.

SAFE OPERATING NOTES
--------------------
- Keep a backup of the project before publishing updates.
- Do not delete existing tables or records to resolve a page error.
- Do not edit or delete a question after students have answered it; the
  database safeguard will reject that operation.
- Test with a draft examination before publishing a real examination.
- Hard-refresh the browser after replacing files (Ctrl + Shift + R).
