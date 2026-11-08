
(() => {
  "use strict";

  const client = window.CREST_EXAM;

  const $ = (id) => document.getElementById(id);

  const loginPanel = $("loginPanel");
  const dashboard = $("dashboard");
  const loginForm = $("loginForm");
  const loginButton = $("loginButton");
  const emailInput = $("email");
  const passwordInput = $("password");
  const adminIdentity = $("adminIdentity");
  const dashboardMessage = $("dashboardMessage");
  const teachersBody = $("teachersBody");
  const examsBody = $("examsBody");

  if (!client) {
    alert("CREST Supabase connection is missing. Check exam.js.");
    return;
  }

  function message(text, error = false) {
    if (!dashboardMessage) return;
    dashboardMessage.textContent = text;
    dashboardMessage.style.color = error ? "#dc2626" : "#15803d";
  }

  async function edge(action, payload = {}) {
    const { data, error } = await client.functions.invoke(
      "crest-admin-teachers",
      { body: { action, ...payload } }
    );

    if (error) throw new Error(error.message || "Edge Function failed.");
    if (data?.error) throw new Error(data.error);

    return data;
  }

  async function verifySuperAdmin() {
    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();

    if (sessionError || !sessionData.session) return false;

    const { data, error } = await client
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", sessionData.session.user.id)
      .single();

    if (error || data?.role !== "super_admin") {
      return false;
    }

    if (adminIdentity) {
      adminIdentity.textContent =
        data.full_name || data.email || "Super Admin";
    }

    return true;
  }

  function showLogin() {
    if (loginPanel) loginPanel.style.display = "block";
    if (dashboard) dashboard.style.display = "none";
  }

  function showDashboard() {
    if (loginPanel) loginPanel.style.display = "none";
    if (dashboard) dashboard.style.display = "block";
  }

  function addTeacherPanel() {
    if (!dashboard || $("crestTeacherPanel")) return;

    const panel = document.createElement("section");
    panel.id = "crestTeacherPanel";
    panel.className = "card";
    panel.style.cssText =
      "background:white;padding:20px;margin:20px 0;border-radius:12px;";

    panel.innerHTML = `
      <h2>Register New Teacher</h2>
      <form id="crestTeacherForm">
        <p>
          <label>Teacher Full Name</label><br>
          <input id="crestTeacherName" type="text" required
            placeholder="Enter full name"
            style="width:100%;padding:12px;margin:6px 0;">
        </p>
        <p>
          <label>Email Address</label><br>
          <input id="crestTeacherEmail" type="email" required
            placeholder="teacher@example.com"
            style="width:100%;padding:12px;margin:6px 0;">
        </p>
        <p>
          <label>Temporary Password (minimum 8 characters)</label><br>
          <input id="crestTeacherPassword" type="password"
            minlength="8" required
            placeholder="Create temporary password"
            style="width:100%;padding:12px;margin:6px 0;">
        </p>
        <button id="crestTeacherSubmit" type="submit"
          style="padding:12px 22px;cursor:pointer;">
          Register Teacher
        </button>
      </form>
      <p id="crestTeacherMessage" role="status"></p>
    `;

    dashboard.prepend(panel);

    $("crestTeacherForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      const button = $("crestTeacherSubmit");
      const output = $("crestTeacherMessage");

      button.disabled = true;
      button.textContent = "Registering...";
      output.textContent = "";

      try {
        const result = await edge("create", {
          full_name: $("crestTeacherName").value.trim(),
          email: $("crestTeacherEmail").value.trim(),
          password: $("crestTeacherPassword").value
        });

        output.style.color = "green";
        output.textContent =
          result.message || "Teacher registered successfully.";

        $("crestTeacherForm").reset();
        await loadTeachers();

      } catch (error) {
        output.style.color = "red";
        output.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = "Register Teacher";
      }
    });
  }

  async function loadTeachers() {
    const result = await edge("list");
    const teachers = result.teachers || [];

    if ($("teacherCount")) {
      $("teacherCount").textContent = teachers.length;
    }

    if (!teachersBody) return;

    teachersBody.innerHTML = "";

    if (!teachers.length) {
      teachersBody.innerHTML =
        '<tr><td colspan="3">No teachers registered yet.</td></tr>';
      return;
    }

    teachers.forEach((teacher) => {
      const tr = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = teacher.full_name || "Unnamed";
      if (teacher.email) {
        const small = document.createElement("small");
        small.textContent = teacher.email;
        small.style.display = "block";
        nameCell.appendChild(small);
      }

      const roleCell = document.createElement("td");
      roleCell.textContent = teacher.role || "teacher";

      const idCell = document.createElement("td");
      idCell.textContent = teacher.id || "";

      tr.append(nameCell, roleCell, idCell);
      teachersBody.appendChild(tr);
    });
  }

  async function loadDashboard() {
    message("Loading dashboard...");

    try {
      const { count: students, error: studentError } = await client
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "student");

      if (studentError) throw studentError;

      const { count: exams, error: examError } = await client
        .from("examinations")
        .select("*", { count: "exact", head: true });

      if (examError) throw examError;

      if ($("studentCount")) $("studentCount").textContent = students ?? 0;
      if ($("examCount")) $("examCount").textContent = exams ?? 0;

      await loadTeachers();

      message("Dashboard loaded successfully.");
    } catch (error) {
      message(error.message, true);
    }
  }

  async function startDashboard() {
    const authorised = await verifySuperAdmin();

    if (!authorised) {
      await client.auth.signOut();
      showLogin();
      message("Super Admin account not authorised.", true);
      return;
    }

    showDashboard();
    addTeacherPanel();
    await loadDashboard();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = "Signing in...";
      }

      try {
        const { error } = await client.auth.signInWithPassword({
          email: emailInput.value.trim(),
          password: passwordInput.value
        });

        if (error) throw error;

        await startDashboard();

      } catch (error) {
        message(error.message, true);
      } finally {
        if (loginButton) {
          loginButton.disabled = false;
          loginButton.textContent = "Sign In";
        }
      }
    });
  }

  if ($("refreshButton")) {
    $("refreshButton").addEventListener("click", loadDashboard);
  }

  if ($("logoutButton")) {
    $("logoutButton").addEventListener("click", async () => {
      await client.auth.signOut();
      showLogin();
    });
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      showLogin();
    }
  });

  showLogin();

  client.auth.getSession().then(({ data }) => {
    if (data.session) startDashboard();
  });
})();
