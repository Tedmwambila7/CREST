
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
  let choosingPhoto = false;

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

      // Optional spoken or handwritten response attachments for this question.
      const mediaBox = document.createElement("div");
      mediaBox.className = "answer-media-tools";
      const mediaTitle = document.createElement("strong");
      mediaTitle.textContent = "Attach an answer (optional)";
      mediaBox.append(mediaTitle);

      const audioRow = document.createElement("div");
      audioRow.className = "media-action-row";
      const recordBtn = document.createElement("button");
      recordBtn.type = "button";
      recordBtn.className = "secondary-btn";
      recordBtn.textContent = "Record voice answer";
      const audioStatus = document.createElement("span");
      audioStatus.className = "media-status";
      audioStatus.textContent = "Allow microphone access when asked.";
      audioRow.append(recordBtn, audioStatus);
      mediaBox.append(audioRow);

      let recorder = null;
      let audioChunks = [];
      let recordingStream = null;
      recordBtn.addEventListener("click", async () => {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
          recordBtn.textContent = "Record voice answer";
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
          audioStatus.textContent = "Voice recording is not supported by this browser.";
          return;
        }
        try {
          recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
          recorder = new MediaRecorder(recordingStream, preferred ? { mimeType: preferred } : undefined);
          audioChunks = [];
          recorder.ondataavailable = event => { if (event.data?.size) audioChunks.push(event.data); };
          recorder.onerror = () => { audioStatus.textContent = "Recording failed. Please try again."; };
          recorder.onstop = async () => {
            recordingStream?.getTracks().forEach(track => track.stop());
            const blob = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
            if (blob.size > 15 * 1024 * 1024) {
              audioStatus.textContent = "Voice note exceeds 15 MB. Record a shorter answer.";
              return;
            }
            audioStatus.textContent = "Uploading voice answer...";
            try {
              await uploadMedia(card, blob, "audio");
              audioStatus.textContent = "Voice answer uploaded.";
            } catch (error) {
              audioStatus.textContent = error.message || "Voice upload failed.";
            }
          };
          recorder.start();
          recordBtn.textContent = "Stop and upload";
          audioStatus.textContent = "Recording…";
        } catch (error) {
          audioStatus.textContent = error.message || "Microphone permission was not granted.";
        }
      });
      const photoRow = document.createElement("div");
      photoRow.className = "media-action-row";
      const photoLabel = document.createElement("label");
      photoLabel.className = "media-file-label";
      photoLabel.textContent = "Take photo / upload handwritten answer";
      const photoInput = document.createElement("input");
      photoInput.type = "file";
      photoInput.accept = "image/jpeg,image/png,image/webp";
      photoInput.setAttribute("capture", "environment");
      photoInput.className = "media-file-input";
      const photoStatus = document.createElement("span");
      photoStatus.className = "media-status";
      photoInput.addEventListener("click", () => { choosingPhoto = true; });
      photoInput.addEventListener("change", async () => {
        choosingPhoto = false;
        const file = photoInput.files?.[0];
        if (!file) return;
        photoStatus.textContent = "Uploading photo...";
        try {
          await uploadMedia(card, file, "image");
          photoStatus.textContent = "Photo uploaded.";
        } catch (error) {
          photoStatus.textContent = error.message || "Photo upload failed.";
        } finally { photoInput.value = ""; }
      });
      photoLabel.append(photoInput);
      photoRow.append(photoLabel, photoStatus);
      mediaBox.append(photoRow);
      article.append(mediaBox);

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

  async function uploadMedia(card, file, mediaType) {
    if (!attemptId) throw new Error("Start the examination before uploading.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Each attachment must be 15 MB or smaller.");
    const mime = (file.type || (mediaType === "image" ? "image/jpeg" : "audio/webm")).split(";")[0].toLowerCase();
    const prepared = await examCall("prepare_media_upload", {
      p_attempt_id: attemptId,
      p_question_id: card.dataset.qid,
      p_media_type: mediaType,
      p_mime_type: mime,
      p_file_size: file.size
    });
    const { error: uploadError } = await E.getClient().storage
      .from("crest-exam-answers")
      .uploadToSignedUrl(prepared.path, prepared.token, file, {
        contentType: mime,
        upsert: false
      });
    if (uploadError) throw uploadError;
    await examCall("register_media", {
      p_attempt_id: attemptId,
      p_question_id: card.dataset.qid,
      p_storage_path: prepared.path,
      p_media_type: mediaType,
      p_mime_type: mime,
      p_file_size: file.size
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

  // Strict exam mode: leaving the examination tab submits the attempt.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && attemptId && !choosingPhoto && !examCard.classList.contains("hidden")) {
      submitExam();
    }
  });

  window.addEventListener("focus", () => { choosingPhoto = false; });

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
