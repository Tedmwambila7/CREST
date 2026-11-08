
/* CRESTACADA SUPER ADMIN - CORRECTED */
(() => {
  "use strict";

  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);

  if (!E || typeof E.getClient !== "function") {
    alert("CREST connection error. Check that exam.js loads before admin.js.");
    return;
  }

  const client = E.getClient();

  function showMessage(element, message, kind = "") {
    if (!element) return;
    element.textContent = message || "";
    element.className = "message " + kind;
  }

  function showLogin(message = "") {
    $("dashboard")?.classList.add("hidden");
    $("loginPanel")?.classList.remove("hidden");
    if (message) showMessage($("loginMessage"), message, "error");
  }

  function showDashboard() {
    $("loginPanel")?.classList.add("hidden");
    $("dashboard")?.classList.remove("hidden");
  }

  async function verifySuperAdmin() {
    const { data: { user }, error } = await client.auth.getUser();

    if (error || !user) {
      throw new Error("Please sign in with your CREST administrator account.");
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Administrator profile could not be verified.");
    }

    if (profile.role !== "super_admin") {
      throw new Error("This account does not have Super Admin permission.");
    }

    if ($("adminIdentity")) {
      $("adminIdentity").textContent =
        (profile.full_name || user.email) + " · " + user.email;
    }

    return user;
  }

  async function callTeacherFunction(action, payload = {}) {
    const { data, error } = await client.functions.invoke(
      "super-function",
      { body: { action, ...payload } }
    );

    if (error) {
      throw new Error(error.message || "Teacher service could not be reached.");
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  }

  function createTeacherPanel() {
    if ($("crestTeacherPanel")) return;

    const dashboard = $("dashboard");
    if (!dashboard) {
      throw new Error("The dashboard element was not found.");
    }

    const panel = document.createElement("section");
    panel.id = "crestTeacherPanel";
    panel.style.cssText = `
      display:block!important;
      visibility:visible!important;
      background:#fff!important;
      color:#172033!important;
      padding:24px!important;
      margin:24px 0!important;
      border:2px solid #d8e2ef!important;
      border-radius:12px!important;
      width:100%!important;
      box-sizing:border-box!important;
      position:relative!important;
      z-index:10!important;
    `;

    panel.innerHTML = `
      <h2 style="color:#123b70!important;margin:0 0 20px!important">
        Register New Teacher
      </h2>

      <form id="crestTeacherForm">

        <label for="crestTeacherName"
          style="display:block;color:#172033!important;font-weight:bold">
          Teacher Full Name
        </label>

        <input id="crestTeacherName" type="text" required
          placeholder="Enter teacher full name"
          style="display:block!important;width:100%!important;padding:13px!important;margin:8px 0 18px!important;border:1px solid #aaa!important;border-radius:6px!important;box-sizing:border-box!important;color:#111!important;background:#fff!important">

        <label for="crestTeacherEmail"
          style="display:block;color:#172033!important;font-weight:bold">
          Email Address
        </label>

        <input id="crestTeacherEmail" type="email" required
          placeholder="teacher@example.com"
          style="display:block!important;width:100%!important;padding:13px!important;margin:8px 0 18px!important;border:1px solid #aaa!important;border-radius:6px!important;box-sizing:border-box!important;color:#111!important;background:#fff!important">

        <label for="crestTeacherPassword"
          style="display:block;color:#172033!important;font-weight:bold">
          Temporary Password
        </label>

        <input id="crestTeacherPassword" type="password"
          minlength="8" required
          placeholder="Minimum 8 characters"
          style="display:block!important;width:100%!important;padding:13px!important;margin:8px 0 18px!important;border:1px solid #aaa!important;border-radius:6px!important;box-sizing:border-box!important;color:#111!important;background:#fff!important">

        <button id="crestTeacherSubmit" type="submit"
          style="display:block!important;width:100%!important;padding:16px!important;background:#123b70!important;color:#fff!important;border:0!important;border-radius:8px!important;font-size:16px!important;font-weight:bold!important;cursor:pointer!important;opacity:1!important;visibility:visible!important">
          REGISTER TEACHER
        </button>

      </form>

      <p id="crestTeacherMessage"
        style="display:block!important;margin-top:15px!important;font-weight:bold!important;color:#172033!important">
      </p>
    `;

    dashboard.prepend(panel);

    $("crestTeacherForm").addEventListener("submit", async event => {
      event.preventDefault();

      const button = $("crestTeacherSubmit");
      const output = $("crestTeacherMessage");

      button.disabled = true;
      button.textContent = "REGISTERING...";

      try {
        const result = await callTeacherFunction("create", {
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
    const result = await callTeacherFunction("list");
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
      id.textContent = (teacher.id || "").slice(0, 8) + "...";

      row.append(name, role, id);
      body.appendChild(row);
    });
  }

  async function loadDashboard() {
    showMessage($("dashboardMessage"), "Loading dashboard...");

    const results = await Promise.allSettled([
      client.from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student"),

      client.from("examinations")
        .select("id, title, subject, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10)
    ]);

    const [students, exams] = results;

    if ($("studentCount")) {
      $("studentCount").textContent =
        students.status === "fulfilled" && !students.value.error
          ? students.value.count ?? 0 : "—";
    }

    if ($("examCount")) {
      $("examCount").textContent =
        exams.status === "fulfilled" && !exams.value.error
          ? exams.value.data.length : "—";
    }

    if (exams.status === "fulfilled" && !exams.value.error) {
      const body = $("examsBody");
      if (body) {
        body.innerHTML = "";

        const rows = exams.value.data || [];

        body.innerHTML = rows.length
          ? rows.map(exam =>
              `<tr>
                <td>${E.escape(exam.title)}</td>
                <td>${E.escape(exam.subject)}</td>
                <td>${E.escape(exam.status)}</td>
              </tr>`
            ).join("")
          : '<tr><td colspan="3">No examinations found.</td></tr>';
      }
    } else if ($("examsBody")) {
      $("examsBody").innerHTML =
        '<tr><td colspan="3">Examination records need database permissions.</td></tr>';
    }

    try {
      await loadTeachers();
      showMessage($("dashboardMessage"), "Super Admin dashboard loaded.", "success");
    } catch (error) {
      showMessage($("dashboardMessage"), error.message, "error");
    }
  }

  $("loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("loginButton");
    button.disabled = true;

    try {
      const { error } = await client.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("password").value
      });

      if (error) throw error;

      await verifySuperAdmin();
      showDashboard();
      createTeacherPanel();
      await loadDashboard();

    } catch (error) {
      await client.auth.signOut();
      showLogin(error.message);
    } finally {
      button.disabled = false;
    }
  });

  $("refreshButton")?.addEventListener("click", async () => {
    try {
      await verifySuperAdmin();
      await loadDashboard();
    } catch (error) {
      showMessage($("dashboardMessage"), error.message, "error");
    }
  });

  $("logoutButton")?.addEventListener("click", async () => {
    await client.auth.signOut();
    showLogin("You have signed out.");
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) showLogin();
  });

  (async () => {
    try {
      const { data } = await client.auth.getSession();

      if (data.session) {
        await verifySuperAdmin();
        showDashboard();
        createTeacherPanel();
        await loadDashboard();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin(error.message);
    }
  })();

})();
