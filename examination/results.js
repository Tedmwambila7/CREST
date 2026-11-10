/* CREST Examination — results register for the confirmed exam_results schema */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const message = document.getElementById("message");
  const output = document.getElementById("results");
  const refresh = document.getElementById("refreshResults");
  if (!E || !output) return;
  let busy = false;

  function render(rows) {
    if (!rows.length) { output.innerHTML = '<div class="empty-state">No examination results are available yet.</div>'; return; }
    output.innerHTML = `<table><thead><tr><th>Student reference</th><th>Marks obtained</th><th>Total marks</th><th>Percentage</th><th>Grade</th><th>Marking status</th><th>Publication</th><th>Recorded</th></tr></thead><tbody>${rows.map(row => {
      const obtained = Number(row.marks_obtained ?? 0);
      const total = Number(row.total_marks ?? 0);
      const pct = row.percentage == null ? (total > 0 ? obtained / total * 100 : 0) : Number(row.percentage);
      return `<tr><td>${E.escape(String(row.student_id || "").slice(0, 12) || "—")}</td><td>${obtained.toFixed(2)}</td><td>${total.toFixed(2)}</td><td>${pct.toFixed(1)}%</td><td>${E.escape(row.grade || "—")}</td><td>${E.escape(row.marking_status || "pending")}</td><td>${row.published ? "Published" : "Not published"}</td><td>${E.escape(E.formatDate(row.created_at))}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  async function load() {
    if (busy) return;
    busy = true; if (refresh) refresh.disabled = true;
    output.textContent = "Loading results...";
    E.message(message, "Checking teacher access and loading results...", "info");
    try {
      await E.requireTeacher();
      const examId = new URLSearchParams(window.location.search).get("exam");
      const data = await E.rpc("crest_teacher_results_list", { p_exam_id: examId || null }) || [];
      render(data);
      E.message(message, `${data.length} result record(s) loaded.`, "success");
    } catch (error) {
      console.error("CREST results:", error);
      output.innerHTML = '<div class="empty-state">Results could not be loaded. Check teacher access and table permissions.</div>';
      E.message(message, error.message || String(error), "error");
    } finally { busy = false; if (refresh) refresh.disabled = false; }
  }
  refresh?.addEventListener("click", load);
  load();
})();
