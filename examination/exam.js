/* CREST examination shared configuration.
   Uses the CREST student-session token and the examination RPCs in database/setup.sql.
   Never place a Supabase service_role key in browser code. */
(() => {
  "use strict";

  const SUPABASE_URL = "https://otjybdiyoqnsynjbofuj.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc";

  const E = window.CREST_EXAM = window.CREST_EXAM || {};
  E.client = null;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    E.configurationError = "Supabase library did not load. Check your internet connection and reload.";
  } else if (!SUPABASE_URL.startsWith("https://") || !SUPABASE_ANON_KEY ||
             SUPABASE_URL.includes("YOUR_") || SUPABASE_ANON_KEY.includes("YOUR_")) {
    E.configurationError = "Supabase URL or anon/publishable key is missing in examinations/exam.js.";
  } else {
    try {
      E.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (error) {
      E.configurationError = "Supabase could not be initialized: " + (error.message || error);
    }
  }

  E.getClient = function () {
    if (!E.client) throw new Error(E.configurationError || "Supabase is not configured.");
    return E.client;
  };

  E.getStudentSessionToken = function () {
    if (typeof window.getCrestStudentSessionToken === "function") {
      const token = window.getCrestStudentSessionToken();
      if (token) return token;
    }

    const keys = ["crestStudentSession", "crest_student_session", "crestSession",
      "studentSession", "student_session", "crest_token", "session_token"];

    for (const key of keys) {
      let raw = null;
      try { raw = localStorage.getItem(key) || sessionStorage.getItem(key); } catch (_) {}
      if (!raw) continue;

      try {
        const value = JSON.parse(raw);
        if (typeof value === "string") return value;
        if (value && typeof value.token === "string") return value.token;
        if (value && typeof value.session_token === "string") return value.session_token;
      } catch (_) {
        // Only accept a raw token from explicitly named token keys.
        if (key === "crest_token" || key === "session_token") return raw;
      }
    }
    return "";
  };

  E.message = function (element, text, type = "info") {
    if (!element) return;
    element.textContent = text || "";
    element.className = "message " + type;
  };

  E.escape = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  };

  E.rpc = async function (name, params) {
    const { data, error } = await E.getClient().rpc(name, params);
    if (error) {
      const message = error.message || "Supabase request failed.";
      if (/invalid api key|invalid jwt/i.test(message)) {
        throw new Error("Supabase rejected the API key. In Supabase Dashboard → Project Settings → API, copy the anon/public key for project otjybdiyoqnsynjbofuj and replace SUPABASE_ANON_KEY in examinations/exam.js.");
      }
      throw new Error(message);
    }
    return data;
  };

  E.requireTeacher = async function () {
    const client = E.getClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error("Please sign in using the CREST teacher account connected to Supabase Auth.");
    const { data: profile, error: profileError } = await client
      .from("profiles").select("role, full_name").eq("id", user.id).single();
    if (profileError || !profile || !["teacher", "admin"].includes(profile.role)) {
      throw new Error("This account is not registered as a CREST teacher or administrator.");
    }
    return { user, profile };
  };
})();
