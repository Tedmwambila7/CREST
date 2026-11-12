/* CREST examinations — shared configuration and helpers.
   Replace the two placeholders. Never use a Supabase service_role key here. */
(() => {
  const SUPABASE_URL = "https://otjybdiyoqnsynjbofuj.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc";

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
    // The main CREST homepage stores { name, phone, token } in localStorage.
    if (typeof window.getCrestStudentSessionToken === "function") {
      const direct = window.getCrestStudentSessionToken();
      if (direct) return direct;
    }
    try {
      const raw = localStorage.getItem("crestStudentSession") ||
                  sessionStorage.getItem("crestStudentSession");
      if (!raw) return "";
      const session = JSON.parse(raw);
      return session && typeof session.token === "string" ? session.token : "";
    } catch (_) {
      return "";
    }
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
