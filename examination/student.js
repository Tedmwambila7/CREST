
/* CREST STUDENT PORTAL — Edge Function connection */
(() => {
  "use strict";

  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);

  const msg = $("message");
  const access = $("accessCard");
  const examCard = $("examCard");
  const done = $("doneCard");
  const form = $("accessForm");

  let token = "";
  let attemptId = null;
  let deadline = 0;
  let timer = null;
  let saving = false;

  function message(text, type = "info") {
    E.message(msg, text, type);
  }

  async function examCall(action, params = {}) {
    const { data, error } = await E.getClient().functions.invoke(
      "crest-student-exams",
      {
        body: {
          action,
          p_exam_session_token: token,
          ...params
        }
      }
    );

    if (error) {
      let details = error.message || "Examination request failed.";
      try {
        const response = error.context;
        if (response && typeof response.json === "function") {
          const result = await response.json();
          details = result.error || details;
        }
      } catch (_) {}
      throw new Error(details);
    }

    if (data?.error) throw new Error(data.error);
    return data;
  }

  function safeUrl(value) {
    try {
      const u = new URL(value, location.href);
      return ["https:", "http:"].includes(u.protocol) ? u.href : "";
    } catch (_) {
      return "";
    }
  }

  async function loadAvailableExams() {
    try {
      message("Verifying your CREST student session...");
      token = await E.getExamSessionToken();

      message("Loading available examinations...");
      const exams = await examCall("list");

      const select = $("examSelect");
      select.innerHTML =
        '<option value="">Choose an examination</option>';

      (exams || []).forEach(exam => {
        const option = document.createElement("option");
        option.value = exam.id;
        option.textContent =
          `${exam.title} — ${exam.subject || "General"} (${exam.duration_minutes} min)`;
        select.appendChild(option);
      });

      if (!exams?.length) {
        message("There are currently no published examinations available.", "info");
      } else {
        message(`${exams.length} examination(s) available. Select one and begin.`, "success");
      }
    } catch (error) {
      message(error.message || String(error), "error");
    }
  }

  function renderQuestions(questions) {
    const host = $("questions");
    host.replaceChildren();

    questions.forEach((q, index) => {
      const article = document.createElement("article");
      article.className = "question-item";
      article.dataset.qid = q.id;

      const heading = document.createElement("h3");
      heading.textContent =
        `Question ${q.question_order || index + 1} (${q.marks} marks)`;

      const prompt = document.createElement("p");
      prompt.textContent = q.question_text || "";

      article.append(heading, prompt);

      const image = safeUrl(q.image_url);
      if (image) {
        const img = document.createElement("img");
        img.src = image;
        img.alt = "Question illustration";
        img.loading = "lazy";
        img.style.maxWidth = "100%";
        article.append(img);
      }

      if (Array.isArray(q.options) && q.options.length) {
        q.options.forEach(option => {
          const label = document.createElement("label");
          label.className = "option";

          const input = document.createElement("input");
          input.type = "radio";
          input.name = `q_${q.id}`;
          input.value = option.id;

          const span = document.createElement("span");
          span.textContent = `${option.label}. ${option.text}`;

          label.append(input, span);
          article.append(label);

          input.addEventListener("change", () => saveAnswer(article));
        });
      } else {
        const field = document.createElement(
          q.question_type === "essay" ? "textarea" : "input"
        );

        field.dataset.answerText = "true";
        field.placeholder =
          q.question_type === "essay"
            ? "Write your answer here..."
            : "Enter your answer...";

        if (field.tagName === "TEXTAREA") field.rows = 5;

        field.maxLength = 20000;
        field.addEventListener("change", () => saveAnswer(article));
        article.append(field);
      }

      host.append(article);
    });
  }

  async function saveAnswer(card) {
    if (!attemptId || saving) return;

    const chosen = card.querySelector("input[type=radio]:checked");
    const text = card.querySelector("[data-answer-text]");

    try {
      await examCall("save", {
        p_attempt_id: attemptId,
        p_question_id: card.dataset.qid,
        p_selected_option_id: chosen ? chosen.value : null,
        p_answer_text: text ? text.value : null
      });
    } catch (error) {
      message(`Answer could not be saved: ${error.message || error}`, "error");
    }
  }

  async function startExam(event) {
    event.preventDefault();

    const examId = $("examSelect").value;
    if (!examId) {
      message("Select an examination first.", "error");
      return;
    }

    const btn = $("startExamBtn");
    btn.disabled = true;

    try {
      const started = await examCall("start", {
        p_exam_id: examId
      });

      attemptId = started.attempt_id;
      deadline = new Date(started.deadline).getTime();

      $("examTitle").textContent = started.title;
      $("examInstructions").textContent =
        started.instructions ||
        "Read each question carefully. Your answers are saved as you work.";

      const questions = await examCall("questions", {
        p_attempt_id: attemptId
      });

      renderQuestions(questions || []);

      access.classList.add("hidden");
      examCard.classList.remove("hidden");

      $("submitBtn").disabled = false;
      timer = setInterval(updateTimer, 1000);
      updateTimer();

      message("");
    } catch (error) {
      message(error.message || String(error), "error");
      btn.disabled = false;
    }
  }

  async function submitExam() {
    const btn = $("submitBtn");
    if (btn.disabled) return;

    btn.disabled = true;

    try {
      for (const card of document.querySelectorAll("[data-qid]")) {
        await saveAnswer(card);
      }

      const result = await examCall("submit", {
        p_attempt_id: attemptId
      });

      clearInterval(timer);
      examCard.classList.add("hidden");
      done.classList.remove("hidden");

      const percent = Number(result.percentage || 0).toFixed(1);

      $("doneText").textContent =
        `Your examination has been submitted. Score: ${result.automatic_marks} out of ${result.total_marks} (${percent}%).`;
    } catch (error) {
      btn.disabled = false;
      message(error.message || String(error), "error");
    }
  }

  function updateTimer() {
    const remaining = Math.max(0, deadline - Date.now());
    const seconds = Math.floor(remaining / 1000);

    $("timer").textContent =
      `Time remaining: ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

    if (remaining <= 0) {
      clearInterval(timer);
      submitExam();
    }
  }

  form.addEventListener("submit", startExam);
  $("submitBtn").addEventListener("click", submitExam);
  $("reloadExams").addEventListener("click", loadAvailableExams);

  loadAvailableExams();
})();
