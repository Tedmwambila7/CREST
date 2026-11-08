
(() => {
  "use strict";

  const client = window.CREST_EXAM;
  const $ = id => document.getElementById(id);

  if (!client) {
    alert("CREST connection missing. Check exam.js.");
    return;
  }

  const loginPanel = $("loginPanel");
  const dashboard = $("dashboard");
  const loginForm = $("loginForm");
  const dashboardMessage = $("dashboardMessage");

  function showMessage(text, error = false) {
    if (dashboardMessage) {
      dashboardMessage.textContent = text;
      dashboardMessage.style.color = error ? "red" : "green";
    }
  }

  async function callFunction(action, payload = {}) {
    const { data, error } = await client.functions.invoke(
      "crest-admin-teachers",
      { body: { action, ...payload } }
    );

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    return data;
  }

  async function verifyAdmin() {
    const { data: session } = await client.auth.getSession();

    if (!session.session) return false;

    const { data, error } = await client
      .from("profiles")
      .select("full_name,email,role")
      .eq("id", session.session.user.id)
      .single();

    if (error || data?.role !== "super_admin") return false;

    if ($("adminIdentity")) {
      $("adminIdentity").textContent =
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

  function createTeacherPanel() {
    if ($("crestTeacherPanel") || !dashboard) return;

    const panel = document.createElement("section");
    panel.id = "crestTeacherPanel";

    panel.style.cssText = `
      display:block!important;
      visibility:visible!important;
      background:#ffffff;
      color:#172033;
      padding:25px;
      margin:20px 0;
      border:2px solid #d8e2ef;
      border-radius:12px;
      width:100%;
      box-sizing:border-box;
    `;

    panel.innerHTML = `
      <h2 style="color:#123b70;margin-top:0">
        Register New Teacher
      </h2>

      <form id="crestTeacherForm">

        <label for="crestTeacherName">Full Name</label>
        <input id="crestTeacherName" required
          type="text" placeholder="Teacher full name"
          style="display:block;width:100%;box-sizing:border-box;padding:13px;margin:8px 0 18px;border:1px solid #aaa;border-radius:6px;">

        <label for="crestTeacherEmail">Email Address</label>
        <input id="crestTeacherEmail" required
          type="email" placeholder="teacher@example.com"
          style="display:block;width:100%;box-sizing:border-box;padding:13px;margin:8px 0 18px;border:1px solid #aaa;border-radius:6px;">

        <label for="crestTeacherPassword">Temporary Password</label>
        <input id="crestTeacherPassword" required
          type="password" minlength="8"
          placeholder="Minimum 8 characters"
          style="display:block;width:100%;box-sizing:border-box;padding:13px;margin:8px 0 18px;border:1px solid #aaa;border-radius:6px;">

        <button id="crestTeacherSubmit" type="submit"
          style="display:block!important;visibility:visible!important;opacity:1!important;width:100%;padding:16px;background:#123b70!important;color:#ffffff!important;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">
          REGISTER TEACHER
        </button>

      </form>

      <p id="crestTeacherMessage"
        style="font-weight:bold;margin-top:15px"></p>
    `;

    dashboard.prepend(panel);

    $("crestTeacherForm").addEventListener("submit", async event => {
      event.preventDefault();

      const button = $("crestTeacherSubmit");
      const output = $("crestTeacherMessage");

      button.disabled = true;
      button.textContent = "REGISTERING...";

      try {
        const result = await callFunction("create", {
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
        button.textContent = "REGISTER TEACHER";
      }
    });
  }

  async function loadTeachers() {
    const result = await callFunction("list");
    const teachers = result.teachers || [];

    if ($("teacherCount")) {
      $("teacherCount").textContent = teachers.length;
    }

    const body = $("teachersBody");
    if (!body) return;

    body.innerHTML = "";

    if (!teachers.length) {
      body.innerHTML =
        '<tr><td colspan="3">No teachers registered yet.</td></tr>';
      return;
    }

    teachers.forEach(teacher => {
      const row = document.createElement("tr");

      const name = document.createElement("td");
      name.textContent = teacher.full_name || "Unnamed";

      const email = document.createElement("small");
      email.textContent = teacher.email || "";
      email.style.display = "block";
      name.appendChild(email);

      const role = document.createElement("td");
      role.textContent = teacher.role || "teacher";

      const id = document.createElement("td");
      id.textContent = teacher.id || "";

      row.append(name, role, id);
      body.appendChild(row);
    });
  }

  async function loadDashboard() {
    showMessage("Loading dashboard...");

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
      showMessage("Dashboard loaded successfully.");

    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function startDashboard() {
    if (!await verifyAdmin()) {
      await client.auth.signOut();
      showLogin();
      showMessage("Super Admin access required.", true);
      return;
    }

    showDashboard();
    createTeacherPanel();
    await loadDashboard();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const button = $("loginButton");
      if (button) {
        button.disabled = true;
        button.textContent = "Signing in...";
      }

      try {
        const { error } = await client.auth.signInWithPassword({
          email: $("email").value.trim(),
          password: $("password").value
        });

        if (error) throw error;

        await startDashboard();

      } catch (error) {
        showMessage(error.message, true);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "Sign In";
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

  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showLogin();
  });

  showLogin();

  client.auth.getSession().then(({ data }) => {
    if (data.session) startDashboard();
  });

})();

 
