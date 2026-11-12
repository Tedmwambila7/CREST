/* CREST Examination — shared Supabase connection and helpers */
(() => {
  "use strict";

  const SUPABASE_URL = "https://rvsmsucxgpdpdequzteb.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c21zdWN4Z3BkcGRlcXV6dGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5Nzg1MjcsImV4cCI6MjEwOTU1NDUyN30.S-HtfXgJFkrZYeglb1Y-cCLg7EhKrkV4DCrw1qwSjw0";

  const E = window.CREST_EXAM = window.CREST_EXAM || {};
  E.client = E.client || null;

  if (!E.client) {
    if (!window.supabase?.createClient) {
      console.error("Supabase library has not loaded.");
    } else {
      E.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
  }

  E.getClient = function () {
    if (!E.client) {
      throw new Error("Supabase is unavailable. Check your internet connection and the Supabase script.");
    }
    return E.client;
  };

  E.escape = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  };

  E.formatDate = function (value, fallback = "Not scheduled") {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? fallback
      : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  E.message = function (element, text, type = "info") {
    if (!element) return;
    element.textContent = text || "";
    element.className = `message ${type}`;
    element.setAttribute("role", type === "error" ? "alert" : "status");
  };

  E.rpc = async function (name, params = {}) {
    const { data, error } = await E.getClient().rpc(name, params);
    if (error) throw error;
    return data;
  };


  // Exchange the MAIN CREST login token for a short-lived signed exam token.
  // The signing secret stays server-side in the hyper-responder Edge Function.
  E.getExamSessionToken = async function () {
    const sessionToken = E.getStudentSessionToken();
    if (!sessionToken) {
      throw new Error("Your CREST student session was not found. Sign in on the main CREST website first.");
    }

    const MAIN_SUPABASE_URL = "https://otjybdiyoqnsynjbofuj.supabase.co";
    const MAIN_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc";

    let response;
    try {
      response = await fetch(`${MAIN_SUPABASE_URL}/functions/v1/hyper-responder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": MAIN_SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${MAIN_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ session_token: sessionToken })
      });
    } catch (_) {
      throw new Error("Could not connect to the CREST examination authentication service. Check your internet connection.");
    }

    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok || !result.exam_session_token) {
      throw new Error(result.error || `Student authentication failed (HTTP ${response.status}).`);
    }
    return result.exam_session_token;
  };

  E.requireTeacher = async function () {
    const client = E.getClient();
    const { data: { user }, error } = await client.auth.getUser();

    if (error || !user) {
      throw new Error("Please sign in using your CREST teacher or administrator account.");
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const allowedRoles = ["teacher", "admin", "super_admin"];
    if (!profile || !allowedRoles.includes(profile.role)) {
      throw new Error("This account does not have permission to manage examinations.");
    }

    return { user, profile };
  };

  E.getStudentSessionToken = function () {
    if (typeof window.getCrestStudentSessionToken === "function") {
      return window.getCrestStudentSessionToken() || "";
    }

    const keys = [
      "crestStudentSession", "crest_student_session", "crestSession",
      "studentSession", "student_session", "crest_token", "session_token"
    ];

    try {
      for (const key of keys) {
        const value = window.localStorage?.getItem(key);
        if (!value) continue;
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === "string") return parsed;
          if (parsed?.token) return parsed.token;
          if (parsed?.session_token) return parsed.session_token;
        } catch (_) {
          return value;
        }
      }
    } catch (error) {
      console.warn("Student session storage is unavailable:", error);
    }
    return "";
  };
})();
