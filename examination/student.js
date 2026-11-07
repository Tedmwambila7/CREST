(async function () {
  "use strict";

  const E = window.CREST_EXAM;
  const msg = document.getElementById("message");
  const form = document.getElementById("accessForm");
  const access = document.getElementById("accessCard");
  const examCard = document.getElementById("examCard");
  const done = document.getElementById("doneCard");
  const submitBtn = document.getElementById("submitBtn");

  const MAIN_BRIDGE_URL =
    "https://otjybdiyoqnsynjbofuj.supabase.co/functions/v1/crest-exam-bridge";

  let bridgeToken = "";
  let attemptId = null;
  let deadline = 0;
  let timer = null;
  let submitting = false;

  function showError(error) {
    E.message(msg, error.message || String(error), "error");
  }

  async function getBridgeToken() {
    const mainSessionToken = E.getStudentSessionToken();

    if (!mainSessionToken) {
      throw new Error(
        "Sign in on the main CREST website first, then return to the examination page."
      );
    }

    const response = await fetch(MAIN_BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_token: mainSessionToken
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.exam_session_token) {
      throw new Error(
        result.error || "Could not verify your CREST student login."
      );
    }

    return result.exam_session_token;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (attemptId) return;

    const findButton = form.querySelector('button[type="submit"]');
    findButton.disabled = true;

    try {
      bridgeToken = await getBridgeToken();

      const code = String(
        new FormData(form).get("code") || ""
      ).trim();

      const started = await E.rpc("crest_student_start_exam", {
        p_session_token: bridgeToken,
        p_access_code: code || null
      });

      if (!started || !started.attempt_id || !started.deadline) {
        throw new Error(
          "The examination server returned an incomplete attempt record."
        );
      }

      attemptId = started.attempt_id;
      deadline = new Date(started.deadline).getTime();

      if (!Number.isFinite(deadline)) {
        throw new Error("The examination deadline is invalid.");
      }

      document.getElementById("examTitle").textContent =
        started.title || "Examination";

      document.getElementById("examInstructions").textContent =
        started.instructions || "Read each question carefully.";

      const questions = await E.rpc("crest_student_get_questions", {
        p_session_token: bridgeToken,
        p_attempt_id: attemptId
      });

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error(
          "This examination has no questions yet. Contact your teacher."
        );
      }

      document.getElementById("questions").innerHTML =
        questions.map(q => `
          <article class="question-item" data-qid="${E.escape(q.id)}">
            <h3>
              Question ${Number(q.question_number)}
              (${Number(q.marks)} marks)
            </h3>

            <p>${E.escape(q.question_text)}</p>

            ${["A", "B", "C", "D"].map(letter => `
              <label class="option">
                <input
                  type="radio"
                  name="q_${E.escape(q.id)}"
                  value="${letter}"
                >
                <span>
                  <b>${letter}.</b>
                  ${E.escape(q["option_" + letter.toLowerCase()])}
                </span>
              </label>
            `).join("")}
          </article>
        `).join("");

      access.classList.add("hidden");
      examCard.classList.remove("hidden");

      submitBtn.addEventListener(
        "click",
        () => submit(false),
        { once: true }
      );

      timer = setInterval(updateTimer, 1000);
      updateTimer();

    } catch (error) {
      attemptId = null;
      showError(error);
      findButton.disabled = false;
    }
  });

  async function saveAnswers() {
    if (!bridgeToken) {
      throw new Error(
        "Your examination session is missing. Reload and sign in again."
      );
    }

    const cards = [
      ...document.querySelectorAll("#questions [data-qid]")
    ];

    for (const card of cards) {
      const chosen = card.querySelector(
        "input[type=radio]:checked"
      );

      await E.rpc("crest_student_save_answer", {
        p_session_token: bridgeToken,
        p_attempt_id: attemptId,
        p_question_id: card.dataset.qid,
        p_selected_answer: chosen ? chosen.value : null
      });
    }
  }

  async function submit(automatic) {
    if (submitting || !attemptId) return;

    submitting = true;
    submitBtn.disabled = true;

    try {
      await saveAnswers();

      const result = await E.rpc("crest_student_submit_exam", {
        p_session_token: bridgeToken,
        p_attempt_id: attemptId
      });

      clearInterval(timer);

      examCard.classList.add("hidden");
      done.classList.remove("hidden");

      const score =
        result &&
        result.marks_obtained != null &&
        result.total_marks != null
          ? ` Your score is ${result.marks_obtained} out of ${result.total_marks} (${Number(result.percentage || 0).toFixed(1)}%).`
          : " Your result will be available when your teacher releases it.";

      document.getElementById("doneText").textContent =
        automatic
          ? "Time ended. Your saved answers have been submitted." + score
          : "Your answers have been submitted." + score;

    } catch (error) {
      submitting = false;
      submitBtn.disabled = false;
      alert(error.message || String(error));
    }
  }

  function updateTimer() {
    const remaining = Math.max(0, deadline - Date.now());
    const seconds = Math.floor(remaining / 1000);

    document.getElementById("timer").textContent =
      "Time remaining: " +
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");

    if (remaining <= 0) {
      clearInterval(timer);
      submit(true);
    }
  }
})();
