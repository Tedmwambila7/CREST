
/* CREST Academy — MASTER 3: Teacher Marking Dashboard
   Compatible with MASTER 1 and MASTER 2. */
(() => {
  "use strict";

  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);

  const message = $("message");
  const examSelect = $("examSelect");
  const submissionList = $("submissionList");
  const answerPanel = $("answerPanel");

  if (!E || !examSelect || !submissionList || !answerPanel) {
    console.error("CREST marking page is missing required elements.");
    return;
  }

  let submissions = [];
  let activeAttemptId = null;
  let busy = false;

  const esc = value => E.escape(value ?? "");
  const number = value =>
    Number.isFinite(Number(value)) ? Number(value) : 0;

  function say(text, type = "info") {
    E.message(message, text, type);
  }

  function showEmpty(text) {
    answerPanel.innerHTML =
      `<div class="empty-state">${esc(text)}</div>`;
  }

  async function init() {
    try {
      await E.requireTeacher();
      say("Loading examinations assigned to your account...");

      const exams = await E.rpc("crest_teacher_marking_exams");

      examSelect.innerHTML =
        '<option value="">Choose an examination</option>';

      (Array.isArray(exams) ? exams : []).forEach(exam => {
        const option = document.createElement("option");
        option.value = exam.id;
        option.textContent =
          `${exam.title} — ${exam.subject || "General"} (${exam.status || "draft"})`;
        examSelect.appendChild(option);
      });

      const requestedExam =
        new URLSearchParams(window.location.search).get("exam");

      if (
        requestedExam &&
        [...examSelect.options].some(option => option.value === requestedExam)
      ) {
        examSelect.value = requestedExam;
        await loadSubmissions();
      } else if (!exams || exams.length === 0) {
        say("No examinations are currently assigned to your account.");
        submissionList.textContent = "No examinations available.";
      } else {
        say("Choose an examination, then select Load submissions.");
      }
    } catch (error) {
      console.error("CREST marking initialisation:", error);
      say(error.message || String(error), "error");
      submissionList.textContent = "Could not load examinations.";
    }
  }

  async function loadSubmissions() {
    const examId = examSelect.value;

    if (!examId) {
      say("Select an examination first.", "error");
      return;
    }

    if (busy) return;

    busy = true;
    submissionList.textContent = "Loading submitted scripts...";
    showEmpty("Select a student submission to review written answers.");
    activeAttemptId = null;

    try {
      const data = await E.rpc(
        "crest_teacher_marking_list",
        { p_exam_id: examId }
      );

      submissions = Array.isArray(data) ? data : [];

      renderSubmissionList();
      say(`${submissions.length} submitted script(s) loaded.`, "success");
    } catch (error) {
      console.error("CREST submission loading:", error);
      submissions = [];
      submissionList.textContent =
        "Submissions could not be loaded.";
      say(error.message || String(error), "error");
    } finally {
      busy = false;
    }
  }

  function studentLabel(submission) {
    const name = submission.student_name || "Student";

    const reference = submission.student_number
      ? ` · ${submission.student_number}`
      : ` · Ref ${String(submission.student_id || "").slice(0, 8)}`;

    return `${name}${reference}`;
  }

  function renderSubmissionList() {
    if (!submissions.length) {
      submissionList.innerHTML =
        '<div class="empty-state">No submitted examinations found.</div>';
      return;
    }

    submissionList.innerHTML = submissions.map(submission => {
      const status = submission.marking_status || "pending";

      const submitted = submission.submitted_at
        ? E.formatDate(submission.submitted_at)
        : "Submission received";

      return `
        <button type="button"
          class="submission-choice ${
            submission.attempt_id === activeAttemptId ? "active" : ""
          }"
          data-attempt="${esc(submission.attempt_id)}">

          ${esc(studentLabel(submission))}

          <small>
            ${esc(status)}
            · ${esc(number(submission.automatic_marks))} automatic
            · ${esc(number(submission.manual_marks))} written
            · ${esc(submitted)}
          </small>
        </button>`;
    }).join("");

    submissionList.querySelectorAll("[data-attempt]").forEach(button => {
      button.addEventListener("click", () => {
        activeAttemptId = button.dataset.attempt;

        renderSubmissionList();

        const selected = submissions.find(
          item => item.attempt_id === activeAttemptId
        );

        renderAnswers(selected);
      });
    });
  }

  function renderAnswers(submission) {
    if (!submission) {
      showEmpty("Select a student submission to review written answers.");
      return;
    }

    const questions = Array.isArray(submission.questions)
      ? submission.questions
      : [];

    const heading = `
      <h3>${esc(studentLabel(submission))}</h3>

      <p class="answer-meta">
        Submitted:
        ${esc(E.formatDate(submission.submitted_at, "Date unavailable"))}
      </p>

      <p class="answer-meta">
        Automatic marks: ${esc(number(submission.automatic_marks))}
        · Written marks:
        <strong data-manual-total>
          ${esc(number(submission.manual_marks))}
        </strong>
        · Total possible: ${esc(number(submission.total_marks))}
      </p>`;

    if (!questions.length) {
      answerPanel.innerHTML = heading +
        '<div class="empty-state">This examination has no short-answer or essay questions requiring manual marking.</div>';
      return;
    }

    answerPanel.innerHTML = heading + questions.map(question => {
      const maxMarks = number(question.max_marks);

      const awarded =
        question.awarded_marks === null ||
        question.awarded_marks === undefined
          ? ""
          : esc(question.awarded_marks);

      const questionLabel = question.question_number ?? "—";

      const answer = question.answer_text
        ? esc(question.answer_text).replace(/\r?\n/g, "<br>")
        : "<em>No answer submitted. Award zero or the appropriate mark after review.</em>";

      return `
        <article class="answer-card"
          data-question="${esc(question.question_id)}">

          <h4>
            Question ${esc(questionLabel)}
            · ${esc(maxMarks)} marks
          </h4>

          <p>${esc(question.question_text)}</p>

          <p class="answer-meta">
            <strong>Student answer</strong>
          </p>

          <div class="student-answer">${answer}</div>

          <div class="mark-row">

            <label>
              Marks awarded
              <input
                type="number"
                min="0"
                max="${maxMarks}"
                step="0.01"
                value="${awarded}"
                data-marks
                aria-label="Marks awarded">
            </label>

            <label style="flex:1;min-width:180px">
              Teacher feedback
              <textarea
                data-feedback
                rows="2"
                placeholder="Optional feedback">${esc(question.teacher_feedback || "")}</textarea>
            </label>

            <button type="button" data-save>
              Save mark
            </button>

            <span class="mark-status">
              ${
                question.marked_at
                  ? `Saved ${esc(E.formatDate(question.marked_at))}`
                  : "Not yet marked"
              }
            </span>

          </div>
        </article>`;
    }).join("");

    answerPanel.querySelectorAll("[data-save]").forEach(button => {
      button.addEventListener("click", () => saveMark(button));
    });
  }

  async function saveMark(button) {
    const card = button.closest("[data-question]");
    const marksInput = card?.querySelector("[data-marks]");
    const feedbackInput = card?.querySelector("[data-feedback]");

    if (!card || !marksInput || !feedbackInput || !activeAttemptId) {
      return;
    }

    const rawMarks = marksInput.value.trim();
    const marks = Number(rawMarks);
    const maxMarks = Number(marksInput.max);

    if (
      rawMarks === "" ||
      !Number.isFinite(marks) ||
      marks < 0 ||
      marks > maxMarks
    ) {
      say(`Enter a mark between 0 and ${maxMarks}.`, "error");
      marksInput.focus();
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const result = await E.rpc(
        "crest_mark_student_question",
        {
          p_attempt_id: activeAttemptId,
          p_question_id: card.dataset.question,
          p_marks: marks,
          p_feedback: feedbackInput.value
        }
      );

      const submission = submissions.find(
        item => item.attempt_id === activeAttemptId
      );

      if (submission) {
        const question = (submission.questions || []).find(
          item => item.question_id === card.dataset.question
        );

        if (question) {
          question.awarded_marks = marks;
          question.teacher_feedback = feedbackInput.value;
          question.marked_at = new Date().toISOString();
        }

        submission.manual_marks = result.manual_marks;
        submission.marking_status = result.status;
      }

      const status = card.querySelector(".mark-status");

      if (status) {
        status.textContent = "Saved successfully";
      }

      const total = answerPanel.querySelector("[data-manual-total]");

      if (total) {
        total.textContent = String(number(result.manual_marks));
      }

      renderSubmissionList();

      say(
        `Mark saved. Written marks: ${number(result.manual_marks)}. ${
          result.pending_questions === 0
            ? "All written questions are marked."
            : `${result.pending_questions} question(s) remain.`
        }`,
        "success"
      );

    } catch (error) {
      console.error("CREST mark saving:", error);
      say(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "Save mark";
    }
  }

  $("loadBtn")?.addEventListener("click", loadSubmissions);
  $("refreshBtn")?.addEventListener("click", loadSubmissions);

  examSelect.addEventListener("change", () => {
    activeAttemptId = null;
    submissions = [];

    submissionList.textContent =
      "Choose Load submissions to continue.";

    showEmpty(
      "Select a submitted examination on the left to review written answers."
    );
  });

  init();
})();
