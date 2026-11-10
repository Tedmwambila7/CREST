/* CREST EXAMINATION — MASTER 4: PAPER AND MARKING-SCHEME PDF GENERATOR
   Additive front-end module. Uses the existing examinations,
   examination_questions and examination_question_options tables.
   Does not modify exam.js, authentication, student records or database tables.
*/
(() => {
  "use strict";

  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const examSelect = $("examSelect");
  const printArea = $("printArea");
  const message = $("paperMessage");

  if (!E || !examSelect || !printArea) {
    console.error("CREST MASTER 4 could not find its required page elements.");
    return;
  }

  let examinations = [];
  let activeExam = null;
  let activeQuestions = [];
  let loading = false;

  const escape = value => E.escape(value ?? "");
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const safeImage = value => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) { return ""; }
  };

  function showMessage(text, type = "info") {
    E.message(message, text, type);
  }

  async function loadExaminations() {
    if (loading) return;
    loading = true;
    examSelect.disabled = true;
    examSelect.innerHTML = '<option value="">Loading examinations...</option>';
    showMessage("Checking teacher access and loading examinations...", "info");

    try {
      await E.requireTeacher();
      const { data, error } = await E.getClient()
        .from("examinations")
        .select("id,title,subject,status,duration_minutes,total_marks,instructions,start_time,scheduled_at,ends_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      examinations = data || [];
      examSelect.innerHTML = '<option value="">Choose an examination</option>';
      examinations.forEach(exam => {
        const option = document.createElement("option");
        option.value = exam.id;
        option.textContent = `${exam.title} — ${exam.subject || "No subject"} (${exam.status || "draft"})`;
        examSelect.appendChild(option);
      });

      if (!examinations.length) {
        showMessage("No examinations are available to this account.", "info");
        printArea.innerHTML = '<div class="paper-empty">Create an examination and add questions before generating a paper.</div>';
        return;
      }

      const requestedId = new URLSearchParams(window.location.search).get("exam");
      if (requestedId && examinations.some(exam => exam.id === requestedId)) {
        examSelect.value = requestedId;
      } else if (examinations.length === 1) {
        examSelect.value = examinations[0].id;
      }

      showMessage(`${examinations.length} examination(s) loaded.`, "success");
      if (examSelect.value) await loadSelectedExam();
    } catch (error) {
      console.error("CREST MASTER 4:", error);
      examSelect.innerHTML = '<option value="">Could not load examinations</option>';
      showMessage(error.message || String(error), "error");
    } finally {
      loading = false;
      examSelect.disabled = false;
    }
  }

  async function loadSelectedExam() {
    const examId = examSelect.value;
    activeExam = examinations.find(exam => exam.id === examId) || null;
    activeQuestions = [];

    if (!activeExam) {
      printArea.innerHTML = '<div class="paper-empty">Select an examination to preview its paper.</div>';
      return;
    }

    printArea.innerHTML = '<div class="paper-empty">Loading examination questions...</div>';
    showMessage("Loading questions and answer options...", "info");

    try {
      const { data, error } = await E.getClient()
        .from("examination_questions")
        .select(`
          id, examination_id, question_text, question_type, marks,
          question_order, correct_answer, explanation, image_url,
          examination_question_options (id, option_label, option_text, is_correct)
        `)
        .eq("examination_id", examId)
        .order("question_order", { ascending: true });
      if (error) throw error;

      activeQuestions = data || [];
      if (!activeQuestions.length) {
        printArea.innerHTML = '<div class="paper-empty">This examination has no questions yet. Add questions in Question Management.</div>';
        showMessage("No questions have been added to this examination.", "info");
        return;
      }

      renderPaper("student");
      showMessage(`${activeQuestions.length} question(s) loaded. Your paper is ready to preview.`, "success");
    } catch (error) {
      console.error("Load examination paper:", error);
      printArea.innerHTML = '<div class="paper-empty">Questions could not be loaded.</div>';
      showMessage(error.message || String(error), "error");
    }
  }

  function getTotalMarks() {
    const fromExam = number(activeExam?.total_marks);
    return fromExam > 0 ? fromExam : activeQuestions.reduce((sum, q) => sum + number(q.marks), 0);
  }

  function getHeader() {
    const school = $("schoolName").value.trim() || "CREST Academy";
    const logo = safeImage($("logoUrl").value.trim());
    const title = activeExam?.title || "Examination";
    const subject = activeExam?.subject || "";
    const duration = number(activeExam?.duration_minutes) || 60;
    const date = activeExam?.scheduled_at || activeExam?.start_time;
    return `
      <header class="paper-header">
        ${logo ? `<img class="paper-logo" src="${escape(logo)}" alt="School logo">` : ""}
        <p class="paper-school">${escape(school)}</p>
        <h1 class="paper-title">${escape(title)}</h1>
        <p class="paper-subject">${escape(subject)}</p>
        <div class="paper-meta">
          <div><strong>Duration:</strong> ${duration} minutes</div>
          <div><strong>Total marks:</strong> ${getTotalMarks()}</div>
          <div><strong>Date:</strong> ${escape(date ? E.formatDate(date) : "________________")}</div>
          <div><strong>Number of questions:</strong> ${activeQuestions.length}</div>
        </div>
      </header>`;
  }

  function getQuestionImage(question) {
    const image = safeImage(question.image_url);
    return image ? `<img class="question-image" src="${escape(image)}" alt="Question illustration">` : "";
  }

  function getOptions(question) {
    return [...(question.examination_question_options || [])]
      .sort((a, b) => String(a.option_label || "").localeCompare(String(b.option_label || "")));
  }

  function renderStudentQuestion(question, index) {
    const type = String(question.question_type || "").toLowerCase();
    const options = getOptions(question);
    let responseArea = "";

    if (["multiple_choice", "true_false"].includes(type) && options.length) {
      responseArea = `<ol class="question-options">${options.map(option =>
        `<li><strong>${escape(option.option_label || "")})</strong> ${escape(option.option_text || "")}</li>`
      ).join("")}</ol>`;
    } else if (type === "short_answer") {
      responseArea = '<div class="answer-lines"><div class="answer-line"></div><div class="answer-line"></div></div>';
    } else {
      const lines = type === "essay" ? 8 : 4;
      responseArea = `<div class="answer-lines">${Array.from({length:lines}, () => '<div class="answer-line"></div>').join("")}</div>`;
    }

    return `<article class="question">
      <div class="question-heading"><span>Question ${index + 1}</span><span>[${number(question.marks)} mark(s)]</span></div>
      <div class="question-text">${escape(question.question_text || "")}</div>
      ${getQuestionImage(question)}
      ${responseArea}
    </article>`;
  }

  function correctAnswerText(question) {
    const type = String(question.question_type || "").toLowerCase();
    const options = getOptions(question);
    if (["multiple_choice", "true_false"].includes(type)) {
      const correct = options.filter(option => option.is_correct);
      if (correct.length) return correct.map(option => `${option.option_label || ""}) ${option.option_text || ""}`).join("; ");
    }
    return String(question.correct_answer || "").trim();
  }

  function renderSchemeQuestion(question, index) {
    const answer = correctAnswerText(question);
    const explanation = String(question.explanation || "").trim();
    const answerBlock = answer
      ? `<div><span class="scheme-label">Expected answer</span><br>${escape(answer)}</div>`
      : '<div><span class="scheme-label">Marking guidance</span><br>Requires teacher assessment using the question and allocated marks.</div>';
    return `<article class="question">
      <div class="question-heading"><span>Question ${index + 1}</span><span>[${number(question.marks)} mark(s)]</span></div>
      <div class="question-text">${escape(question.question_text || "")}</div>
      ${getQuestionImage(question)}
      <div class="scheme-answer">${answerBlock}${explanation ? `<p><strong>Explanation:</strong> ${escape(explanation)}</p>` : ""}</div>
    </article>`;
  }

  function renderPaper(mode) {
    if (!activeExam || !activeQuestions.length) return;
    const isScheme = mode === "scheme";
    const instructions = String(activeExam.instructions || "").trim();
    const questionHtml = activeQuestions.map((question, index) =>
      isScheme ? renderSchemeQuestion(question, index) : renderStudentQuestion(question, index)
    ).join("");

    printArea.innerHTML = `<article class="exam-paper ${isScheme ? "marking-scheme" : "student-paper"}">
      ${isScheme ? '<div class="confidential-banner">CONFIDENTIAL — TEACHER’S MARKING SCHEME</div>' : ""}
      ${getHeader()}
      ${!isScheme ? `<div class="student-fields"><div><strong>Student name:</strong></div><div><strong>Student number:</strong></div></div>` : ""}
      ${!isScheme && instructions ? `<section class="instructions"><h3>Instructions to candidates</h3><div>${escape(instructions).replace(/\n/g, "<br>")}</div></section>` : ""}
      ${questionHtml}
      <footer class="paper-end">${isScheme ? "END OF CONFIDENTIAL MARKING SCHEME" : "END OF EXAMINATION PAPER"}</footer>
    </article>`;

    $("previewMode").textContent = isScheme ? "Confidential marking scheme" : "Student examination paper";
  }

  function printAsPdf(mode) {
    if (!activeExam || !activeQuestions.length) {
      showMessage("Select an examination that contains questions first.", "error");
      return;
    }
    renderPaper(mode);
    // Allow the browser to finish rendering images and text before opening print.
    window.requestAnimationFrame(() => window.print());
  }

  examSelect.addEventListener("change", loadSelectedExam);
  $("refreshExams").addEventListener("click", loadExaminations);
  $("previewBtn").addEventListener("click", () => {
    if (!activeExam || !activeQuestions.length) {
      showMessage("Select an examination with questions first.", "error");
      return;
    }
    renderPaper("student");
  });
  $("studentPdfBtn").addEventListener("click", () => printAsPdf("student"));
  $("schemePdfBtn").addEventListener("click", () => printAsPdf("scheme"));
  $("schoolName").addEventListener("input", () => {
    if (activeExam && activeQuestions.length) renderPaper("student");
  });
  $("logoUrl").addEventListener("change", () => {
    if (activeExam && activeQuestions.length) renderPaper("student");
  });

  window.addEventListener("afterprint", () => {
    if (activeExam && activeQuestions.length) renderPaper("student");
  });

  loadExaminations();
})();
