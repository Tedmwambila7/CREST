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
