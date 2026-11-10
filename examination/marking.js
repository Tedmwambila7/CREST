
/* =========================================================
   CREST ACADEMY — MASTER 3
   TEACHER MARKING DASHBOARD
   Works with MASTER 1 and MASTER 2 SQL functions.
   ========================================================= */

(() => {
  "use strict";

  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);

  const message = $("message");
  const examSelect = $("examSelect");
  const submissionList = $("submissionList");
  const answerPanel = $("answerPanel");

  if (!E || !examSelect || !submissionList || !answerPanel) {
    console.error("CREST marking dashboard elements are missing.");
    return;
  }

  let submissions = [];
  let activeAttemptId = null;
  let loading = false;

  const esc = value => E.escape(value ?? "");

  const num = value => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  };

  function notify(text, type = "info") {
    E.message(message, text, type);
  }

  function formatDate(value) {
    return value ? E.formatDate(value) : "Not available";
  }

  // ---------------------------------------------------------
  // 1. LOAD TEACHER EXAMINATIONS
  // ---------------------------------------------------------

  async function initialise() {
    try {
      await E.requireTeacher();

      notify("Loading your examinations...");

      const exams = await E.rpc(
        "crest_teacher_marking_exams"
      );

      examSelect.innerHTML =
        '<option value="">Choose an examination</option>';

      (exams || []).forEach(exam => {
        const option = document.createElement("option");

        option.value = exam.id;
        option.textContent =
          `${exam.title} — ${exam.subject || "General"} (${exam.status || "unknown"})`;

        examSelect.appendChild(option);
      });

      const requestedExam =
        new URLSearchParams(window.location.search).get("exam");

      if (
        requestedExam &&
        [...examSelect.options].some(
          option => option.value === requestedExam
        )
      ) {
        examSelect.value = requestedExam;
        await loadSubmissions();
      } else {
        notify(
          exams?.length
            ? "Choose an examination and load its submissions."
            : "No examinations are currently available."
        );
      }

    } catch (error) {
      console.error(error);
      notify(error.message || String(error), "error");
      submissionList.textContent =
        "Unable to load examinations.";
    }
  }

  // ---------------------------------------------------------
  // 2. LOAD STUDENT SUBMISSIONS
  // ---------------------------------------------------------

  async function loadSubmissions() {
    const examId = examSelect.value;

    if (!examId) {
      notify("Please select an examination.", "error");
      return;
    }

    if (loading) return;

    loading = true;

    submissionList.textContent =
      "Loading student submissions...";

    answerPanel.innerHTML =
      '<div class="empty-state">Select a student submission to review answers.</div>';

    submissions = [];
    activeAttemptId = null;

    try {
      const data = await E.rpc(
        "crest_teacher_marking_list",
        { p_exam_id: examId }
      );

      submissions = Array.isArray(data) ? data : [];

      renderSubmissions();

      notify(
        `${submissions.length} submitted examination(s) loaded.`,
        "success"
      );

    } catch (error) {
      console.error(error);

      submissionList.textContent =
        "Unable to load submissions.";

      notify(error.message || String(error), "error");

    } finally {
      loading = false;
    }
  }

  // ---------------------------------------------------------
  // 3. DISPLAY STUDENT SUBMISSIONS
  // ---------------------------------------------------------

  function renderSubmissions() {
    if (!submissions.length) {
      submissionList.innerHTML =
        '<div class="empty-state">No submitted examinations found.</div>';
      return;
    }

    submissionList.innerHTML = submissions.map(student => {
      const active =
        student.attempt_id === activeAttemptId;

      const name =
        student.student_name || "Student";

      const reference =
        student.student_number || student.student_id || "";

      return `
        <button
          type="button"
          class="submission-choice ${active ? "active" : ""}"
          data-attempt="${esc(student.attempt_id)}">

          <strong>${esc(name)}</strong>

          <small>
            ${esc(reference)}
            · ${esc(student.marking_status || "pending")}
            <br>
            Automatic: ${esc(num(student.automatic_marks))}
            · Written: ${esc(num(student.manual_marks))}
            <br>
            Submitted: ${esc(formatDate(student.submitted_at))}
          </small>

        </button>
      `;
    }).join("");

    submissionList
      .querySelectorAll("[data-attempt]")
      .forEach(button => {
        button.addEventListener("click", () => {
          activeAttemptId = button.dataset.attempt;

          const selected = submissions.find(
            student =>
              student.attempt_id === activeAttemptId
          );

          renderSubmissions();
          renderAnswers(selected);
        });
      });
  }

  // ---------------------------------------------------------
  // 4. DISPLAY STUDENT ANSWERS
  // ---------------------------------------------------------

  function renderAnswers(student) {
    if (!student) return;

    const questions = Array.isArray(student.questions)
      ? student.questions
      : [];

    const heading = `
      <h3>${esc(student.student_name || "Student")}</h3>

      <p class="answer-meta">
        Student number:
        ${esc(student.student_number || student.student_id || "Not available")}
      </p>

      <p class="answer-meta">
        Automatic marks:
        <strong>${esc(num(student.automatic_marks))}</strong>

        · Written marks:
        <strong data-manual-total>${esc(num(student.manual_marks))}</strong>

        · Total possible:
        <strong>${esc(num(student.total_marks))}</strong>
      </p>

      <p class="answer-meta">
        Submission status:
        ${esc(student.attempt_status || "Submitted")}
      </p>
    `;

    if (!questions.length) {
      answerPanel.innerHTML =
        heading +
        '<div class="empty-state">No written questions require manual marking.</div>';
      return;
    }

    answerPanel.innerHTML =
      heading +
      questions.map(question => {
        const maxMarks = num(question.max_marks);

        const awarded =
          question.awarded_marks ??
          question.teacher_marks ??
          "";

        const answer = question.answer_text
          ? esc(question.answer_text).replace(/\r?\n/g, "<br>")
          : "<em>No answer submitted.</em>";

        return `
          <article
            class="answer-card"
            data-question="${esc(question.question_id)}">

            <h4>
              Question ${esc(question.question_number ?? "—")}
              · ${esc(maxMarks)} marks
            </h4>

            <p>${esc(question.question_text)}</p>

            <p class="answer-meta">
              <strong>Student's answer</strong>
            </p>

            <div class="student-answer">
              ${answer}
            </div>

            <div class="mark-row">

              <label>
                Marks awarded

                <input
                  type="number"
                  min="0"
                  max="${maxMarks}"
                  step="0.01"
                  value="${esc(awarded)}"
                  data-marks>
              </label>

              <label style="flex:1;min-width:180px">
                Teacher feedback

                <textarea
                  data-feedback
                  rows="2"
                  placeholder="Enter feedback (optional)">${esc(question.teacher_feedback || "")}</textarea>
              </label>

              <button
                type="button"
                data-save>
                Save mark
              </button>

              <span class="mark-status">
                ${
                  question.marked_at
                    ? "Previously marked"
                    : "Not yet marked"
                }
              </span>

            </div>
          </article>
        `;
      }).join("");

    answerPanel
      .querySelectorAll("[data-save]")
      .forEach(button => {
        button.addEventListener("click", () => saveMark(button));
      });
  }

  // ---------------------------------------------------------
  // 5. SAVE MARKS AND FEEDBACK
  // ---------------------------------------------------------

  async function saveMark(button) {
    const card = button.closest("[data-question]");

    if (!card || !activeAttemptId) return;

    const marksInput = card.querySelector("[data-marks]");
    const feedbackInput = card.querySelector("[data-feedback]");

    const rawMarks = marksInput.value.trim();
    const marks = Number(rawMarks);
    const maxMarks = Number(marksInput.max);

    if (
      rawMarks === "" ||
      !Number.isFinite(marks) ||
      marks < 0 ||
      marks > maxMarks
    ) {
      notify(
        `Enter a mark between 0 and ${maxMarks}.`,
        "error"
      );

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

      const student = submissions.find(
        item => item.attempt_id === activeAttemptId
      );

      if (student) {
        const question = student.questions.find(
          item => item.question_id === card.dataset.question
        );

        if (question) {
          question.awarded_marks = marks;
          question.teacher_feedback = feedbackInput.value;
          question.marked_at = new Date().toISOString();
        }

        student.manual_marks = result.manual_marks;
        student.marking_status = result.status;
      }

      const total = answerPanel.querySelector(
        "[data-manual-total]"
      );

      if (total) {
        total.textContent = num(result.manual_marks);
      }

      const status = card.querySelector(".mark-status");

      if (status) {
        status.textContent = "Saved successfully";
      }

      renderSubmissions();

      notify(
        `Mark saved successfully. Written marks: ${num(result.manual_marks)}. ` +
        (
          result.pending_questions === 0
            ? "All written questions are marked."
            : `${result.pending_questions} question(s) remain to be marked.`
        ),
        "success"
      );

    } catch (error) {
      console.error("Saving marks:", error);

      notify(error.message || String(error), "error");

    } finally {
      button.disabled = false;
      button.textContent = "Save mark";
    }
  }

  // ---------------------------------------------------------
  // 6. BUTTON EVENTS
  // ---------------------------------------------------------

  $("loadBtn").addEventListener(
    "click",
    loadSubmissions
  );

  $("refreshBtn").addEventListener(
    "click",
    loadSubmissions
  );

  examSelect.addEventListener("change", () => {
    submissions = [];
    activeAttemptId = null;

    submissionList.textContent =
      "Click Load submissions to continue.";

    answerPanel.innerHTML =
      '<div class="empty-state">Select an examination and load submissions.</div>';
  });

  // ---------------------------------------------------------
  // 7. START DASHBOARD
  // ---------------------------------------------------------

  initialise();

})();
