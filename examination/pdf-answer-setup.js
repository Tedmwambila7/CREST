/* CREST PDF-only examination answer sheet configuration */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  if (!E || !$("createPdfAnswerSheet")) return;
  const button = $("createPdfAnswerSheet");
  const status = (text, type="info") => E.message($("pdfAnswerSetupStatus"), text, type);

  function parseKey(raw) {
    const key = new Map();
    String(raw || "").split(/\r?\n/).forEach(line => {
      const match = line.trim().match(/^(\d{1,3})\s*[:=.)-]?\s*([A-D])$/i);
      if (match) key.set(Number(match[1]), match[2].toUpperCase());
    });
    return key;
  }

  button.addEventListener("click", async () => {
    const examId = $("examSelect")?.value;
    const count = Number($("pdfQuestionCount").value);
    const marks = Number($("pdfQuestionMarks").value);
    if (!examId) return status("Select an examination first.", "error");
    if (!Number.isInteger(count) || count < 1 || count > 200) return status("Enter between 1 and 200 questions.", "error");
    if (!Number.isFinite(marks) || marks <= 0 || marks > 100) return status("Enter valid marks per question.", "error");

    button.disabled = true;
    button.textContent = "Creating answer sheet...";
    try {
      await E.requireTeacher();
      const existing = await E.rpc("crest_teacher_questions_list", { p_exam_id: examId }) || [];
      const generated = existing.filter(q => /^PDF ANSWER SHEET QUESTION \d+$/i.test(String(q.question_text || "")));
      const other = existing.filter(q => !/^PDF ANSWER SHEET QUESTION \d+$/i.test(String(q.question_text || "")));
      if (other.length) {
        throw new Error("This examination already contains regular questions. Use a separate examination for a PDF-only answer sheet so existing questions are not overwritten.");
      }
      if (generated.length && !confirm("This will update the existing PDF answer sheet questions. Continue?")) return;

      const answerKey = parseKey($("pdfAnswerKey").value);
      const byNumber = new Map(generated.map(q => [Number(q.question_number), q]));
      for (let number = 1; number <= count; number++) {
        const correct = answerKey.get(number) || null;
        const options = ["A","B","C","D"].map(label => ({
          label, text: "Option " + label, is_correct: correct === label
        }));
        await E.rpc("crest_teacher_save_question", {
          p_question_id: byNumber.get(number)?.id || null,
          p_exam_id: examId,
          p_question_text: "PDF ANSWER SHEET QUESTION " + number,
          p_question_type: "multiple_choice",
          p_marks: marks,
          p_question_number: number,
          p_options: options,
          p_correct_answer: correct,
          p_image_url: null,
          p_is_required: true
        });
      }
      for (const old of generated) {
        if (Number(old.question_number) > count) {
          await E.rpc("crest_teacher_delete_question", { p_question_id: old.id, p_exam_id: examId });
        }
      }
      const keyed = [...answerKey.keys()].filter(n => n >= 1 && n <= count).length;
      status("PDF answer sheet ready: " + count + " questions, " + marks + " mark(s) each. " +
        (keyed ? keyed + " answer(s) in the automatic marking key; " : "No automatic answer key supplied; ") +
        "students' selections will be sent to MARK PAPERS.", "success");
      if (window.CREST_EXAM_REFRESH_QUESTIONS) await window.CREST_EXAM_REFRESH_QUESTIONS();
    } catch (error) {
      status(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "Create / update PDF answer sheet";
    }
  });
})();
