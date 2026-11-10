/* CREST Examination — teacher written-answer marking (MASTER 2 RPCs) */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const examSelect = $("examSelect"), loadBtn = $("loadBtn"), refreshBtn = $("refreshBtn");
  const submissionList = $("submissionList"), answerPanel = $("answerPanel"), message = $("message");
  if (!E || !examSelect || !loadBtn || !submissionList || !answerPanel) return;

  let attempts = [], activeAttemptId = null, busy = false;
  const esc = value => E.escape(value ?? "");
  const say = (text, type = "info") => E.message(message, text, type);

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
    return [];
  }

  async function loadExams() {
    examSelect.disabled = true;
    examSelect.innerHTML = '<option value="">Loading examinations...</option>';
    try {
      await E.requireTeacher();
      const rows = await E.rpc("crest_teacher_marking_exams") || [];
      examSelect.innerHTML = '<option value="">Choose an examination</option>';
      rows.forEach(row => {
        const option = document.createElement("option");
        option.value = row.id;
        option.textContent = `${row.title} — ${row.subject || "No subject"} (${row.status || "draft"})`;
        examSelect.appendChild(option);
      });
      const requested = new URLSearchParams(location.search).get("exam");
      if (requested && rows.some(row => row.id === requested)) examSelect.value = requested;
      else if (rows.length === 1) examSelect.value = rows[0].id;
      if (examSelect.value) await loadSubmissions();
      else say(rows.length ? "Select an examination to view submissions." : "No examinations are available for marking.", "info");
    } catch (error) {
      console.error("Load marking examinations:", error);
      examSelect.innerHTML = '<option value="">Could not load examinations</option>';
      say(error.message || String(error), "error");
    } finally { examSelect.disabled = false; }
  }

  function renderSubmissions() {
    if (!attempts.length) {
      submissionList.innerHTML = '<div class="empty-state">No submitted attempts were found for this examination.</div>';
      answerPanel.innerHTML = '<div class="empty-state">There are no submitted answers to mark yet.</div>';
      activeAttemptId = null;
      return;
    }
    submissionList.innerHTML = attempts.map((item, index) => `
      <button type="button" class="submission-item ${item.attempt_id === activeAttemptId ? "active" : ""}" data-attempt="${esc(item.attempt_id)}">
        <strong>${esc(item.student_name || "Student")}</strong>
        <small>${esc(item.student_number || "No student number")}</small>
        <small>Automatic: ${Number(item.automatic_marks || 0).toFixed(2)} · Manual: ${Number(item.manual_marks || 0).toFixed(2)}</small>
        <small>${esc(item.marking_status || "pending")}</small>
      </button>`).join("");
    submissionList.querySelectorAll("[data-attempt]").forEach(button => button.addEventListener("click", () => {
      activeAttemptId = button.dataset.attempt;
      renderSubmissions();
      renderAnswers(attempts.find(x => x.attempt_id === activeAttemptId));
    }));
    const selected = attempts.find(x => x.attempt_id === activeAttemptId) || attempts[0];
    activeAttemptId = selected.attempt_id;
    renderAnswers(selected);
  }

  function renderAnswers(attempt) {
    if (!attempt) return;
    const questions = asArray(attempt.questions);
    if (!questions.length) {
      answerPanel.innerHTML = `<div class="empty-state"><h3>${esc(attempt.student_name || "Student")}</h3><p>No short-answer or essay questions were returned for marking.</p></div>`;
      return;
    }
    answerPanel.innerHTML = `<div class="answer-student-heading"><h3>${esc(attempt.student_name || "Student")}</h3><p class="muted">Student number: ${esc(attempt.student_number || "—")} · Submitted: ${esc(E.formatDate(attempt.submitted_at))}</p><p>Automatic marks: <strong>${Number(attempt.automatic_marks || 0).toFixed(2)}</strong> · Manual marks: <strong>${Number(attempt.manual_marks || 0).toFixed(2)}</strong> · Total available: <strong>${Number(attempt.total_marks || 0).toFixed(2)}</strong></p></div>
      ${questions.map((q, index) => `<article class="answer-card" data-question="${esc(q.question_id)}">
        <div class="answer-card-heading"><strong>Question ${esc(q.question_number || index + 1)}</strong><span>Maximum: ${Number(q.max_marks || 0).toFixed(2)} marks</span></div>
        <p class="mark-question">${esc(q.question_text || "")}</p>
        <div class="student-answer"><strong>Student's answer</strong><p>${esc(q.answer_text || "No answer text was submitted.").replace(/\n/g, "<br>")}</p></div>
        <label>Marks awarded</label><input class="awarded-marks" type="number" min="0" max="${Number(q.max_marks || 0)}" step="0.01" value="${q.awarded_marks == null ? "" : Number(q.awarded_marks)}" placeholder="0 to ${Number(q.max_marks || 0)}">
        <label>Teacher feedback</label><textarea class="teacher-feedback" rows="3" placeholder="Feedback for the student">${esc(q.teacher_feedback || "")}</textarea>
        <div class="mark-save-row"><button type="button" class="save-mark">Save marks</button><span class="mark-save-status">${q.marked_at ? `Last marked: ${esc(E.formatDate(q.marked_at))}` : "Not marked yet"}</span></div>
      </article>`).join("")}`;

    answerPanel.querySelectorAll(".answer-card").forEach(card => {
      card.querySelector(".save-mark").addEventListener("click", async () => {
        const input = card.querySelector(".awarded-marks");
        const marks = Number(input.value);
        const max = Number(input.max);
        const feedback = card.querySelector(".teacher-feedback").value;
        const status = card.querySelector(".mark-save-status");
        const button = card.querySelector(".save-mark");
        if (input.value.trim() === "" || !Number.isFinite(marks) || marks < 0 || marks > max) {
          status.textContent = `Enter a mark between 0 and ${max}.`; return;
        }
        button.disabled = true; status.textContent = "Saving...";
        try {
          const result = await E.rpc("crest_mark_student_question", {
            p_attempt_id: activeAttemptId,
            p_question_id: card.dataset.question,
            p_marks: marks,
            p_feedback: feedback
          });
          const current = attempts.find(x => x.attempt_id === activeAttemptId);
          if (current && result) {
            current.manual_marks = result.manual_marks ?? current.manual_marks;
            current.marking_status = result.marking_status ?? result.status ?? current.marking_status;
            const q = asArray(current.questions).find(x => x.question_id === card.dataset.question);
            if (q) { q.awarded_marks = marks; q.teacher_feedback = feedback; q.marked_at = new Date().toISOString(); }
          }
          status.textContent = "Marks saved successfully.";
          say("The student's marks and feedback have been saved.", "success");
          renderSubmissions();
        } catch (error) {
          console.error("Save written-answer mark:", error);
          status.textContent = error.message || "Could not save marks.";
          say(error.message || String(error), "error");
        } finally { button.disabled = false; }
      });
    });
  }

  async function loadSubmissions() {
    const examId = examSelect.value;
    if (!examId || busy) return;
    busy = true; loadBtn.disabled = true;
    submissionList.textContent = "Loading submitted students...";
    answerPanel.innerHTML = '<div class="empty-state">Loading answers...</div>';
    say("Loading submitted attempts and written answers...", "info");
    try {
      const result = await E.rpc("crest_teacher_marking_list", { p_exam_id: examId });
      attempts = asArray(result);
      activeAttemptId = attempts[0]?.attempt_id || null;
      renderSubmissions();
      say(`${attempts.length} submitted attempt(s) loaded.`, "success");
    } catch (error) {
      console.error("Load submitted answers:", error);
      submissionList.textContent = "Submissions could not be loaded.";
      answerPanel.innerHTML = '<div class="empty-state">Unable to load written answers.</div>';
      say(error.message || String(error), "error");
    } finally { busy = false; loadBtn.disabled = false; }
  }

  loadBtn.addEventListener("click", loadSubmissions);
  refreshBtn?.addEventListener("click", loadExams);
  examSelect.addEventListener("change", loadSubmissions);
  loadExams();
})();
