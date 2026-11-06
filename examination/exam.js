
/* CREST examinations — shared configuration and helpers.
   Connected to MAIN CREST Supabase project.
   Never use a service_role key in browser code.
*/

(() => {
  const SUPABASE_URL =
    "https://otjybdiyoqnsynjbofuj.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_GijXkClgkvYF4vAC07qvPA_l3Zy7KHM";

  window.CREST_EXAM = window.CREST_EXAM || {};
  window.CREST_EXAM.client = null;

  // Initialize Supabase
  if (
    window.supabase &&
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY.startsWith("sb_publishable_")
  ) {
    window.CREST_EXAM.client =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
  }

  // Get Supabase client
  window.CREST_EXAM.getClient = function () {
    if (!window.CREST_EXAM.client) {
      throw new Error(
        "Supabase is not configured. Check the Supabase library and CREST configuration."
      );
    }

    return window.CREST_EXAM.client;
  };

  // Student session token helper
  window.CREST_EXAM.getStudentSessionToken = function () {
    if (
      typeof window.getCrestStudentSessionToken === "function"
    ) {
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

  // Display messages
  window.CREST_EXAM.message = function (
    element,
    text,
    type = "info"
  ) {
    if (!element) return;

    element.textContent = text;
    element.className = "message " + type;
  };

  // Escape HTML
  window.CREST_EXAM.escape = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  };

  // Format dates
  window.CREST_EXAM.formatDate = function (value) {
    if (!value) return "Not scheduled";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Not scheduled"
      : date.toLocaleString();
  };

  // Supabase RPC helper
  window.CREST_EXAM.rpc = async function (name, params) {
    const { data, error } =
      await window.CREST_EXAM.getClient().rpc(name, params);

    if (error) throw error;

    return data;
  };

  // Require a signed-in teacher or administrator
  window.CREST_EXAM.requireTeacher = async function () {
    const client = window.CREST_EXAM.getClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error || !user) {
      throw new Error(
        "Please sign in using your CREST account."
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
        "You are not registered as CREST teaching or administrative staff."
      );
    }

    return { user, profile };
  };

  // Require Super Admin specifically
  window.CREST_EXAM.requireSuperAdmin = async function () {
    const { user, profile } =
      await window.CREST_EXAM.requireTeacher();

    if (profile.role !== "super_admin") {
      throw new Error("Super Admin access required.");
    }

    return { user, profile };
  };

})();


