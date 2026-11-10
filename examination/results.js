/* CREST Examination — results register (current examination_results model) */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const message = document.getElementById("message");
  const output = document.getElementById("results");
  const refresh = document.getElementById("refreshResults");
  if (!E || !output) return;

  let busy = false;

  function render(rows) {
    if (!rows.length) {
      output.innerHTML = '<div class="empty-state">No examination results are available yet.</div>';
      return;
    }

    output.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Student reference</th>
            <th>Automatic marks</th>
            <th>Manual marks</th>
            <th>Examination total</th>
            <th>Percentage</th>
            <th>Review status</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const automatic = Number(row.automatic_marks || 0);
            const manual = Number(row.manual_marks || 0);
            const available = Number(row.examinations?.total_marks || 0);
            const obtained = automatic + manual;
            const percentage = available > 0 ? (obtained / available) * 100 : 0;
            return `
              <tr>
                <td>${E.escape(String(row.student_id || "").slice(0, 8))}</td>
                <td>${automatic.toFixed(2)}</td>
                <td>${manual.toFixed(2)}</td>
                <td>${available.toFixed(2)}</td>
                <td>${percentage.toFixed(1)}%</td>
                <td>${E.escape(row.status || "pending review")}</td>
                <td>${E.escape(E.formatDate(row.created_at))}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  }

  async function load() {
    if (busy) return;
    busy = true;
    if (refresh) refresh.disabled = true;
    output.textContent = "Loading results...";
    E.message(message, "Loading examination results...", "info");

    try {
      await E.requireTeacher();
      const examId = new URLSearchParams(window.location.search).get("exam");

      let query = E.getClient()
        .from("examination_results")
        .select("id,attempt_id,examination_id,student_id,automatic_marks,manual_marks,total_marks,status,marked_at,created_at,examinations(title,total_marks)")
        .order("created_at", { ascending: false });

      if (examId) query = query.eq("examination_id", examId);

      const { data, error } = await query;
      if (error) throw error;
      render(data || []);
      E.message(message, `${(data || []).length} result record(s) loaded.`, "success");
    } catch (error) {
      output.textContent = "Results could not be loaded.";
      E.message(message, error.message || String(error), "error");
    } finally {
      busy = false;
      if (refresh) refresh.disabled = false;
    }
  }

  refresh?.addEventListener("click", load);
  load();
})();
