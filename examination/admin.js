/* CRESTACADA Super Admin — first release.
   Uses the existing examinations/exam.js Supabase client.
   No service_role key or privileged browser-side operations. */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const loginPanel = $("loginPanel"), dashboard = $("dashboard");

  function showMessage(el, message, kind) {
    el.textContent = message || "";
    el.className = "message " + (kind || "");
  }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }
  function showLogin(message) {
    dashboard.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    if (message) showMessage($("loginMessage"), message, "error");
  }
  function showDashboard() {
    loginPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
  }

  async function verifySuperAdmin() {
    const client = E.getClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error("Please sign in with your Supabase Auth account.");
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      throw new Error("Your account has no readable profile. Ask the database administrator to check public.profiles.");
    }
    if (profile.role !== "super_admin") {
      throw new Error("Access denied. This account has not been assigned the super_admin role.");
    }
    $("adminIdentity").textContent = (profile.full_name || user.email || "Administrator") + " · " + user.email;
    return { client, user, profile };
  }

  async function loadDashboard() {
    const client = E.getClient();
    showMessage($("dashboardMessage"), "Loading records…");
    const results = await Promise.allSettled([
      client.from("profiles").select("id, full_name, role").eq("role", "teacher").order("full_name"),
      client.from("profiles").select("id").eq("role", "student"),
      client.from("examinations").select("id, title, subject, status, created_at").order("created_at", {ascending:false}).limit(10)
    ]);

    const [teachers, students, exams] = results;
    $("teacherCount").textContent = teachers.status === "fulfilled" && !teachers.value.error ? teachers.value.data.length : "—";
    $("studentCount").textContent = students.status === "fulfilled" && !students.value.error ? students.value.data.length : "—";
    $("examCount").textContent = exams.status === "fulfilled" && !exams.value.error ? exams.value.data.length : "—";

    if (teachers.status === "fulfilled" && !teachers.value.error) {
      const rows = teachers.value.data || [];
      $("teachersBody").innerHTML = rows.length ? rows.map(p =>
        `<tr><td>${esc(p.full_name || "Unnamed")}</td><td><span class="tag">${esc(p.role)}</span></td><td>${esc(p.id.slice(0,8))}…</td></tr>`
      ).join("") : '<tr><td colspan="3">No teacher profiles found.</td></tr>';
    } else {
      $("teachersBody").innerHTML = '<tr><td colspan="3">Teacher records are not readable under the current database policies.</td></tr>';
    }

    if (exams.status === "fulfilled" && !exams.value.error) {
      const rows = exams.value.data || [];
      $("examsBody").innerHTML = rows.length ? rows.map(x =>
        `<tr><td>${esc(x.title)}</td><td>${esc(x.subject)}</td><td>${esc(x.status)}</td></tr>`
      ).join("") : '<tr><td colspan="3">No examinations found.</td></tr>';
    } else {
      $("examsBody").innerHTML = '<tr><td colspan="3">Examinations are not readable under the current database policies.</td></tr>';
    }

    const warnings = [];
    if (teachers.status !== "fulfilled" || teachers.value.error) warnings.push("teacher list");
    if (students.status !== "fulfilled" || students.value.error) warnings.push("student count");
    if (exams.status !== "fulfilled" || exams.value.error) warnings.push("examination list");
    showMessage($("dashboardMessage"),
      warnings.length ? "Signed in as Super Admin. Some sections need database read permissions: " + warnings.join(", ") + "." : "Super Admin access verified. Dashboard data loaded.",
      warnings.length ? "" : "success");
  }

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("loginButton");
    button.disabled = true;
    showMessage($("loginMessage"), "Signing in…");
    try {
      const client = E.getClient();
      const { error } = await client.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("password").value
      });
      if (error) throw error;
      await verifySuperAdmin();
      showDashboard();
      await loadDashboard();
    } catch (error) {
      try { await E.getClient().auth.signOut(); } catch (_) {}
      showLogin(error.message || "Administrator sign-in failed.");
    } finally {
      button.disabled = false;
    }
  });

  $("refreshButton").addEventListener("click", async () => {
    try { await verifySuperAdmin(); await loadDashboard(); }
    catch (error) { showLogin(error.message); }
  });
  $("logoutButton").addEventListener("click", async () => {
    try { await E.getClient().auth.signOut(); } finally { showLogin("You have signed out."); }
  });

  (async () => {
    try {
      await verifySuperAdmin();
      showDashboard();
      await loadDashboard();
    } catch (_) {
      showLogin();
    }
  })();
})();
