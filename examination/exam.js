/* CREST examinations — shared configuration and helpers.
   Replace the two placeholders. Never use a Supabase service_role key here. */
(() => {
  const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
  const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";

  window.CREST_EXAM = window.CREST_EXAM || {};
  window.CREST_EXAM.client = null;

  if (window.supabase && SUPABASE_URL.startsWith("https://") &&
      !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_")) {
    window.CREST_EXAM.client =
      window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  window.CREST_EXAM.getClient = function () {
    if (!window.CREST_EXAM.client) {
      throw new Error("Supabase is not configured. Edit examinations/exam.js first.");
    }
    return window.CREST_EXAM.client;
  };

  // IMPORTANT: connect this function to the token key used by your existing CREST login.
  window.CREST_EXAM.getStudentSessionToken = function () {
    if (typeof window.getCrestStudentSessionToken === "function") {
      return window.getCrestStudentSessionToken();
    }
    const keys = [
      "crestStudentSession", "crest_student_session", "crestSession",
      "studentSession", "student_session", "crest_token", "session_token"
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
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[c]);
  };

  window.CREST_EXAM.formatDate = function (value) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not scheduled" : date.toLocaleString();
  };

  window.CREST_EXAM.rpc = async function (name, params) {
    const { data, error } = await window.CREST_EXAM.getClient().rpc(name, params);
    if (error) throw error;
    return data;
  };

  window.CREST_EXAM.requireTeacher = async function () {
    const client = window.CREST_EXAM.getClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      throw new Error("Please sign in using the CREST teacher account connected to Supabase Auth.");
    }
    const { data: profile, error: profileError } = await client
      .from("profiles").select("role, full_name").eq("id", user.id).single();
    if (profileError || !profile || !["teacher", "admin"].includes(profile.role)) {
      throw new Error("This account is not registered as a CREST teacher or administrator.");
    }
    return { user, profile };
  };
})();
