/* =========================================================
   CREST EXAMINATION — QUESTION MANAGEMENT
   Uses examination_questions and examination_question_options.
   ========================================================= */
(() => {
  "use strict";

  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);

  if (!E || typeof E.getClient !== "function") {
    alert("CREST connection error. Check that exam.js loads first.");
    return;
  }

  const client = E.getClient();
  const form = $("questionForm");
  const examSelect = $("examSelect");
  const optionsSection = $("optionsSection");
  const optionsContainer = $("optionsContainer");
  const questionList = $("questionList");
  const saveButton = $("saveQuestion");

  let currentExamId = null;
  let savedQuestions = [];
  let loading = false;
  let saving = false;

  const escape = value => E.escape(value ?? "");

  function showMessage(text, type = "info") {
    E.message($("pageMessage"), text, type);
  }

  function optionRows() {
    return [...optionsContainer.querySelectorAll(".option-row")];
  }

  function renumberOptions() {
    optionRows().forEach((row, index) => {
      const label = String.fromCharCode(65 + index);
      row.dataset.label = label;
      row.querySelector(".option-label").textContent = `Option ${label}`;
    });
  }

  function addOption(text = "", correct = false) {
    const row = document.createElement("div");
    row.className = "option-row";
    row.innerHTML = `
      <label class="correct-choice">
        <input type="radio" name="correctOption" class="correct-radio">
        <span class="option-label">Option</span>
        <span class="correct-caption">Correct answer</span>
      </label>
      <input class="option-text" type="text" maxlength="1000"
        placeholder="Enter answer option" required>
      <button type="button" class="remove-option" aria-label="Remove this option">Remove</button>
    `;

    row.querySelector(".option-text").value = text;
    row.querySelector(".correct-radio").checked = Boolean(correct);
    row.querySelector(".remove-option").addEventListener("click", () => {
      row.remove();
      renumberOptions();
    });

    optionsContainer.appendChild(row);
    renumberOptions();
  }

  function resetOptions(type) {
    optionsContainer.replaceChildren();

    if (type === "true_false") {
      addOption("True", true);
      addOption("False", false);
    } else if (type === "multiple_choice") {
      addOption("", true);
      addOption("");
      addOption("");
      addOption("");
    }
    updateTypeDisplay();
  }

  function updateTypeDisplay() {
    const type = $("questionType").value;
    const needsOptions = ["multiple_choice", "true_false"].includes(type);

    optionsSection.hidden = !needsOptions;
    optionsContainer.querySelectorAll("input").forEach(input => {
      input.disabled = !needsOptions;
      input.required = needsOptions && input.classList.contains("option-text");
    });
    $("addOption").hidden = type !== "multiple_choice";

    if (type === "true_false") {
      const rows = optionRows();
      const valid = rows.length === 2 &&
        rows[0].querySelector(".option-text").value.trim().toLowerCase() === "true" &&
        rows[1].querySelector(".option-text").value.trim().toLowerCase() === "false";
      if (!valid) resetOptions("true_false");
    } else if (type === "multiple_choice" && optionRows().length < 2) {
      resetOptions("multiple_choice");
    }
  }

  function getOptions() {
    return optionRows().map(row => ({
      label: row.dataset.label,
      text: row.querySelector(".option-text").value.trim(),
      is_correct: row.querySelector(".correct-radio").checked
    }));
  }

  function clearForm() {
    form.reset();
    $("questionId").value = "";
    $("formHeading").textContent = "Add a question";
    $("questionMarks").value = "1";
    $("questionOrder").value = String(savedQuestions.length + 1);
    $("questionType").value = "multiple_choice";
    saveButton.textContent = "Save question";
    resetOptions("multiple_choice");
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
      option.textContent = `${exam.title} — ${exam.status || "draft"}`;
      examSelect.appendChild(option);
    });

    if (!data?.length) {
      showMessage("No examinations are available to this account yet.", "info");
      questionList.textContent = "Create an examination first, then return here to add questions.";
      return;
    }

    const requestedId = new URLSearchParams(window.location.search).get("exam");
    const requestedExists = requestedId && data.some(exam => exam.id === requestedId);

    if (requestedExists) {
      examSelect.value = requestedId;
    } else if (data.length === 1) {
      examSelect.value = data[0].id;
    }

    if (examSelect.value) await loadQuestions();
    else questionList.textContent = "Choose an examination above to see its questions.";
  }

  async function loadQuestions() {
    if (loading) return;
    currentExamId = examSelect.value;

    if (!currentExamId) {
      savedQuestions = [];
      $("questionCount").textContent = "0 questions";
      questionList.textContent = "Choose an examination above to see its questions.";
      clearForm();
      return;
    }

    loading = true;
    questionList.textContent = "Loading questions...";

    try {
      const { data, error } = await client
        .from("examination_questions")
        .select(`
          id, examination_id, question_text, question_type, marks,
          question_order, correct_answer, explanation, image_url,
          examination_question_options (
            id, option_label, option_text, is_correct
          )
        `)
        .eq("examination_id", currentExamId)
        .order("question_order", { ascending: true });

      if (error) throw error;
      savedQuestions = data || [];
      renderQuestions();
      clearForm();
      showMessage(`${savedQuestions.length} question(s) loaded.`, "success");
    } catch (error) {
      questionList.textContent = "Questions could not be loaded.";
      showMessage(error.message || String(error), "error");
    } finally {
      loading = false;
    }
  }

  function renderQuestions() {
    $("questionCount").textContent =
      `${savedQuestions.length} question${savedQuestions.length === 1 ? "" : "s"}`;

    if (!savedQuestions.length) {
      questionList.innerHTML = `
        <div class="empty-state">
          <h3>No questions added yet</h3>
          <p>Use the form above to create the first question for this examination.</p>
        </div>`;
      return;
    }

    questionList.innerHTML = savedQuestions.map((question, index) => {
      const options = [...(question.examination_question_options || [])]
        .sort((a, b) => a.option_label.localeCompare(b.option_label));

      const optionMarkup = options.length ? `
        <ol class="question-options">
          ${options.map(option => `
            <li class="${option.is_correct ? "correct-option" : ""}">
              <strong>${escape(option.option_label)}.</strong>
              ${escape(option.option_text)}
              ${option.is_correct ? '<span class="correct-tag">Correct</span>' : ""}
            </li>
          `).join("")}
        </ol>` : "";

      const imageMarkup = safeImageUrl(question.image_url)
        ? `<img class="question-image" src="${escape(question.image_url)}"
             alt="Illustration for question ${index + 1}" loading="lazy">`
        : "";

      return `
        <article class="question-item">
          <div class="question-item-heading">
            <h3>Question ${escape(question.question_order ?? index + 1)}</h3>
            <span class="marks-badge">${escape(question.marks)} marks</span>
          </div>
          <p class="question-prompt">${escape(question.question_text)}</p>
          <p class="question-meta">${escape(String(question.question_type || "").replaceAll("_", " "))}</p>
          ${optionMarkup}
          ${question.correct_answer ? `<p><strong>Expected answer / marking guide:</strong> ${escape(question.correct_answer)}</p>` : ""}
          ${question.explanation ? `<p><strong>Explanation:</strong> ${escape(question.explanation)}</p>` : ""}
          ${imageMarkup}
          <div class="question-actions">
            <button type="button" data-edit="${escape(question.id)}">Edit question</button>
            <button type="button" class="danger" data-delete="${escape(question.id)}">Delete question</button>
          </div>
        </article>`;
    }).join("");

    questionList.querySelectorAll("[data-edit]").forEach(button => {
      button.addEventListener("click", () => editQuestion(button.dataset.edit));
    });
    questionList.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", () => deleteQuestion(button.dataset.delete));
    });
  }

  function safeImageUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value, window.location.href);
      return ["https:", "http:"].includes(url.protocol);
    } catch (_) {
      return false;
    }
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
    saveButton.textContent = "Update question";

    optionsContainer.replaceChildren();
    const options = [...(question.examination_question_options || [])]
      .sort((a, b) => a.option_label.localeCompare(b.option_label));
    options.forEach(option => addOption(
      option.option_text,
      option.is_correct
    ));

    updateTypeDisplay();
    $("questionEditor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveQuestion(event) {
    event.preventDefault();
    if (saving) return;

    if (!currentExamId) {
      showMessage("Select an examination first.", "error");
      return;
    }

    const type = $("questionType").value;
    const needsOptions = ["multiple_choice", "true_false"].includes(type);
    const options = needsOptions ? getOptions() : [];

    if (needsOptions) {
      if (options.length < 2 || options.some(option => !option.text)) {
        showMessage("Enter at least two complete answer options.", "error");
        return;
      }
      if (options.filter(option => option.is_correct).length !== 1) {
        showMessage("Select exactly one correct answer option.", "error");
        return;
      }
      if (type === "true_false" &&
          (options.length !== 2 ||
           options[0].text.toLowerCase() !== "true" ||
           options[1].text.toLowerCase() !== "false")) {
        showMessage("True/False questions must have True and False options.", "error");
        return;
      }
    }

    const marks = Number($("questionMarks").value);
    const order = Number($("questionOrder").value);
    if (!Number.isFinite(marks) || marks <= 0 ||
        !Number.isInteger(order) || order < 1) {
      showMessage("Enter valid marks and a whole-number question order.", "error");
      return;
    }

    const imageUrl = $("imageUrl").value.trim();
    if (imageUrl && !safeImageUrl(imageUrl)) {
      showMessage("The image URL must use http:// or https://.", "error");
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
      p_image_url: imageUrl || null,
      p_options: options
    };

    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    showMessage("Saving question...", "info");

    try {
      const { error } = await client.rpc("crest_exam_save_question", payload);
      if (error) throw error;

      showMessage("Question saved successfully. Examination total marks have been updated.", "success");
      await loadQuestions();
    } catch (error) {
      showMessage(error.message || String(error), "error");
    } finally {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = $("questionId").value ? "Update question" : "Save question";
    }
  }

  async function deleteQuestion(id) {
    const question = savedQuestions.find(item => item.id === id);
    if (!question) return;

    if (!window.confirm("Delete this question? Questions with existing student answers are protected.")) {
      return;
    }

    showMessage("Deleting question...", "info");
    try {
      const { error } = await client.rpc("crest_exam_delete_question", {
        p_question_id: id
      });
      if (error) throw error;
      showMessage("Question deleted.", "success");
      await loadQuestions();
    } catch (error) {
      showMessage(error.message || String(error), "error");
    }
  }

  async function initialise() {
    try {
      await E.requireTeacher();
      $("questionType").addEventListener("change", () => {
        const type = $("questionType").value;
        const rows = optionRows();
        const isTrueFalsePair = rows.length === 2 &&
          rows[0].querySelector(".option-text").value.trim().toLowerCase() === "true" &&
          rows[1].querySelector(".option-text").value.trim().toLowerCase() === "false";

        if (type === "true_false") {
          resetOptions("true_false");
        } else if (type === "multiple_choice" &&
                   (rows.length < 2 || isTrueFalsePair)) {
          resetOptions("multiple_choice");
        } else {
          updateTypeDisplay();
        }
      });
      $("addOption").addEventListener("click", () => addOption());
      $("cancelEdit").addEventListener("click", clearForm);
      $("refreshQuestions").addEventListener("click", loadQuestions);
      examSelect.addEventListener("change", loadQuestions);
      form.addEventListener("submit", saveQuestion);
      resetOptions("multiple_choice");
      await loadExaminations();
    } catch (error) {
      showMessage(error.message || String(error), "error");
      questionList.textContent = "Question Management could not be initialised.";
    }
  }

  initialise();
})();
