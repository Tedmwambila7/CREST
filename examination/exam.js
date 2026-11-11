
/* ============================================================
   CREST EXAMINATION — COMPLETE SHARED CONFIGURATION
   Connects:
   1. CREST Examination Supabase
   2. Existing MAIN CREST student login
   3. Secure super-action Edge Function
   4. Existing teacher authentication
   ============================================================ */

(() => {
  "use strict";

  // ==========================================================
  // 1. CREST EXAMINATION SUPABASE CONFIGURATION
  // ==========================================================

  const SUPABASE_URL =
    "https://rvsmsucxgpdpdequzteb.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c21zdWN4Z3BkcGRlcXV6dGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5Nzg1MjcsImV4cCI6MjEwOTU1NDUyN30.S-HtfXgJFkrZYeglb1Y-cCLg7EhKrkV4DCrw1qwSjw0";

  window.CREST_EXAM = window.CREST_EXAM || {};

  const E = window.CREST_EXAM;

  E.client = null;

  if (!window.supabase || !window.supabase.createClient) {
    console.error("CREST Supabase library has not loaded.");
  } else {
    E.client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
  }

  // ==========================================================
  // 2. GET SUPABASE CLIENT
  // ==========================================================

  E.getClient = function () {
    if (!E.client) {
      throw new Error(
        "CREST Supabase could not be initialized. Check your connection."
      );
    }

    return E.client;
  };

  // ==========================================================
  // 3. READ EXISTING MAIN CREST STUDENT LOGIN
  // ==========================================================

  E.getStudentSessionToken = function () {
    if (typeof window.getCrestStudentSessionToken === "function") {
      return window.getCrestStudentSessionToken();
    }

    const keys = [
      "crestStudentSession",
      "crest_student_session",
      "crestSession",
      "studentSession",
      "student_session",
      "crest_token",
      "session_token"
    ];

    for (const key of keys) {
      const value = localStorage.getItem(key);

      if (!value) continue;

      try {
        const parsed = JSON.parse(value);

        if (typeof parsed === "string") return parsed;

        if (parsed.token) return parsed.token;

        if (parsed.session_token) return parsed.session_token;

      } catch (_) {
        return value;
      }
    }

    return "";
  };

  // ==========================================================
  // 4. CONNECT STUDENT TO EXAMINATION SYSTEM
  // ==========================================================

  E.connectStudent = async function () {
    const client = E.getClient();

    const mainToken = E.getStudentSessionToken();

    if (!mainToken) {
      throw new Error(
        "Please sign in to your MAIN CREST student portal first."
      );
    }

    // Reuse a valid examination session on this browser tab.
    const cached = sessionStorage.getItem("crestExamSession");

    if (cached) {
      try {
        const saved = JSON.parse(cached);

        if (
          saved.token &&
          saved.expires_at &&
          new Date(saved.expires_at).getTime() > Date.now() + 60000
        ) {
          return saved;
        }
      } catch (_) {
        sessionStorage.removeItem("crestExamSession");
      }
    }

    // Ask the secure Edge Function to validate MAIN CREST.
    const { data, error } = await client.functions.invoke(
      "super-action",
      {
        body: {
          session_token: mainToken
        }
      }
    );

    if (error) {
      console.error("CREST student connection error:", error);

      throw new Error(
        "Could not connect to CREST examinations. Please sign in again."
      );
    }

    if (!data || !data.success || !data.session_token) {
      throw new Error(
        data?.error || "Student connection failed."
      );
    }

    const examSession = {
      token: data.session_token,
      student_name: data.student_name,
      expires_at: data.expires_at
    };

    sessionStorage.setItem(
      "crestExamSession",
      JSON.stringify(examSession)
    );

    return examSession;
  };

  // ==========================================================
  // 5. GET EXAMINATION SESSION TOKEN
  // ==========================================================

  E.getExamSessionToken = function () {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("crestExamSession") || "null"
      );

      if (
        saved &&
        saved.token &&
        saved.expires_at &&
        new Date(saved.expires_at).getTime() > Date.now()
      ) {
        return saved.token;
      }
    } catch (_) {}

    return "";
  };

  // ==========================================================
  // 6. CLEAR EXAMINATION SESSION
  // ==========================================================

  E.clearExamSession = function () {
    sessionStorage.removeItem("crestExamSession");
  };

  // ==========================================================
  // 7. DISPLAY MESSAGES
  // ==========================================================

  E.message = function (element, text, type = "info") {
    if (!element) return;

    element.textContent = text;
    element.className = "message " + type;
  };

  // ==========================================================
  // 8. SAFE HTML ESCAPING
  // ==========================================================

  E.escape = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  };

  // ==========================================================
  // 9. FORMAT DATES
  // ==========================================================

  E.formatDate = function (value) {
    if (!value) return "Not scheduled";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Not scheduled"
      : date.toLocaleString();
  };

  // ==========================================================
  // 10. DATABASE RPC HELPER
  // ==========================================================

  E.rpc = async function (name, params) {
    const { data, error } =
      await E.getClient().rpc(name, params);

    if (error) throw error;

    return data;
  };

  // ==========================================================
  // 11. TEACHER AUTHENTICATION
  // ==========================================================

  E.requireTeacher = async function () {
    const client = E.getClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error || !user) {
      throw new Error(
        "Please sign in using your CREST teacher account."
      );
    }

    const { data: profile, error: profileError } =
      await client
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .single();

    if (
      profileError ||
      !profile ||
      !["teacher", "admin", "super_admin"].includes(profile.role)
    ) {
      throw new Error(
        "This account is not registered as a CREST teacher or administrator."
      );
    }

    return {
      user,
      profile
    };
  };

  // ==========================================================
  // 12. INITIALIZATION
  // ==========================================================

  console.info("CREST Examination configuration loaded.");

})();
