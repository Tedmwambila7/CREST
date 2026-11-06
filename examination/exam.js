
/* CREST examinations — shared configuration and helpers.
   Uses the MAIN CREST Supabase project.
   NEVER use a service_role key in browser code.
*/
(() => {
  const SUPABASE_URL =
    "https://otjybdiyoqnsynjbofuj.supabase.co";

  // Paste the MAIN CREST project's publishable/anon key here.
  const SUPABASE_ANON_KEY =
    "PASTE_MAIN_CREST_PUBLISHABLE_KEY_HERE";

  window.CREST_EXAM = window.CREST_EXAM || {};
  window.CREST_EXAM.client = null;

  if (
    window.supabase &&
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_ANON_KEY.includes("PASTE_")
  ) {
    window.CREST_EXAM.client =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
  }

  window.CREST_EXAM.getClient = function () {
    if (!window.CREST_EXAM.client) {
      throw new Error(
        "Supabase is not configured. Check the main CREST URL and publishable key."
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

  window.CREST_EXAM.message = function (
    element,
    text,
    type = "info"
  ) {
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

  // Require a signed-in CREST staff account.
  window.CREST_EXAM.requireTeacher = async function () {
    const client = window.CREST_EXAM.getClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error || !user) {
      throw new Error(
        "Please sign in using your CREST Supabase account."
      );
    }

    const { data: profile, error: profileError } = await client
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
        "This account is not registered as CREST teaching or administrative staff."
      );
    }

    return { user, profile };
  };

  // Require the actual Super Admin role.
  window.CREST_EXAM.requireSuperAdmin = async function () {
    const { user, profile } =
      await window.CREST_EXAM.requireTeacher();

    if (profile.role !== "super_admin") {
      throw new Error(
        "Super Admin access required."
      );
    }

    return { user, profile };
  };

})();

