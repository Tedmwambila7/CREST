/* CREST Examination — unified teacher dashboard */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const list = $("examList"), message = $("message"), refresh = $("refreshBtn"), stats = $("dashboardStats");
  if (!E || !list || !refresh) return;
  let busy = false;

  function render(rows) {
    const published = rows.filter(x => String(x.status || "").toLowerCase() === "published").length;
    const drafts = rows.filter(x => String(x.status || "").toLowerCase() === "draft").length;
    if (stats) stats.innerHTML = `<div><strong>${rows.length}</strong><span>Total examinations</span></div><div><strong>${published}</strong><span>Published</span></div><div><strong>${drafts}</strong><span>Drafts</span></div>`;
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><h3>No examinations yet</h3><p>Create your first examination to begin adding questions.</p><a class="button" href="create-exam.html">Create examination</a></div>`;
      return;
    }
    list.innerHTML = rows.map(exam => {
      const id = encodeURIComponent(exam.id);
      const status = String(exam.status || "draft").toLowerCase().replace(/[^a-z0-9_-]/g, "");
      return `<article class="exam-item">
        <div class="exam-item-heading"><div><h3>${E.escape(exam.title)}</h3><p class="muted">${E.escape(exam.subject || "Subject not specified")}</p></div><span class="status-badge status-${status}">${E.escape(exam.status || "draft")}</span></div>
        <div class="exam-meta-grid"><span><b>Duration</b>${E.escape(exam.duration_minutes ?? 60)} minutes</span><span><b>Total marks</b>${E.escape(exam.total_marks ?? 0)}</span><span><b>Starts</b>${E.escape(E.formatDate(exam.scheduled_at || exam.start_time))}</span><span><b>Ends</b>${E.escape(E.formatDate(exam.ends_at))}</span></div>
        <div class="exam-actions"><a class="button" href="questions.html?exam=${id}">Manage questions</a><a class="button secondary" href="marking.html?exam=${id}">Mark submissions</a><a class="button secondary" href="results.html?exam=${id}">View results</a><a class="button secondary" href="paper.html?exam=${id}">Generate PDF</a></div>
      </article>`;
    }).join("");
  }

  async function load() {
    if (busy) return;
    busy = true; refresh.disabled = true; list.textContent = "Loading examinations...";
    E.message(message, "Checking your teacher account and loading examinations...", "info");
    try {
      await E.requireTeacher();
      const data = await E.rpc("crest_teacher_dashboard_exams") || [];
      render(data);
      E.message(message, `${data.length} examination(s) loaded.`, "success");
    } catch (error) {
      console.error("CREST teacher dashboard:", error);
      list.innerHTML = `<div class="empty-state">Examinations could not be loaded. ${E.escape(error.message || "Check your sign-in and database permissions.")}</div>`;
      E.message(message, error.message || String(error), "error");
    } finally { busy = false; refresh.disabled = false; }
  }
  refresh.addEventListener("click", load);
  load();
})();
