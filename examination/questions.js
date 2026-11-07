(async function () {
  "use strict";
  const E = window.CREST_EXAM;
  const examId = new URLSearchParams(location.search).get("exam");
  const form = document.getElementById("questionForm");
  const msg = document.getElementById("message");
  const list = document.getElementById("questionList");
  const publish = document.getElementById("publishBtn");
  const save = form.querySelector('button[type="submit"]');

  if (!examId) {
    E.message(msg, "Missing examination ID in the page address. Return to the dashboard and open the exam again.", "error");
    save.disabled = true;
    publish.disabled = true;
    return;
  }
  try {
    await E.requireTeacher();
  } catch (error) {
    E.message(msg, error.message || String(error), "error");
    save.disabled = true;
    publish.disabled = true;
    return;
  }

  document.getElementById("examInfo").textContent = "Examination ID: " + examId;

  async function loadQuestions() {
    list.textContent = "Loading questions...";
    const { data, error } = await E.getClient().from("questions")
      .select("id,question_number,question_text,marks")
      .eq("examination_id", examId).order("question_number", { ascending: true });
    if (error) throw error;
    list.innerHTML = data && data.length ? data.map(q => `
      <article class="question-item"><b>Q${Number(q.question_number)}.</b> ${E.escape(q.question_text)}
      <span class="muted">(${Number(q.marks)} marks)</span></article>`).join("") : "No questions added yet.";
  }

  try { await loadQuestions(); }
  catch (error) { E.message(msg, error.message || String(error), "error"); }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const f = new FormData(form);
    const number = Number(f.get("number"));
    const marks = Number(f.get("marks"));
    const question = String(f.get("question") || "").trim();
    const options = ["a", "b", "c", "d"].map(k => String(f.get(k) || "").trim());
    if (!Number.isInteger(number) || number < 1) return E.message(msg, "Enter a valid question number.", "error");
    if (!question || options.some(x => !x)) return E.message(msg, "Enter the question and all four answer options.", "error");
    if (!Number.isInteger(marks) || marks < 1) return E.message(msg, "Marks must be a whole number greater than zero.", "error");

    save.disabled = true;
    try {
      await E.rpc("crest_teacher_add_mcq", {
        p_exam_id: examId,
        p_question_number: number,
        p_question_text: question,
        p_option_a: options[0], p_option_b: options[1],
        p_option_c: options[2], p_option_d: options[3],
        p_correct_answer: String(f.get("correct")),
        p_marks: marks,
        p_explanation: String(f.get("explanation") || "").trim()
      });
      E.message(msg, "Question and answer key saved securely.", "success");
      form.reset();
      form.elements.marks.value = 1;
      await loadQuestions();
    } catch (error) {
      E.message(msg, error.message || String(error), "error");
    } finally {
      save.disabled = false;
    }
  });

  publish.addEventListener("click", async () => {
    if (!confirm("Publish this examination? Students may access it according to its schedule.")) return;
    publish.disabled = true;
    try {
      const code = await E.rpc("crest_teacher_publish_exam", { p_exam_id: examId });
      E.message(msg, "Examination published. Access code: " + (code || "Open access"), "success");
    } catch (error) {
      E.message(msg, error.message || String(error), "error");
    } finally {
      publish.disabled = false;
    }
  });
})();
