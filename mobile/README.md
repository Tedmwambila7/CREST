# CREST Academy mobile app
The Expo / React Native Android app lives in `mobile/`. The existing website and database are not replaced.

## Shared CREST sign-in
The app uses the same Supabase RPC authentication functions as the website:
- Students: `student_login` with registered name, phone number and password.
- Student session validation: `student_me`; sign-out: `student_logout`.
- Administrator: `admin_check` using the existing normalised name + password key.
No separate mobile registration is provided. Student accounts continue to be created through the existing CREST administration process.

## Setup
1. Copy `.env.example` to `.env`.
2. Set the existing CREST Supabase project URL and anon/publishable key.
3. Never put a service-role key in the app.
4. Run `npm install` and `npx expo start` from this folder.

## Current scope
Shared student/admin sign-in and session storage are wired. Library, assignments, exams, messaging and administration workflows remain placeholders until their existing RPC contracts and policies are confirmed and tested. The current website's visible authentication supports students and administrator; this scaffold does not invent a separate teacher account model. Android build and device testing are still required.
