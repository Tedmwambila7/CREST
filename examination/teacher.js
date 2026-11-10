/* CREST Examination — teacher dashboard */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const list = $("examList");
  const message = $("message");
  const refresh = $("refreshBtn");

  if (!E || !list || !refresh) {
    console.error("Teacher dashboard could not find its required page elements.");
    return;
  }

  let busy = false;

  function render(rows) {
    if (!rows.length) {
      list.innerHTML = `
        <div class="empty-state">
          <h3>No examinations yet</h3>
          <p>Create your first examination to begin adding questions.</p>
          <a class="button" href="create-exam.html">Create examination</a>
        </div>`;
      return;
    }

    list.innerHTML = rows.map(exam => `
      <article class="exam-item">
        <div class="exam-item-heading">
          <div>
            <h3>${E.escape(exam.title)}</h3>
            <p class="muted">${E.escape(exam.subject || "Subject not specified")}</p>
          </div>
          <span class="status-badge status-${E.escape(String(exam.status || "draft").toLowerCase())}">
            ${E.escape(exam.status || "draft")}
          </span>
        </div>
        <div class="exam-meta-grid">
          <span><b>Duration</b>${E.escape(exam.duration_minutes ?? 60)} minutes</span>
          <span><b>Total marks</b>${E.escape(exam.total_marks ?? 0)}</span>
          <span><b>Starts</b>${E.escape(E.formatDate(exam.scheduled_at || exam.start_time))}</span>
          <span><b>Ends</b>${E.escape(E.formatDate(exam.ends_at))}</span>
        </div>
        <div class="exam-actions">
          <a class="button" href="questions.html?exam=${encodeURIComponent(exam.id)}">Manage questions</a>
          <a class="button secondary" href="results.html?exam=${encodeURIComponent(exam.id)}">View results</a>
        </div>
      </article>
    `).join("");
  }

  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    list.textContent = "Loading examinations...";
    E.message(message, "Checking your account and loading examinations...", "info");

    try {
      await E.requireTeacher();
      const { data, error } = await E.getClient()
        .from("examinations")
        .select("id,title,subject,status,duration_minutes,total_marks,start_time,scheduled_at,ends_at,created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      render(data || []);
      E.message(message, `${(data || []).length} examination(s) loaded.`, "success");
    } catch (error) {
      console.error("CREST teacher dashboard:", error);
      list.innerHTML = '<div class="empty-state">Examinations could not be loaded. Please check your sign-in and database permissions.</div>';
      E.message(message, error.message || String(error), "error");
    } finally {
      busy = false;
      refresh.disabled = false;
    }
  }

  refresh.addEventListener("click", load);
  load();
})();
