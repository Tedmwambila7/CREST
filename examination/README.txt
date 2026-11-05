CREST EXAMINATION SYSTEM — INSTALLATION GUIDE
=============================================

IMPORTANT
---------
This package adds an examination module to your EXISTING CREST website.
It does not replace your existing student login or other CREST pages.

WHAT IS INCLUDED
----------------
- Teacher sign-in page and dashboard: create and manage examinations.
- Question editor: add multiple-choice questions and correct answers.
- Publishing: publish an exam with an access code or open access.
- Student exam page: validate an existing CREST student session, start an attempt,
  display questions, save answers, and submit.
- Server-side marking and result storage.
- Results page for teachers.
- Supabase SQL setup script with RPC functions.

BEFORE YOU START
----------------
1. Make a backup copy of your existing CREST project.
2. In Supabase, open SQL Editor.
3. Open the file examinations/database/setup.sql from this package.
4. Copy its contents into SQL Editor and run it.
5. If Supabase reports an error, STOP and send the exact error. Do not repeatedly
   run modified SQL without checking the cause.
6. In examinations/exam.js, replace:
      YOUR_SUPABASE_PROJECT_URL
      YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
   with your Supabase Project URL and anon/publishable key.
   NEVER put a service_role key in browser JavaScript.
7. The main CREST homepage now links to this module. Connect this module to your existing CREST student session:
   In exam.js, edit getStudentSessionToken(). It must return the same session
   token your existing CREST login stores after a student signs in.
   The helper checks several common localStorage names, but your existing site
   may use a different name. Search your existing login code for
   "crest_sessions", "crestStudentSession", or "token".
8. Teacher pages require Supabase Auth sign-in and a matching row in public.profiles
   where id = auth.uid() and role = 'teacher' or 'admin'. If your current teacher
   login uses a different system, it must be connected before teacher RPCs work.
9. Upload the examinations folder to the same location as your other CREST pages.
   Keep the existing root site files. Link to:
      examinations/index.html

DATABASE NOTES
--------------
Your existing tables are reused. The SQL adds a UUID column to crest_students
for examination attempt identity, and creates secure RPC functions.
It does not expose answer_keys to students. Student operations validate the
existing crest_sessions token on the server.

The package assumes:
- crest_sessions.token and crest_sessions.phone identify a current student session.
- crest_students.phone identifies the same student phone.
- profiles.id is the authenticated teacher UUID.
- profiles.role contains 'teacher' or 'admin' for permitted teachers.

If any of these assumptions do not match your actual CREST login/database,
the relevant integration must be adjusted. The student token is not guessed:
connect getStudentSessionToken() to your existing login's actual storage key.

SECURITY
--------
- Do not share your Supabase service_role key.
- Do not make answer_keys publicly readable.
- Student answers are marked on the server.
- The browser countdown is only a display; the server checks the deadline.
- Use HTTPS when hosting the site.

SUPPORTED QUESTION TYPE
-----------------------
This first version supports four-option multiple-choice questions (A, B, C, D).
Your current questions table has option_a through option_d and no written-answer
field. Written-response questions need a separate schema and marking workflow.

FILES
-----
index.html                 Module landing page
exam.js                    Supabase setup and shared helpers
exam.css                   Shared styling
teacher-login.html         Teacher sign-in page\nteacher-dashboard.html     Teacher exam list
teacher.js                 Teacher dashboard logic
create-exam.html           Create/edit exam form
create-exam.js             Create exam logic
questions.html             Add questions and answer keys
questions.js               Question editor logic
student-exam.html          Student exam access and sitting page
student.js                 Student attempt logic
results.html               Teacher results page
results.js                 Results logic
database/setup.sql         Database migration and secure RPC functions
