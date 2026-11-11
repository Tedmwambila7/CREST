/* CREST Examination — shared connection and secure two-project student bridge */
(() => {
  "use strict";

  const SUPABASE_URL = "https://rvsmsucxgpdpdequzteb.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c21zdWN4Z3BkcGRlcXV6dGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5Nzg1MjcsImV4cCI6MjEwOTU1NDUyN30.S-HtfXgJFkrZYeglb1Y-cCLg7EhKrkV4DCrw1qwSjw0";
  // Public anon key only. Never put a service-role key in browser code.

  const E = window.CREST_EXAM = window.CREST_EXAM || {};
  E.client = E.client || null;
  if (!E.client && window.supabase?.createClient) {
    E.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  E.getClient = function () {
    if (!E.client) throw new Error("Supabase is unavailable. Check the Supabase script and anon key.");
    return E.client;
  };

  E.escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  E.formatDate = function (value, fallback = "Not scheduled") {
    if (!value) return fallback;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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

  E.getStudentSessionToken = function () {
    if (typeof window.getCrestStudentSessionToken === "function") {
      const value = window.getCrestStudentSessionToken();
      if (value) return String(value);
    }
    const keys = ["crestStudentSession", "crest_student_session", "crestSession", "studentSession", "student_session", "crest_token", "session_token"];
    for (const key of keys) {
      try {
        const raw = window.localStorage?.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "string") return parsed;
          if (parsed?.token) return String(parsed.token);
          if (parsed?.session_token) return String(parsed.session_token);
        } catch (_) { return raw; }
      } catch (_) { /* Try the next known portal storage key. */ }
    }
    return "";
  };

  E.clearExamSession = function () {
    try { window.sessionStorage.removeItem("crestExamSession"); } catch (_) {}
  };

  E.getExamSessionToken = function () {
    try {
      const raw = window.sessionStorage.getItem("crestExamSession");
      if (!raw) return "";
      const saved = JSON.parse(raw);
      if (!saved?.session_token || !saved?.expires_at || new Date(saved.expires_at).getTime() <= Date.now()) {
        E.clearExamSession();
        return "";
      }
      return String(saved.session_token);
    } catch (_) { return ""; }
  };

  E.connectStudent = async function () {
    const cached = E.getExamSessionToken();
    if (cached) return cached;

    const mainToken = E.getStudentSessionToken();
    if (!mainToken) throw new Error("Your MAIN CREST login was not found. Sign in to the main CREST Academy portal first.");

    const { data, error } = await E.getClient().functions.invoke("super-action", {
      body: { session_token: mainToken }
    });
    if (error) throw new Error(error.message || "Could not connect your CREST student account to examinations.");
    if (!data?.success || !data?.session_token || !data?.expires_at) {
      throw new Error(data?.error || "The examination session could not be created. Please sign in again.");
    }

    try {
      window.sessionStorage.setItem("crestExamSession", JSON.stringify({
        session_token: data.session_token,
        student_name: data.student_name || "Student",
        expires_at: data.expires_at
      }));
    } catch (_) {
      throw new Error("Your browser blocked session storage. Enable session storage and reload this page.");
    }
    return data.session_token;
  };

  // Every student action now uses the short-lived Examination session token.
  // The MAIN CREST login token is sent only once to super-action for exchange.
  E.studentAction = async function (action, params = {}) {
    const examToken = E.getExamSessionToken() || await E.connectStudent();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/crest-student-exams`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ action, ...params, p_exam_session_token: examToken })
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.error) {
      if (response.status === 401 || response.status === 403) E.clearExamSession();
      throw new Error(payload?.error || `Student examination request failed (${response.status}).`);
    }
    return payload;
  };

  E.requireTeacher = async function () {
    const client = E.getClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error("Please sign in using your CREST teacher or administrator account.");
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("id, full_name, email, role").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !["teacher", "admin", "super_admin"].includes(profile.role)) {
      throw new Error("This account does not have permission to manage examinations.");
    }
    return { user, profile };
  };
})();
