CREST EXAMINATIONS — UPDATED REMAINING FILES
============================================

This package contains the updated remaining examination files. It deliberately
DOES NOT contain exam.js because you have already replaced that file with the
configured version for your CREST-EXAMINATION Supabase project.

FILES TO REPLACE
----------------
Replace these files in your existing examinations folder:
  teacher.js
  create-exam.js
  questions.js
  student.js
  results.js

The matching HTML files and exam.css are included as reference copies. They do
not need replacing unless your local copies differ from these.

IMPORTANT DATABASE STEP
-----------------------
If your Super Admin profile role is already set to 'super_admin', run
 database/super_admin_role_migration.sql
once in the CREST-EXAMINATION Supabase project's SQL Editor. This migration
allows the database teacher-check function to accept the super_admin role.
Do not rerun the original database/setup.sql just to apply this change.

IMPORTANT: STUDENT LOGIN / SEPARATE SUPABASE PROJECTS
----------------------------------------------------
Your main CREST website uses one Supabase project, while the examination module
uses a different Supabase project. The student RPC functions in the original
exam setup SQL look up crest_sessions and crest_students inside the examination
project. They cannot directly read those tables from the main website project.

Therefore, the updated browser files alone cannot make student examinations
work across these two projects. A secure server-side bridge (for example, a
Supabase Edge Function deployed to the main project, with narrowly scoped
server secrets and matching server-side functions in the examination project)
must be installed before students can start exams. Do not copy service_role
keys into JavaScript, HTML, GitHub, or this package. Do not make student session
tables or answer keys publicly readable.

Teacher pages and the student page are not declared fully tested against your
live Supabase projects. The browser code is syntax-checked, but live database
and login integration still requires deployment and testing.

MAIN WEBSITE SAFETY
-------------------
Do not replace the main website's root admin.html or its admin scripts with
examination pages. Keep the examination module in its own examinations folder.
Keep your already-configured exam.js file unchanged.
