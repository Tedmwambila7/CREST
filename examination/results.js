(async function () {
  "use strict";
  const E = window.CREST_EXAM;
  const msg = document.getElementById("message");
  const out = document.getElementById("results");
  try {
    await E.requireTeacher();
    const examId = new URLSearchParams(location.search).get("exam");
    // The current exam_results schema does not define a grade column.
    let query = E.getClient().from("exam_results")
      .select("id,student_id,examination_id,total_marks,marks_obtained,percentage,released_at,created_at")
      .order("created_at", { ascending: false });
    if (examId) query = query.eq("examination_id", examId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      out.textContent = "No submitted results are available yet.";
      return;
    }
    out.innerHTML = `<div style="overflow-x:auto"><table><thead><tr>
      <th>Student reference</th><th>Marks obtained</th><th>Total marks</th><th>Percentage</th><th>Date submitted</th>
      </tr></thead><tbody>${data.map(r => `<tr>
        <td>${E.escape(String(r.student_id).slice(0, 8))}</td>
        <td>${Number(r.marks_obtained)}</td><td>${Number(r.total_marks)}</td>
        <td>${Number(r.percentage).toFixed(1)}%</td>
        <td>${E.escape(E.formatDate(r.created_at))}</td>
      </tr>`).join("")}</tbody></table></div>`;
  } catch (error) {
    E.message(msg, error.message || String(error), "error");
    out.textContent = "Could not load results.";
  }
})();
