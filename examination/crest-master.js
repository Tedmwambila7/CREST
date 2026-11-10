
/* =========================================================
   CREST ACADEMY — MASTER EXAMINATION DASHBOARD
   ADDITIVE MODULE
   Uses existing exam.js and existing Supabase tables.
   ========================================================= */

(async function () {
  "use strict";

  const E = window.CREST_EXAM;

  const $ = id => document.getElementById(id);

  const list = $("examList");
  const message = $("message");
  const refreshBtn = $("refreshBtn");
  const searchInput = $("searchInput");
  const statusFilter = $("statusFilter");

  if (!E || typeof E.getClient !== "function") {
    alert("CREST connection missing. Check that exam.js loads first.");
    return;
  }

  const client = E.getClient();

  if (!client) {
    alert("Supabase connection is unavailable.");
    return;
  }

  let examinations = [];
  let loading = false;

  function showMessage(text, type = "info") {
    if (typeof E.message === "function") {
      E.message(message, text, type);
    } else {
      message.textContent = text;
      message.className = "message " + type;
    }
  }

  function safe(value) {
    return typeof E.escape === "function"
      ? E.escape(String(value ?? ""))
      : String(value ?? "").replace(/[&<>"']/g, char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]);
  }

  function dateText(value) {
    if (!value) return "Not scheduled";

    if (typeof E.formatDate === "function") {
      return E.formatDate(value);
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Not available"
      : date.toLocaleString();
  }

  function updateStatistics() {
    const total = examinations.length;
    const published = examinations.filter(
      exam => String(exam.status).toLowerCase() === "published"
    ).length;
    const drafts = examinations.filter(
      exam => String(exam.status).toLowerCase() === "draft"
    ).length;

    $("totalExams").textContent = total;
    $("publishedExams").textContent = published;
    $("draftExams").textContent = drafts;
    $("otherExams").textContent = total - published - drafts;
  }

  function getFilteredExaminations() {
    const search = searchInput.value.trim().toLowerCase();
    const filter = statusFilter.value;

    return examinations.filter(exam => {
      const status = String(exam.status || "").toLowerCase();

      const matchesSearch =
        !search ||
        String(exam.title || "").toLowerCase().includes(search) ||
        String(exam.subject || "").toLowerCase().includes(search) ||
        String(exam.class_name || "").toLowerCase().includes(search);

      let matchesStatus = true;

      if (filter === "draft") {
        matchesStatus = status === "draft";
      } else if (filter === "published") {
        matchesStatus = status === "published";
      } else if (filter === "other") {
        matchesStatus =
          status !== "draft" && status !== "published";
      }

      return matchesSearch && matchesStatus;
    });
  }

  function renderExaminations() {
    const rows = getFilteredExaminations();

    if (!rows.length) {
      list.innerHTML =
        '<div class="empty">No matching examinations found.</div>';
      return;
    }

    list.innerHTML = rows.map(exam => {
      const status = String(exam.status || "unknown").toLowerCase();

      const start = exam.scheduled_at || exam.start_time;
      const end = exam.ends_at;

      return `
        <article class="exam-item">
          <h3>${safe(exam.title)}</h3>

          <div class="exam-meta">
            <span>Subject: ${safe(exam.subject || "Not specified")}</span>
            <span>Class: ${safe(exam.class_name || "Not specified")}</span>
            <span>Duration: ${safe(exam.duration_minutes ?? 60)} minutes</span>
            <span>Total marks: ${safe(exam.total_marks ?? 0)}</span>
          </div>

          <div class="exam-meta">
            <span>Starts: ${safe(dateText(start))}</span>
            <span>Ends: ${safe(dateText(end))}</span>
            <span>Created: ${safe(dateText(exam.created_at))}</span>
          </div>

          <span class="status ${safe(status)}">
            ${safe(status)}
          </span>

          <div class="exam-actions">
            <a href="questions.html?exam=${encodeURIComponent(exam.id)}">
              Manage questions
            </a>

            <a href="results.html?exam=${encodeURIComponent(exam.id)}">
              View results
            </a>

            <a href="create-exam.html?exam=${encodeURIComponent(exam.id)}">
              Examination details
            </a>
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadExaminations() {
    if (loading) return;

    loading = true;
    refreshBtn.disabled = true;
    list.innerHTML = '<div class="loading">Loading examinations...</div>';
    showMessage("Connecting to CREST Examination database...", "info");

    try {
      await E.requireTeacher();

      const { data, error } = await client
        .from("examinations")
        .select(`
          id,
          title,
          subject,
          subject_id,
          teacher_id,
          duration_minutes,
          total_marks,
          status,
          start_time,
          scheduled_at,
          ends_at,
          class_name,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      examinations = data || [];

      updateStatistics();
      renderExaminations();

      showMessage(
        examinations.length
          ? "Examinations loaded successfully."
          : "No examinations are currently available.",
        "success"
      );

    } catch (error) {
      console.error("CREST Master Dashboard:", error);

      examinations = [];
      updateStatistics();

      list.innerHTML =
        '<div class="empty">Unable to load examinations. Check your access and database connection.</div>';

      showMessage(
        error.message || String(error),
        "error"
      );

    } finally {
      loading = false;
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", loadExaminations);
  searchInput.addEventListener("input", renderExaminations);
  statusFilter.addEventListener("change", renderExaminations);

  await loadExaminations();

})();
