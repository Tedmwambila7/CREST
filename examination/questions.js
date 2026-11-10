
/* =========================================================
   CREST EXAMINATION — QUESTION MANAGEMENT
   Uses existing exam.js and Supabase connection.
   ========================================================= */

(() => {
  "use strict";

  const E = window.CREST_EXAM;

  if (!E || typeof E.getClient !== "function") {
    alert("CREST connection error. Check that exam.js loads first.");
    return;
  }

  const client = E.getClient();
  const $ = id => document.getElementById(id);

  const examSelect = $("examSelect");
  const form = $("questionForm");
  const optionsContainer = $("optionsContainer");
  const optionsSection = $("optionsSection");
  const questionList = $("questionList");

  let currentExamId = null;
  let savedQuestions = [];
  let optionCounter = 0;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function showMessage(message, type = "success") {
    const element = $("pageMessage");
    element.textContent = message;
    element.className = type === "error"
      ? "message-error"
      : "message-success";
  }

  function setBusy(busy) {
    $("saveQuestion").disabled = busy;
    $("saveQuestion").textContent = busy
      ? "Saving..."
      : "Save question";
  }

  function addOption(label = "", text = "", correct = false) {
    optionCounter++;

    const row = document.createElement("div");
    row.className = "option-row";
    row.dataset.option = String(optionCounter);

    row.innerHTML = `
      <label>
        <input type="radio" name="correctOption"
          class="correct-radio" ${correct ? "checked" : ""}>
        Correct
      </label>
      <input class="option-text" type="text"
        placeholder="Option text" value="${escapeHTML(text)}"
        required>
      <button type="button" class="remove-option">
        Remove
      </button>
    `;

    row.querySelector(".remove-option").addEventListener("click", () => {
      row.remove();
      renumberOptions();
    });

    optionsContainer.appendChild(row);

    if (label) {
      row.dataset.label = label;
    }

    renumberOptions();
  }

  function renumberOptions() {
    [...optionsContainer.children].forEach((row, index) => {
      row.dataset.label = String.fromCharCode(65 + index);
      row.querySelector("label").lastChild.textContent =
        " Correct (" + row.dataset.label + ")";
    });
  }

  function getOptions() {
    return [...optionsContainer.children].map(row => ({
      label: row.dataset.label,
      text: row.querySelector(".option-text").value.trim(),
      is_correct: row.querySelector(".correct-radio").checked
    }));
  }

  function resetOptions(type = "multiple_choice") {
    optionsContainer.innerHTML = "";
    optionCounter = 0;

    if (type === "true_false") {
      addOption("A", "True", true);
      addOption("B", "False", false);
    } else if (type === "multiple_choice") {
      addOption("A", "", true);
      addOption("B", "", false);
      addOption("C", "", false);
      addOption("D", "", false);
    }
  }

  function updateTypeDisplay() {
    const type = $("questionType").value;
    const needsOptions =
      type === "multiple_choice" || type === "true_false";

    optionsSection.hidden = !needsOptions;

    if (type === "true_false") {
      const existing = getOptions();
      if (
        existing.length !== 2 ||
        !existing.some(o => o.text === "True") ||
        !existing.some(o => o.text === "False")
      ) {
        resetOptions("true_false");
      }
    } else if (type === "multiple_choice" &&
               optionsContainer.children.length < 2) {
      resetOptions("multiple_choice");
    }
  }

  function clearForm() {
    form.reset();
    $("questionId").value = "";
    $("formHeading").textContent = "Add a question";
    $("questionMarks").value = "1";
    $("questionOrder").value = String(savedQuestions.length + 1);
    $("saveQuestion").textContent = "Save question";
    $("correctAnswer").value = "";
    $("explanation").value = "";
    $("imageUrl").value = "";
    $("questionType").value = "multiple_choice";
    resetOptions("multiple_choice");
    updateTypeDisplay();
  }

  async function loadExaminations() {
    examSelect.innerHTML = '<option value="">Loading examinations...</option>';

    const { data, error } = await client
      .from("examinations")
      .select("id,title,status,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    examSelect.innerHTML = '<option value="">Select an examination</option>';

    (data || []).forEach(exam => {
      const option = document.createElement("option");
      option.value = exam.id;
      option.textContent = `${exam.title} (${exam.status || "draft"})`;
      examSelect.appendChild(option);
    });

    const requestedExam = new URLSearchParams(location.search).get("exam");

    if (requestedExam && (data || []).some(e => e.id === requestedExam)) {
      examSelect.value = requestedExam;
      currentExamId = requestedExam;
      await loadQuestions();
    } else if ((data || []).length === 1) {
      examSelect.value = data[0].id;
      currentExamId = data[0].id;
      await loadQuestions();
    } else {
      questionList.textContent = "Select an examination to view its questions.";
    }
  }

  async function loadQuestions() {
    currentExamId = examSelect.value;

    if (!currentExamId) {
      savedQuestions = [];
      questionList.textContent = "Select an examination to view its questions.";
      $("questionCount").textContent = "0 questions";
      return;
    }

    questionList.textContent = "Loading questions...";

    const { data, error } = await client
      .from("examination_questions")
      .select(`
        id,
        examination_id,
        question_text,
        question_type,
        marks,
        question_order,
        correct_answer,
        explanation,
        image_url,
        examination_question_options (
          id,
          option_label,
          option_text,
          is_correct
        )
      `)
      .eq("examination_id", currentExamId)
      .order("question_order", { ascending: true });

    if (error) {
      questionList.textContent = "Could not load questions.";
      showMessage(error.message, "error");
      return;
    }

    savedQuestions = data || [];
    renderQuestions();
    clearForm();
  }

  function renderQuestions() {
    $("questionCount").textContent =
      `${savedQuestions.length} question${savedQuestions.length === 1 ? "" : "s"}`;

    if (!savedQuestions.length) {
      questionList.innerHTML = "<p>No questions have been added to this examination yet.</p>";
      return;
    }

    questionList.innerHTML = savedQuestions.map((question, index) => {
      const options = question.examination_question_options || [];

      const optionHTML = options.length
        ? `<ol class="question-options">
            ${options.map(option => `
              <li class="${option.is_correct ? "correct-option" : ""}">
                ${escapeHTML(option.option_label)}.
                ${escapeHTML(option.option_text)}
                ${option.is_correct ? " ✓ Correct answer" : ""}
              </li>
            `).join("")}
          </ol>`
        : "";

      const imageHTML = question.image_url
        ? `<img class="question-image"
             src="${escapeHTML(question.image_url)}"
             alt="Question image" loading="lazy">`
        : "";

      return `
        <article class="question-item">
          <h3>Question ${index + 1}: ${escapeHTML(question.question_text)}</h3>
          <div class="question-meta">
            Type: ${escapeHTML(question.question_type.replaceAll("_", " "))}
            | Marks: ${escapeHTML(question.marks)}
            | Order: ${escapeHTML(question.question_order)}
          </div>
          ${optionHTML}
          ${question.correct_answer
            ? `<p><strong>Expected answer / marking guide:</strong>
                ${escapeHTML(question.correct_answer)}</p>`
            : ""}
          ${question.explanation
            ? `<p><strong>Explanation:</strong>
                ${escapeHTML(question.explanation)}</p>`
            : ""}
          ${imageHTML}
          <div class="question-actions">
            <button type="button" data-edit="${question.id}">
              Edit
            </button>
            <button type="button" class="delete-btn"
              data-delete="${question.id}">
              Delete
            </button>
          </div>
        </article>
      `;
    }).join("");

    questionList.querySelectorAll("[data-edit]").forEach(button => {
      button.addEventListener("click", () => {
        editQuestion(button.dataset.edit);
      });
    });

    questionList.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", () => {
        deleteQuestion(button.dataset.delete);
      });
    });
  }

  function editQuestion(id) {
    const question = savedQuestions.find(item => item.id === id);
    if (!question) return;

    $("questionId").value = question.id;
    $("questionText").value = question.question_text || "";
    $("questionType").value = question.question_type || "multiple_choice";
    $("questionMarks").value = question.marks ?? 1;
    $("questionOrder").value = question.question_order ?? 1;
    $("correctAnswer").value = question.correct_answer || "";
    $("explanation").value = question.explanation || "";
    $("imageUrl").value = question.image_url || "";
    $("formHeading").textContent = "Edit question";

    optionsContainer.innerHTML = "";
    optionCounter = 0;

    (question.examination_question_options || [])
      .sort((a, b) => a.option_label.localeCompare(b.option_label))
      .forEach(option => {
        addOption(option.option_label, option.option_text, option.is_correct);
      });

    updateTypeDisplay();
    $("questionEditor").scrollIntoView({ behavior: "smooth" });
  }

  async function saveQuestion(event) {
    event.preventDefault();

    if (!currentExamId) {
      showMessage("Select an examination first.", "error");
      return;
    }

    const type = $("questionType").value;
    const options = getOptions();
    const needsOptions =
      type === "multiple_choice" || type === "true_false";

    if (needsOptions) {
      if (options.length < 2 || options.some(o => !o.text)) {
        showMessage("Enter at least two complete answer options.", "error");
        return;
      }

      if (options.filter(o => o.is_correct).length !== 1) {
        showMessage("Select exactly one correct answer option.", "error");
        return;
      }
    }

    const marks = Number($("questionMarks").value);
    const order = Number($("questionOrder").value);

    if (!Number.isFinite(marks) || marks <= 0 ||
        !Number.isInteger(order) || order < 1) {
      showMessage("Enter valid marks and question number.", "error");
      return;
    }

    const payload = {
      p_question_id: $("questionId").value || null,
      p_exam_id: currentExamId,
      p_question_text: $("questionText").value.trim(),
      p_question_type: type,
      p_marks: marks,
      p_question_order: order,
      p_correct_answer: $("correctAnswer").value.trim() || null,
      p_explanation: $("explanation").value.trim() || null,
      p_image_url: $("imageUrl").value.trim() || null,
      p_options: needsOptions ? options : []
    };

    setBusy(true);
    showMessage("Saving question...");

    const { data, error } = await client.rpc(
      "crest_exam_save_question",
      payload
    );

    setBusy(false);

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    showMessage("Question saved successfully.");
    clearForm();
    await loadQuestions();
  }

  async function deleteQuestion(id) {
    const question = savedQuestions.find(item => item.id === id);
    if (!question) return;

    if (!confirm("Delete this question and its answer options?")) return;

    showMessage("Deleting question...");

    const { error } = await client.rpc(
      "crest_exam_delete_question",
      { p_question_id: id }
    );

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    showMessage("Question deleted successfully.");
    await loadQuestions();
  }

  async function initialise() {
    try {
      await E.requireTeacher();
      resetOptions("multiple_choice");

      $("questionType").addEventListener("change", updateTypeDisplay);
      $("addOption").addEventListener("click", () => addOption());
      $("cancelEdit").addEventListener("click", clearForm);
      $("refreshQuestions").addEventListener("click", loadQuestions);
      examSelect.addEventListener("change", loadQuestions);
      form.addEventListener("submit", saveQuestion);

      await loadExaminations();
    } catch (error) {
      showMessage(error.message || "Could not initialise question management.", "error");
    }
  }

  initialise();
})();



   
