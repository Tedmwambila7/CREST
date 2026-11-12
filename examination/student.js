/* CREST student examination portal. Results remain hidden until the teacher releases them. */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const msg = $("message"), access = $("accessCard"), examCard = $("examCard"), done = $("doneCard");
  const form = $("accessForm");
  let attemptId = null, deadline = 0, timer = null, submitting = false;
  let sessionToken = "";

  function message(text, type = "info") { E.message(msg, text, type); }

  function renderQuestions(questions) {
    const host = $("questions"); host.replaceChildren();
    (questions || []).forEach((q, index) => {
      const article = document.createElement("article"); article.className = "question-item"; article.dataset.qid = q.id;
      const heading = document.createElement("h3"); heading.textContent = `Question ${q.question_number || index + 1} (${q.marks || 0} marks)`;
      const prompt = document.createElement("p"); prompt.textContent = q.question_text || ""; article.append(heading, prompt);
      ["a", "b", "c", "d"].forEach(letter => {
        const optionText = q["option_" + letter]; if (optionText == null || optionText === "") return;
        const label = document.createElement("label"); label.className = "option";
        const input = document.createElement("input"); input.type = "radio"; input.name = "q_" + q.id; input.value = letter.toUpperCase();
        const span = document.createElement("span"); span.textContent = letter.toUpperCase() + ". " + optionText;
        label.append(input, span); article.append(label); input.addEventListener("change", () => saveAnswer(article));
      }); host.append(article);
    });
  }

  async function saveAnswer(card) {
    if (!attemptId || !sessionToken || submitting || Date.now() >= deadline) return;
    const selected = card.querySelector('input[type="radio"]:checked');
    try {
      await E.rpc("crest_student_save_answer", { p_session_token: sessionToken, p_attempt_id: attemptId,
        p_question_id: card.dataset.qid, p_selected_answer: selected ? selected.value : null });
      message("Answer saved.", "success");
    } catch (error) { message("Answer could not be saved: " + (error.message || error), "error"); }
  }

  async function saveAllAnswers() {
    const cards = Array.from(document.querySelectorAll("#questions [data-qid]"));
    for (const card of cards) {
      if (Date.now() >= deadline) break;
      const selected = card.querySelector('input[type="radio"]:checked');
      await E.rpc("crest_student_save_answer", { p_session_token: sessionToken, p_attempt_id: attemptId,
        p_question_id: card.dataset.qid, p_selected_answer: selected ? selected.value : null });
    }
  }

  async function checkReleasedResult() {
    const resultMessage = $("doneText");
    try {
      const result = await E.rpc("crest_student_get_result", { p_session_token: sessionToken, p_attempt_id: attemptId });
      if (!result || !result.released) {
        resultMessage.textContent = "Your examination has been submitted. Your results are still hidden. The teacher will release them when ready.";
        return;
      }
      resultMessage.textContent = `Your results have been released: ${result.marks_obtained} out of ${result.total_marks} (${Number(result.percentage).toFixed(1)}%).`;
    } catch (error) { resultMessage.textContent = "Your examination was submitted. Results are not available yet."; }
  }

  async function startExam(event) {
    event.preventDefault(); if (submitting || attemptId) return;
    sessionToken = E.getStudentSessionToken();
    if (!sessionToken) { message("Your CREST student session was not found. Sign in on the main CREST website, then return here.", "error"); return; }
    const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
    try {
      message("Connecting to CREST and checking the examination access code...");
      const codeField = form.elements.namedItem("code");
      const started = await E.rpc("crest_student_start_exam", { p_session_token: sessionToken, p_access_code: codeField ? (codeField.value.trim() || null) : null });
      if (!started || !started.attempt_id || !started.deadline) throw new Error("The server did not return a valid examination attempt.");
      attemptId = started.attempt_id; deadline = new Date(started.deadline).getTime();
      $("examTitle").textContent = started.title || "Examination";
      $("examInstructions").textContent = started.instructions || "Read each question carefully. Your answers are saved as you work.";
      message("Loading examination questions...");
      const questions = await E.rpc("crest_student_get_questions", { p_session_token: sessionToken, p_attempt_id: attemptId });
      renderQuestions(questions || []); access.classList.add("hidden"); examCard.classList.remove("hidden");
      $("submitBtn").disabled = false; timer = setInterval(updateTimer, 1000); updateTimer(); message("");
    } catch (error) { attemptId = null; message(error.message || String(error), "error"); if (button) button.disabled = false; }
  }

  async function submitExam(auto = false) {
    const button = $("submitBtn"); if (submitting || !attemptId) return;
    submitting = true; button.disabled = true; clearInterval(timer);
    try {
      message(auto ? "Time has ended. Submitting your saved answers..." : "Saving your answers and submitting the examination...");
      // At timeout the server rejects answer updates. Submit the answers already saved instead.
      if (!auto && Date.now() < deadline) {
        try { await saveAllAnswers(); } catch (saveError) { message("Some latest answers could not be saved. Submitting answers already saved...", "info"); }
      }
      await E.rpc("crest_student_submit_exam", { p_session_token: sessionToken, p_attempt_id: attemptId });
      examCard.classList.add("hidden"); done.classList.remove("hidden");
      $("doneText").textContent = auto
        ? "Time ended. Your saved answers have been submitted. Your results will remain hidden until your teacher releases them."
        : "Your answers have been submitted. Your results will remain hidden until your teacher releases them.";
      const check = $("checkResultBtn"); if (check) check.addEventListener("click", checkReleasedResult);
    } catch (error) {
      submitting = false; button.disabled = false;
      message("Submission could not be confirmed: " + (error.message || error), "error");
      if (auto) timer = setInterval(updateTimer, 1000);
    }
  }

  function updateTimer() {
    const remaining = Math.max(0, deadline - Date.now()), seconds = Math.floor(remaining / 1000);
    $("timer").textContent = "Time remaining: " + String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    if (remaining <= 0) { clearInterval(timer); submitExam(true); }
  }

  form.addEventListener("submit", startExam);
  $("submitBtn").addEventListener("click", () => submitExam(false));
  try {
    E.getClient();
    message(E.getStudentSessionToken() ? "Enter the examination access code. Leave it blank for an open-access examination." : "Please sign in on the main CREST website first, then return here to sit your examination.", "info");
  } catch (error) { message(error.message || String(error), "error"); }
})();
