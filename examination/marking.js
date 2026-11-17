/* CREST Examination — unified online exam marking (attempts_v2 / answers_v3) */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const examSelect = $("examSelect"), loadBtn = $("loadBtn"), refreshBtn = $("refreshBtn");
  const submissionList = $("submissionList"), answerPanel = $("answerPanel"), message = $("message");
  const pageError = $("pageError");

  if (!E || !examSelect || !loadBtn || !submissionList || !answerPanel) {
    if (pageError) pageError.textContent = "The marking scripts could not start. Please refresh this page.";
    return;
  }

  let attempts = [];
  let activeAttemptId = null;
  let busy = false;
  const client = E.getClient();
  const esc = value => E.escape(value ?? "");
  const say = (text, type = "info") => E.message(message, text, type);
  const asArray = value => Array.isArray(value) ? value : [];

  async function ensureStaff() {
    await E.requireTeacher();
  }

  async function rpc(name, params = {}) {
    const { data, error } = await client.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async function loadExams() {
    examSelect.disabled = true;
    examSelect.innerHTML = '<option value="">Loading examinations...</option>';
    if (pageError) pageError.textContent = "Connecting to CREST examination records...";
    try {
      await ensureStaff();
      const rows = asArray(await rpc("crest_online_teacher_exams"));
      examSelect.innerHTML = '<option value="">Choose an examination</option>';
      rows.forEach(row => {
        const option = document.createElement("option");
        option.value = row.id;
        option.textContent = `${row.title} — ${row.subject || "No subject"} (${row.status || "draft"})`;
        examSelect.appendChild(option);
      });

      const requested = new URLSearchParams(location.search).get("exam");
      if (requested && rows.some(row => row.id === requested)) {
        examSelect.value = requested;
      } else {
        // Choose the first exam with actual submissions, not an empty draft.
        for (const row of rows) {
          try {
            const check = asArray(await rpc("crest_online_teacher_submissions", { p_exam_id: row.id }));
            if (check.length) { examSelect.value = row.id; break; }
          } catch (error) {
            console.warn("Could not check submissions for", row.title, error);
          }
        }
        if (!examSelect.value && rows.length) {
          examSelect.value = (rows.find(row => row.status !== "draft") || rows[0]).id;
        }
      }

      if (examSelect.value) await loadSubmissions();
      else {
        say(rows.length ? "Select an examination to view submitted papers." : "No examinations are assigned to this account.", "info");
        if (pageError) pageError.textContent = "No examinations are available for marking.";
      }
    } catch (error) {
      console.error("Load marking examinations:", error);
      examSelect.innerHTML = '<option value="">Could not load examinations</option>';
      say(error.message || String(error), "error");
      if (pageError) pageError.textContent = "Could not load marking workspace: " + (error.message || String(error));
    } finally {
      examSelect.disabled = false;
    }
  }

  function optionDescription(q) {
    const answer = String(q.answer_text ?? "").trim();
    const options = asArray(q.options);
    if (!answer) {
      if (q.selected_option_id) {
        const selected = options.find(o => String(o.id) === String(q.selected_option_id));
        return selected ? `${selected.label || ""} — ${selected.text || ""}` : "Selected option recorded";
      }
      return "No answer submitted.";
    }
    const selected = options.find(o =>
      String(o.id ?? "") === answer ||
      String(o.label ?? "").toUpperCase() === answer.toUpperCase()
    );
    return selected ? `${selected.label || answer} — ${selected.text || ""}` : answer;
  }

  function renderSubmissions() {
    if (!attempts.length) {
      submissionList.innerHTML = '<div class="empty-state">No submitted attempts were found for this examination.</div>';
      answerPanel.innerHTML = '<div class="empty-state">There are no submitted answers to mark yet.</div>';
      if (pageError) pageError.textContent = "The examination is loaded, but no student has submitted it yet.";
      activeAttemptId = null;
      return;
    }

    submissionList.innerHTML = attempts.map(item => `
      <button type="button" class="submission-item ${item.attempt_id === activeAttemptId ? "active" : ""}" data-attempt="${esc(item.attempt_id)}">
        <strong>${esc(item.student_name || "Student")}</strong>
        <small>${esc(item.student_number || "No student number")}</small>
        <small>Submitted: ${esc(E.formatDate(item.submitted_at))}</small>
        <small>Manual marks: ${Number(item.manual_marks || 0).toFixed(2)} · ${esc(item.marking_status || "pending")}</small>
      </button>`).join("");

    submissionList.querySelectorAll("[data-attempt]").forEach(button => {
      button.addEventListener("click", () => {
        activeAttemptId = button.dataset.attempt;
        renderSubmissions();
      });
    });

    const selected = attempts.find(item => item.attempt_id === activeAttemptId) || attempts[0];
    activeAttemptId = selected.attempt_id;
    renderAnswers(selected);
  }

  async function loadMedia(host) {
    try {
      const media = asArray(await rpc("crest_online_teacher_media", {
        p_attempt_id: host.dataset.mediaAttempt,
        p_question_id: host.dataset.mediaQuestion
      }));
      if (!media.length) {
        host.innerHTML = "<strong>Submitted attachments</strong><p class='muted'>No photo or voice attachment for this question.</p>";
        return;
      }

      const pieces = [];
      for (const item of media) {
        const { data, error } = await client.storage
          .from("crest-exam-answers")
          .createSignedUrl(item.storage_path, 3600);
        if (error) throw error;
        const url = esc(data.signedUrl);
        if (item.media_type === "audio") {
          pieces.push(`<div class="media-preview"><audio controls preload="none" src="${url}"></audio><p><a href="${url}" target="_blank" rel="noopener">Open voice recording</a></p></div>`);
        } else {
          pieces.push(`<div class="media-preview"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Student handwritten answer" loading="lazy" style="display:block;max-width:100%;max-height:520px;border-radius:8px;margin-top:8px"></a><p><a href="${url}" target="_blank" rel="noopener">Open full-size photo</a></p></div>`);
        }
      }
      host.innerHTML = "<strong>Submitted attachments</strong>" + pieces.join("");
    } catch (error) {
      host.innerHTML = "<strong>Attachments</strong><p class='muted'>Could not load attachments: " + esc(error.message || String(error)) + "</p>";
    }
  }

  function renderAnswers(attempt) {
    if (!attempt) return;
    const questions = asArray(attempt.questions);
    if (!questions.length) {
      answerPanel.innerHTML = `<div class="empty-state"><h3>${esc(attempt.student_name || "Student")}</h3><p>No questions were linked to this submitted examination. Please check the examination's question list.</p></div>`;
      return;
    }

    answerPanel.innerHTML = `
      <div class="answer-student-heading">
        <h3>${esc(attempt.student_name || "Student")}</h3>
        <p class="muted">Student number: ${esc(attempt.student_number || "—")} · Submitted: ${esc(E.formatDate(attempt.submitted_at))}</p>
        <p>Automatic marks: <strong>${Number(attempt.automatic_marks || 0).toFixed(2)}</strong> · Manual marks: <strong>${Number(attempt.manual_marks || 0).toFixed(2)}</strong> · Total available: <strong>${Number(attempt.total_marks || 0).toFixed(2)}</strong></p>
      </div>
      ${questions.map((q, index) => {
        const max = Number(q.max_marks || 0);
        const answer = optionDescription(q);
        const options = asArray(q.options);
        const optionHtml = options.length ? `<ul class="muted">${options.map(o => `<li>${esc(o.label || "")}. ${esc(o.text || "")}</li>`).join("")}</ul>` : "";
        return `<article class="answer-card" data-question="${esc(q.question_id)}">
          <div class="answer-card-heading"><strong>Question ${esc(q.question_number || index + 1)}</strong><span>Maximum: ${max.toFixed(2)} marks</span></div>
          <p class="mark-question">${esc(q.question_text || "")}</p>
          ${optionHtml}
          <div class="student-answer"><strong>Student's submitted answer</strong><p>${esc(answer).replace(/\n/g, "<br>")}</p></div>
          <div class="submitted-media" data-media-question="${esc(q.question_id)}" data-media-attempt="${esc(attempt.attempt_id)}"><strong>Submitted attachments</strong><p class="muted">Checking photos and voice recordings...</p></div>
          <label>Marks awarded (0–${max})</label>
          <input class="awarded-marks" type="number" min="0" max="${max}" step="0.01" value="${q.awarded_marks == null ? "" : Number(q.awarded_marks)}" placeholder="Enter mark">
          <label>Teacher feedback</label>
          <textarea class="teacher-feedback" rows="3" placeholder="Feedback for the student">${esc(q.teacher_feedback || "")}</textarea>
          <div class="mark-save-row"><button type="button" class="save-mark">Save marks</button><span class="mark-save-status">${q.marked_at ? `Last marked: ${esc(E.formatDate(q.marked_at))}` : "Not marked yet"}</span></div>
        </article>`;
      }).join("")}`;

    answerPanel.querySelectorAll("[data-media-question]").forEach(host => loadMedia(host));

    answerPanel.querySelectorAll(".answer-card").forEach(card => {
      card.querySelector(".save-mark").addEventListener("click", async () => {
        const input = card.querySelector(".awarded-marks");
        const status = card.querySelector(".mark-save-status");
        const button = card.querySelector(".save-mark");
        const marks = Number(input.value);
        const max = Number(input.max);
        if (input.value.trim() === "" || !Number.isFinite(marks) || marks < 0 || marks > max) {
          status.textContent = `Enter a mark between 0 and ${max}.`;
          return;
        }
        button.disabled = true;
        status.textContent = "Saving marks...";
        try {
          const result = await rpc("crest_online_teacher_mark_answer", {
            p_attempt_id: activeAttemptId,
            p_question_id: card.dataset.question,
            p_marks: marks,
            p_feedback: card.querySelector(".teacher-feedback").value
          });
          const current = attempts.find(item => item.attempt_id === activeAttemptId);
          if (current) {
            current.manual_marks = result.manual_marks ?? current.manual_marks;
            current.marking_status = result.marking_status ?? current.marking_status;
            const q = asArray(current.questions).find(item => item.question_id === card.dataset.question);
            if (q) {
              q.awarded_marks = marks;
              q.teacher_feedback = card.querySelector(".teacher-feedback").value;
              q.marked_at = new Date().toISOString();
            }
          }
          status.textContent = "Marks saved successfully.";
          say("Marks and feedback have been saved to the submitted examination.", "success");
          renderSubmissions();
        } catch (error) {
          console.error("Save examination marks:", error);
          status.textContent = error.message || "Could not save marks.";
          say(error.message || String(error), "error");
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function loadSubmissions() {
    const examId = examSelect.value;
    if (!examId || busy) return;
    busy = true;
    loadBtn.disabled = true;
    submissionList.textContent = "Loading submitted students...";
    answerPanel.innerHTML = '<div class="empty-state">Loading submitted answers...</div>';
    say("Loading the actual student attempts and answer records...", "info");
    try {
      await ensureStaff();
      attempts = asArray(await rpc("crest_online_teacher_submissions", { p_exam_id: examId }));
      activeAttemptId = attempts[0]?.attempt_id || null;
      renderSubmissions();
      say(`${attempts.length} submitted examination(s) loaded.`, "success");
      if (pageError) pageError.textContent = attempts.length
        ? "Submitted papers loaded. Select a student to review and mark answers."
        : "No submitted attempts were found for this examination.";
    } catch (error) {
      console.error("Load submitted examinations:", error);
      submissionList.textContent = "Submissions could not be loaded.";
      answerPanel.innerHTML = '<div class="empty-state">Unable to load submitted answers. See the error message above.</div>';
      say(error.message || String(error), "error");
    } finally {
      busy = false;
      loadBtn.disabled = false;
    }
  }

  loadBtn.addEventListener("click", loadSubmissions);
  refreshBtn?.addEventListener("click", loadExams);
  examSelect.addEventListener("change", loadSubmissions);
  loadExams();
})();
