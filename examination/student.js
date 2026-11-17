
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
  let mediaUploadsInProgress = 0;
  let mediaRecordingInProgress = false;
  let mediaPickerStartedAt = 0;
  let pdfPapers = [];
  let activePdfPaper = null;

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
      let examRecordingTimer = null;
      let examRecordingStartedAt = 0;
      const EXAM_RECORDING_LIMIT_MS = 5 * 60 * 1000;
      const formatRecordingTime = seconds => {
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
      };
      const clearExamRecordingTimer = () => {
        if (examRecordingTimer) clearInterval(examRecordingTimer);
        examRecordingTimer = null;
      };
      recordBtn.addEventListener("click", async () => {
        if (recorder && recorder.state === "recording") {
          clearExamRecordingTimer();
          recorder.stop();
          recordBtn.textContent = "Record voice answer";
          return;
        }
        if (!window.isSecureContext) {
          audioStatus.textContent = "Microphone access requires the secure HTTPS CREST website.";
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
          audioStatus.textContent = "This browser cannot record audio. Please use the latest Chrome or Edge.";
          return;
        }
        try {
          recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const preferred = [
            "audio/webm;codecs=opus", "audio/webm",
            "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"
          ].find(type => MediaRecorder.isTypeSupported(type));
          recorder = new MediaRecorder(recordingStream, preferred ? { mimeType: preferred } : undefined);
          audioChunks = [];
          recorder.ondataavailable = event => { if (event.data?.size) audioChunks.push(event.data); };
          recorder.onerror = () => { audioStatus.textContent = "Recording failed. Please try again."; };
          recorder.onstop = async () => {
            clearExamRecordingTimer();
            mediaRecordingInProgress = false;
            recordBtn.removeAttribute("data-recording");
            recordBtn.disabled = false;
            recordBtn.textContent = "Record voice answer";
            recordingStream?.getTracks().forEach(track => track.stop());
            recordingStream = null;
            const blob = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
            if (!blob.size) { audioStatus.textContent = "No audio was captured. Check your microphone and try again."; return; }
            if (blob.size > 15 * 1024 * 1024) { audioStatus.textContent = "Voice note exceeds 15 MB. Record a shorter answer."; return; }
            audioStatus.textContent = "Uploading voice answer...";
            mediaUploadsInProgress++;
            try {
              await uploadMedia(article, blob, "audio");
              addUploadedPreview(article, blob, "audio", "Voice answer");
              audioStatus.textContent = "Voice answer uploaded and attached to this question.";
            } catch (error) {
              audioStatus.textContent = error.message || "Voice upload failed.";
            } finally { mediaUploadsInProgress = Math.max(0, mediaUploadsInProgress - 1); }
          };
          recorder.start(1000);
          mediaRecordingInProgress = true;
          examRecordingStartedAt = Date.now();
          recordBtn.dataset.recording = "true";
          recordBtn.textContent = "Stop and upload";
          audioStatus.textContent = "Recording… 00:00 / 05:00. Press Stop and upload when finished.";
          clearExamRecordingTimer();
          examRecordingTimer = setInterval(() => {
            const elapsed = Date.now() - examRecordingStartedAt;
            const remaining = Math.max(0, Math.ceil((EXAM_RECORDING_LIMIT_MS - elapsed) / 1000));
            audioStatus.textContent = "Recording… " + formatRecordingTime(Math.floor(elapsed / 1000)) + " / 05:00";
            if (remaining <= 0 && recorder && recorder.state === "recording") {
              clearExamRecordingTimer();
              audioStatus.textContent = "Five-minute limit reached. Preparing your voice answer…";
              recorder.stop();
            }
          }, 250);
        } catch (error) {
          clearExamRecordingTimer();
          mediaRecordingInProgress = false;
          recordBtn.disabled = false;
          recordBtn.removeAttribute("data-recording");
          recordingStream?.getTracks().forEach(track => track.stop());
          recordingStream = null;
          audioStatus.textContent = error.name === "NotAllowedError"
            ? "Microphone permission was blocked. Allow microphone access for tedmwambila7.github.io in your browser settings."
            : error.name === "NotFoundError"
            ? "No microphone was found on this device."
            : (error.message || "Microphone could not start. Check browser permissions and try again.");
        }
      });
      const photoRow = document.createElement("div");
      photoRow.className = "media-action-row";
      const photoLabel = document.createElement("label");
      photoLabel.className = "media-file-label";
      photoLabel.textContent = "Take photo / upload handwritten answer";
      const photoInput = document.createElement("input");
      photoInput.type = "file";
      photoInput.accept = "image/*";
      photoInput.setAttribute("capture", "environment");
      photoInput.className = "media-file-input";
      const photoStatus = document.createElement("span");
      photoStatus.className = "media-status";
      photoInput.addEventListener("click", () => { choosingPhoto = true; mediaPickerStartedAt = Date.now(); });
      photoInput.addEventListener("cancel", () => { choosingPhoto = false; });
      photoInput.addEventListener("change", async () => {
        choosingPhoto = false;
        const file = photoInput.files?.[0];
        if (!file) return;
        photoStatus.textContent = "Uploading photo...";
        mediaUploadsInProgress++;
        try {
          await uploadMedia(article, file, "image");
          addUploadedPreview(article, file, "image", file.name || "Photo answer");
          photoStatus.textContent = "Photo uploaded and attached to this question.";
        } catch (error) {
          photoStatus.textContent = error.message || "Photo upload failed.";
        } finally {
          mediaUploadsInProgress = Math.max(0, mediaUploadsInProgress - 1);
          photoInput.value = "";
        }
      });
      photoLabel.append(photoInput);
      photoRow.append(photoLabel, photoStatus);
      mediaBox.append(photoRow);
      const previewList = document.createElement("div");
      previewList.className = "answer-media-previews";
      previewList.setAttribute("aria-live", "polite");
      mediaBox.append(previewList);
      article.append(mediaBox);

      if (Array.isArray(q.options) && q.options.length) {
        q.options.forEach(option => {
          const label = document.createElement("label");
          label.className = "option";

          const input = document.createElement("input");
          input.type = "radio";
          input.name = `q_${q.id}`;
          input.value = option.id;
          input.checked = String(q.saved_answer ?? "") === String(option.id);

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
        field.value = q.saved_answer ?? "";
        field.addEventListener("change", () => saveAnswer(article));
        article.append(field);
      }

      host.append(article);
    });
  }

  function addUploadedPreview(card, file, mediaType, label) {
    const host = card.querySelector(".answer-media-previews");
    if (!host) return;
    const item = document.createElement("div");
    item.className = "answer-media-preview";
    const title = document.createElement("strong");
    title.textContent = label;
    const detail = document.createElement("span");
    detail.textContent = mediaType === "image" ? "Photo uploaded" : "Voice recording uploaded";
    item.append(title, detail);
    if (mediaType === "image") {
      const img = document.createElement("img");
      img.alt = label;
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.onload = img.onerror = () => URL.revokeObjectURL(objectUrl);
      item.prepend(img);
    } else {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = URL.createObjectURL(file);
      item.append(audio);
    }
    host.append(item);
  }

  async function uploadMedia(card, file, mediaType) {
    if (!attemptId) throw new Error("Start the examination before uploading.");
    if (mediaType === "image" && window.createImageBitmap) {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
        if (scale < 1 || file.size > 4 * 1024 * 1024) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const compressed = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.84));
          bitmap.close?.();
          if (compressed) file = new File([compressed], "handwritten-answer.jpg", { type: "image/jpeg" });
        } else {
          bitmap.close?.();
        }
      } catch (_) {
        // Keep the original file; the server accepts common mobile image formats.
      }
    }
    if (file.size > 15 * 1024 * 1024) throw new Error("This attachment is still over 15 MB after compression. Please take a lower-resolution photo.");
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

  function renderPdfAnswerSheet(questions, paper) {
    const host = $("questions");
    host.innerHTML = "";
    const heading = document.createElement("h3");
    heading.textContent = "Original question paper — " + (paper.file_name || "");
    const frame = document.createElement("iframe");
    frame.title = "Original PDF examination paper";
    frame.src = paper.url;
    frame.style.cssText = "width:100%;height:72vh;border:1px solid #cbd5d1;border-radius:10px;background:#fff";
    host.append(heading, frame);

    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.id = "floatingAnswerSheet";
    launcher.textContent = "▤ ANSWER SHEET";
    launcher.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:1000;border:0;border-radius:999px;padding:15px 20px;background:#123d2b;color:#fff;font-weight:800;box-shadow:0 5px 20px #0004;cursor:pointer";
    const panel = document.createElement("section");
    panel.id = "pdfAnswerPanel";
    panel.style.cssText = "display:none;position:fixed;right:16px;bottom:82px;z-index:999;width:min(390px,calc(100vw - 32px));max-height:72vh;overflow:auto;background:#fff;border:2px solid #123d2b;border-radius:14px;padding:14px;box-shadow:0 8px 28px #0005";
    const title = document.createElement("h3"); title.textContent = "PDF ANSWER SHEET";
    const note = document.createElement("p"); note.textContent = "Choose A, B, C or D. Your answers save automatically."; note.className = "muted";
    panel.append(title, note);
    questions.forEach((q,index) => {
      const card = document.createElement("article");
      card.className = "question-item"; card.dataset.qid = q.id; card.style.margin = "10px 0";
      const h = document.createElement("strong"); h.textContent = "Question " + (q.question_order || index+1) + " (" + q.marks + " marks)";
      const row = document.createElement("div"); row.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px";
      (q.options || []).forEach(option => {
        const label=document.createElement("label"); label.style.cssText="display:flex;gap:5px;align-items:center;border:1px solid #ccd5cf;border-radius:8px;padding:9px;cursor:pointer";
        const radio=document.createElement("input"); radio.type="radio"; radio.name="q_"+q.id; radio.value=option.id;
        radio.checked = String(q.saved_answer ?? "") === String(option.id);
        radio.addEventListener("change",()=>saveAnswer(card));
        const span=document.createElement("span"); span.textContent=option.label;
        label.append(radio,span); row.append(label);
      });
      card.append(h,row); host.append(card);
    });
    launcher.addEventListener("click",()=>{panel.style.display=panel.style.display==="none"?"block":"none";});
    const close=document.createElement("button"); close.type="button"; close.textContent="Close answer sheet"; close.className="secondary-btn";
    close.addEventListener("click",()=>{panel.style.display="none";});
    panel.append(close); document.body.append(panel,launcher);
  }

  async function startExam(event) {
    event?.preventDefault?.();

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

      const pdfPaper = activePdfPaper && activePdfPaper.examination_id === examId ? activePdfPaper : null;
      if (pdfPaper) renderPdfAnswerSheet(questions || [], pdfPaper);
      else renderQuestions(questions || []);

      access.classList.add("hidden");
      examCard.classList.remove("hidden");

      $("submitBtn").disabled = false;
      timer = setInterval(updateTimer, 1000);
      updateTimer();

      message("");
    } catch (error) {
      btn.disabled = false;
      if (activePdfPaper) {
        $("studentPapersCard").classList.remove("hidden");
        access.classList.add("hidden");
        E.message($("studentPapersMessage"), error.message || String(error), "error");
      } else {
        message(error.message || String(error), "error");
      }
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
      document.getElementById("pdfAnswerPanel")?.remove();
      document.getElementById("floatingAnswerSheet")?.remove();
      examCard.classList.add("hidden");
      done.classList.remove("hidden");

      const percent = Number(result.percentage || 0).toFixed(1);

      $("doneText").textContent = activePdfPaper
        ? "Your PDF answer sheet has been submitted successfully. Your teacher will review answers without an automatic answer key, and the administrator will confirm your final result."
        : `Your examination has been submitted. Score: ${result.automatic_marks} out of ${result.total_marks} (${percent}%).`;
      activePdfPaper = null;
    } catch (error) {
      btn.disabled = false;
      message(error.message || String(error), "error");
    }
  }

  // Strict exam mode: leaving the examination tab submits the attempt.
  document.addEventListener("visibilitychange", () => {
    // Mobile camera/gallery pickers hide this tab temporarily; do not auto-submit.
    if (document.visibilityState === "hidden" && attemptId && !choosingPhoto &&
        mediaUploadsInProgress === 0 && !mediaRecordingInProgress &&
        !examCard.classList.contains("hidden")) submitExam();
  });

  window.addEventListener("focus", () => {
    // Some mobile browsers omit the file-input cancel event.
    if (choosingPhoto && Date.now() - mediaPickerStartedAt > 3000) {
      setTimeout(() => {
        if (choosingPhoto && document.visibilityState === "visible") choosingPhoto = false;
      }, 30000);
    }
  });

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

  async function loadStudentResults() {
    const panel = $("studentResultsCard");
    const list = $("studentResultsList");
    const status = $("studentResultsMessage");
    panel.classList.remove("hidden");
    access.classList.add("hidden");
    done.classList.add("hidden");
    list.textContent = "Loading confirmed results...";
    try {
      if (!token) token = await E.getExamSessionToken();
      const rows = await E.rpc("crest_online_student_results", { p_session_token: token }) || [];
      if (!rows.length) {
        list.innerHTML = '<div class="empty-state"><strong>No confirmed results yet.</strong><p>Your marks will appear here after your teacher completes marking and the administrator confirms the result. Please check again later.</p></div>';
        E.message(status, "The results section is working, but there are currently no confirmed results for this student account.", "info");
        return;
      }
      list.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Examination</th><th>Subject</th><th>Score</th><th>Total</th><th>Percentage</th><th>Confirmed</th></tr></thead><tbody>' +
        rows.map(row => '<tr><td>' + E.escape(row.title || "Examination") + '</td><td>' + E.escape(row.subject || "—") + '</td><td>' + Number(row.total_score || 0).toFixed(2) + '</td><td>' + Number(row.total_marks || 0).toFixed(2) + '</td><td>' + Number(row.percentage || 0).toFixed(1) + '%</td><td>' + E.escape(E.formatDate(row.confirmed_at)) + '</td></tr>').join("") +
        '</tbody></table></div>';
      E.message(status, rows.length + " confirmed result(s) available.", "success");
    } catch (error) {
      list.innerHTML = '<div class="empty-state">Results could not be loaded. ' + E.escape(error.message || String(error)) + '</div>';
      E.message(status, error.message || String(error), "error");
    }
  }

  $("showResults")?.addEventListener("click", loadStudentResults);
  $("closeResults")?.addEventListener("click", () => {
    $("studentResultsCard").classList.add("hidden");
    access.classList.remove("hidden");
  });

  async function loadStudentPapers() {
    $("studentPapersCard").classList.remove("hidden");
    access.classList.add("hidden");
    $("studentResultsCard").classList.add("hidden");
    $("studentPapersList").textContent = "Loading PDF papers...";
    $("studentPaperViewer").style.display = "none";
    try {
      if (!token) token = await E.getExamSessionToken();
      const papers = await examCall("papers");
      pdfPapers = Array.isArray(papers) ? papers : [];
      if (!pdfPapers.length) {
        $("studentPapersList").innerHTML = '<div class="empty-state">No published PDF papers are available at the moment.</div>';
        E.message($("studentPapersMessage"), "Check again after your teacher publishes a PDF examination.", "info");
        return;
      }
      $("studentPapersList").innerHTML = papers.map((paper, index) =>
        '<article class="question-item"><h3>' + E.escape(paper.title || "Examination paper") + '</h3><p>' +
        E.escape(paper.subject || "") + ' · ' + E.escape(paper.file_name || "PDF paper") +
        '</p><button type="button" class="open-student-paper" data-paper-index="' + index + '">Open paper</button> <button type="button" class="start-pdf-answer-sheet" data-paper-index="' + index + '">Start exam &amp; answer</button></article>'
      ).join("");
      $("studentPapersList").querySelectorAll(".open-student-paper").forEach(button => {
        button.addEventListener("click", () => {
          const paper = pdfPapers[Number(button.dataset.paperIndex)];
          const viewer = $("studentPaperViewer");
          // Keep the PDF inside CREST instead of navigating the student away.
          viewer.src = paper.url + (paper.url.includes("?") ? "&" : "?") + "download=0";
          viewer.style.display = "block";
          viewer.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      $("studentPapersList").querySelectorAll(".start-pdf-answer-sheet").forEach(button => {
        button.addEventListener("click", () => {
          const paper = pdfPapers[Number(button.dataset.paperIndex)];
          const select = $("examSelect");
          if (![...select.options].some(option => option.value === paper.examination_id)) {
            E.message($("studentPapersMessage"), "This paper has no configured answer sheet yet. Ask your teacher to configure it in Question Management.", "error");
            return;
          }
          activePdfPaper = paper;
          select.value = paper.examination_id;
          $("studentPaperViewer").src = "";
          $("studentPaperViewer").style.display = "none";
          E.message($("studentPapersMessage"), "Starting your examination...", "info");
          // Call the start routine directly; do not submit a hidden form.
          startExam({ preventDefault() {} });
        });
      });
      E.message($("studentPapersMessage"), papers.length + " published PDF paper(s) available.", "success");
    } catch (error) {
      $("studentPapersList").innerHTML = '<div class="empty-state">' + E.escape(error.message || String(error)) + '</div>';
      E.message($("studentPapersMessage"), error.message || String(error), "error");
    }
  }

  $("showPapers")?.addEventListener("click", loadStudentPapers);
  $("closePapers")?.addEventListener("click", () => {
    $("studentPapersCard").classList.add("hidden");
    $("studentPaperViewer").src = "";
    access.classList.remove("hidden");
  });

  form.addEventListener("submit", startExam);
  $("submitBtn").addEventListener("click", submitExam);
  $("reloadExams").addEventListener("click", loadAvailableExams);

  loadAvailableExams();
})();
