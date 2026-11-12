(async function () {
  const E = window.CREST_EXAM, msg = document.getElementById("message"), out = document.getElementById("results");
  try {
    await E.requireTeacher();
    const examId = new URLSearchParams(location.search).get("exam");
    let query = E.getClient().from("exam_results")
      .select("id,student_id,examination_id,total_marks,marks_obtained,percentage,grade,released_at,created_at")
      .order("created_at", { ascending: false });
    if (examId) query = query.eq("examination_id", examId);
    const { data, error } = await query; if (error) throw error;
    if (!data || !data.length) { out.textContent = "No submitted results are available yet."; return; }
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Student ID</th><th>Marks</th><th>Total</th><th>Percentage</th><th>Grade</th><th>Status</th><th>Date</th></tr></thead><tbody></tbody>";
    const body = table.querySelector("tbody");
    data.forEach(r => {
      const tr = document.createElement("tr");
      [r.student_id, r.marks_obtained, r.total_marks, Number(r.percentage).toFixed(1) + "%", r.grade || "—", r.released_at ? "Released" : "Hidden", E.formatDate(r.created_at)].forEach(v => {
        const td = document.createElement("td"); td.textContent = String(v ?? ""); tr.append(td);
      }); body.append(tr);
    });
    out.replaceChildren(table);
    if (examId) {
      const release = document.createElement("button"); release.type = "button"; release.textContent = "Release results to students";
      release.addEventListener("click", async () => {
        if (!confirm("Release all submitted results for this examination to students?")) return;
        release.disabled = true;
        try {
          const count = await E.rpc("crest_teacher_release_exam_results", { p_exam_id: examId });
          E.message(msg, `Results released. ${count} result(s) are now visible to students.`, "success");
          release.textContent = "Results released";
          body.querySelectorAll("tr").forEach(row => { row.cells[5].textContent = "Released"; });
        } catch (e) { E.message(msg, e.message || String(e), "error"); release.disabled = false; }
      });
      out.prepend(release);
    } else {
      E.message(msg, "Open results for a specific examination to enable the release button.", "info");
    }
  } catch (e) { E.message(msg, e.message || String(e), "error"); out.textContent = "Could not load results."; }
})();
