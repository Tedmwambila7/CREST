/* CREST Examination — Supabase configuration and shared helpers */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://rvsmsucxgpdpdequzteb.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c21zdWN4Z3BkcGRlcXV6dGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5Nzg1MjcsImV4cCI6MjEwOTU1NDUyN30.S-HtfXgJFkrZYeglb1Y-cCLg7EhKrkV4DCrw1qwSjw0";

  window.CREST_EXAM = window.CREST_EXAM || {};
  window.CREST_EXAM.client = null;

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase library has not loaded.");
  } else {
    window.CREST_EXAM.client =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
  }

  window.CREST_EXAM.getClient = function () {
    if (!window.CREST_EXAM.client) {
      throw new Error(
        "Supabase could not be initialized. Check your internet connection and Supabase library."
      );
    }

    return window.CREST_EXAM.client;
  };

  window.CREST_EXAM.getStudentSessionToken = function () {
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

      if (value) {
        try {
          const parsed = JSON.parse(value);

          if (typeof parsed === "string") return parsed;
          if (parsed.token) return parsed.token;
          if (parsed.session_token) return parsed.session_token;
        } catch (_) {
          return value;
        }
      }
    }

    return "";
  };

  window.CREST_EXAM.message = function (element, text, type = "info") {
    if (!element) return;

    element.textContent = text;
    element.className = "message " + type;
  };

  window.CREST_EXAM.escape = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  };

  window.CREST_EXAM.formatDate = function (value) {
    if (!value) return "Not scheduled";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Not scheduled"
      : date.toLocaleString();
  };

  window.CREST_EXAM.rpc = async function (name, params) {
    const { data, error } =
      await window.CREST_EXAM.getClient().rpc(name, params);

    if (error) throw error;

    return data;
  };

  window.CREST_EXAM.requireTeacher = async function () {
    const client = window.CREST_EXAM.getClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error || !user) {
      throw new Error(
        "Please sign in using your CREST teacher account."
      );
    }

    const {
      data: profile,
      error: profileError
    } = await client
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !["teacher", "admin"].includes(profile.role)
    ) {
      throw new Error(
        "This account is not registered as a CREST teacher or administrator."
      );
    }

    return { user, profile };
  };

})();
