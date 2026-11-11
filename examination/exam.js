
/* CREST Examination — shared connection and secure two-project student bridge */
(() => {
  "use strict";

  const SUPABASE_URL =
    "https://rvsmsucxgpdpdequzteb.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiLCJyZWYiOiJydnNtc3VjeGdwZHBkZXF1enRlYiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkzOTc4NTI3LCJleHAiOjIxMDk1NTQ1Mjd9.S-HtfXgJFkrZYeglb1Y-cCLg7EhKrkV4DCrw1qwSjw0";

  // Public anon key only. Never put service-role keys here.

  const E = window.CREST_EXAM =
    window.CREST_EXAM || {};

  E.client = E.client || null;

  if (!E.client && window.supabase?.createClient) {
    E.client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  // ------------------------------------------------
  // SUPABASE CLIENT
  // ------------------------------------------------

  E.getClient = function () {
    if (!E.client) {
      throw new Error(
        "Supabase is unavailable. Check the Supabase script and anon key."
      );
    }

    return E.client;
  };

  // ------------------------------------------------
  // ERROR DETAILS
  // ------------------------------------------------

  E.getFunctionError = async function (error) {
    let details =
      error?.message ||
      "The examination server request failed.";

    if (error?.context) {
      try {
        const response = await error.context.clone().json();

        details =
          response.details ||
          response.error ||
          response.message ||
          details;
      } catch (_) {
        // Keep original error.
      }
    }

    return details;
  };

  // ------------------------------------------------
  // HTML ESCAPING
  // ------------------------------------------------

  E.escape = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  // ------------------------------------------------
  // DATE FORMAT
  // ------------------------------------------------

  E.formatDate = function (
    value,
    fallback = "Not scheduled"
  ) {
    if (!value) return fallback;

    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? fallback
      : d.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        });
  };

  // ------------------------------------------------
  // MESSAGE DISPLAY
  // ------------------------------------------------

  E.message = function (
    element,
    text,
    type = "info"
  ) {
    if (!element) return;

    element.textContent = text || "";
    element.className = `message ${type}`;

    element.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );
  };

  // ------------------------------------------------
  // RPC HELPER
  // ------------------------------------------------

  E.rpc = async function (
    name,
    params = {}
  ) {
    const { data, error } =
      await E.getClient().rpc(name, params);

    if (error) throw error;

    return data;
  };

  // ------------------------------------------------
  // MAIN CREST STUDENT SESSION
  // ------------------------------------------------

  E.getStudentSessionToken = function () {
    if (
      typeof window.getCrestStudentSessionToken ===
      "function"
    ) {
      const value =
        window.getCrestStudentSessionToken();

      if (value) return String(value);
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
      try {
        const raw = window.localStorage?.getItem(key);

        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);

          if (typeof parsed === "string") {
            return parsed;
          }

          if (parsed?.token) {
            return String(parsed.token);
          }

          if (parsed?.session_token) {
            return String(parsed.session_token);
          }
        } catch (_) {
          return raw;
        }
      } catch (_) {
        // Try next storage key.
      }
    }

    return "";
  };

  // ------------------------------------------------
  // EXAMINATION SESSION MANAGEMENT
  // ------------------------------------------------

  E.clearExamSession = function () {
    try {
      window.sessionStorage.removeItem(
        "crestExamSession"
      );
    } catch (_) {}
  };

  E.getExamSessionToken = function () {
    try {
      const raw =
        window.sessionStorage.getItem(
          "crestExamSession"
        );

      if (!raw) return "";

      const saved = JSON.parse(raw);

      if (
        !saved?.session_token ||
        !saved?.expires_at ||
        new Date(saved.expires_at).getTime() <= Date.now()
      ) {
        E.clearExamSession();
        return "";
      }

      return String(saved.session_token);
    } catch (_) {
      return "";
    }
  };

  // ------------------------------------------------
  // CONNECT MAIN CREST TO EXAMINATION
  // ------------------------------------------------

  E.connectStudent = async function () {
    const cached = E.getExamSessionToken();

    if (cached) return cached;

    const mainToken = E.getStudentSessionToken();

    if (!mainToken) {
      throw new Error(
        "Your MAIN CREST login was not found. Please sign in to the main portal first."
      );
    }

    let data;
    let error;

    try {
      const result =
        await E.getClient().functions.invoke(
          "super-action",
          {
            body: {
              session_token: mainToken
            }
          }
        );

      data = result.data;
      error = result.error;

    } catch (requestError) {
      throw new Error(
        "Could not contact the examination server: " +
        (requestError?.message || String(requestError))
      );
    }

    if (error) {
      const details =
        await E.getFunctionError(error);

      throw new Error(
        "Student connection error: " + details
      );
    }

    if (!data?.success) {
      throw new Error(
        data?.details ||
        data?.error ||
        "The examination server did not approve the student connection."
      );
    }

    if (
      !data.session_token ||
      !data.expires_at
    ) {
      throw new Error(
        "The server did not return a valid examination session."
      );
    }

    try {
      window.sessionStorage.setItem(
        "crestExamSession",
        JSON.stringify({
          session_token: data.session_token,
          student_name: data.student_name || "Student",
          expires_at: data.expires_at
        })
      );
    } catch (_) {
      throw new Error(
        "Your browser blocked session storage. Enable session storage and reload this page."
      );
    }

    return data.session_token;
  };

  // ------------------------------------------------
  // STUDENT EXAMINATION ACTIONS
  // ------------------------------------------------

  E.studentAction = async function (
    action,
    params = {}
  ) {
    const allowedActions = [
      "list",
      "start",
      "questions",
      "save",
      "submit"
    ];

    if (!allowedActions.includes(action)) {
      throw new Error(
        "Invalid student examination action."
      );
    }

    const examToken =
      E.getExamSessionToken() ||
      await E.connectStudent();

    const { data, error } =
      await E.getClient().functions.invoke(
        "crest-student-exams",
        {
          body: {
            ...params,
            action,
            p_exam_session_token: examToken
          }
        }
      );

    if (error) {
      const details =
        await E.getFunctionError(error);

      if (
        error.context?.status === 401 ||
        error.context?.status === 403
      ) {
        E.clearExamSession();
      }

      throw new Error(
        "Examination request failed: " + details
      );
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  };

  // ------------------------------------------------
  // TEACHER AUTHENTICATION
  // ------------------------------------------------

  E.requireTeacher = async function () {
    const client = E.getClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error || !user) {
      throw new Error(
        "Please sign in using your CREST teacher or administrator account."
      );
    }

    const {
      data: profile,
      error: profileError
    } = await client
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (
      !profile ||
      !["teacher", "admin", "super_admin"].includes(
        profile.role
      )
    ) {
      throw new Error(
        "This account does not have permission to manage examinations."
      );
    }

    return {
      user,
      profile
    };
  };

})();
