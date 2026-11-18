# CREST Academy mobile app

This is the first Expo / React Native Android app scaffold for the existing CREST Academy repository. The current GitHub Pages website remains in place; the mobile app is added separately under `mobile/`.

## Setup

1. Install Node.js LTS on your development computer.
2. Copy `.env.example` to `.env`.
3. Set the Supabase project URL and publishable/anon key for the existing CREST project. Never place a service-role key in a mobile app.
4. From this folder run `npm install`, then `npx expo start`.
5. Use Expo Go for an initial development preview, or configure an Android development build for native testing.

## Current first version

- Supabase email/password sign-in with persisted sessions.
- Home dashboard and navigation placeholders for Library, Assignments and Exams.
- Account screen and sign-out.
- Dark CREST visual theme.

## Before production

The library, assignment, examination, messaging and teacher workflows still need to be connected to the existing database schema and verified Row Level Security policies. Confirm the current Supabase Auth method and account roles before enabling sign-up or privileged actions. Do not put service-role keys, LiveKit secrets or other server secrets in this app.

The mobile app has not yet been built or tested on a physical Android device.
