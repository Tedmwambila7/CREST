/* CREST Examination — create examination */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const form = document.getElementById("examForm");
  const message = document.getElementById("message");
  const button = document.getElementById("createExamBtn");
  const subjectSelect = document.getElementById("subjectId");
  const subjectInput = document.getElementById("subject");

  if (!E || !form) return;

  async function loadSubjects() {
    const { data, error } = await E.getClient()
      .from("exam_subjects")
      .select("id,subject_name,subject_code")
      .order("subject_name", { ascending: true });

    if (error) {
      console.warn("Subject list could not be loaded:", error.message);
      return;
    }

    (data || []).forEach(subject => {
      const option = document.createElement("option");
      option.value = subject.id;
      option.textContent = subject.subject_code
        ? `${subject.subject_name} (${subject.subject_code})`
        : subject.subject_name;
      option.dataset.name = subject.subject_name;
      subjectSelect.appendChild(option);
    });
  }

  subjectSelect.addEventListener("change", () => {
    const selected = subjectSelect.selectedOptions[0];
    if (selected?.dataset.name) subjectInput.value = selected.dataset.name;
  });

  async function initialise() {
    try {
      await E.requireTeacher();
      await loadSubjects();
    } catch (error) {
      E.message(message, error.message || String(error), "error");
      button.disabled = true;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const values = new FormData(form);
    const title = String(values.get("title") || "").trim();
    const subject = String(values.get("subject") || "").trim();
    const duration = Number(values.get("duration"));
    const totalMarks = Number(values.get("totalMarks"));
    const passMark = Number(values.get("passMark"));
    const startRaw = values.get("startTime");
    const endRaw = values.get("endsAt");

    if (!title || !subject) {
      E.message(message, "Enter the examination title and subject.", "error");
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
      E.message(message, "Duration must be between 1 and 600 minutes.", "error");
      return;
    }
    if (!Number.isFinite(totalMarks) || totalMarks < 0) {
      E.message(message, "Enter a valid total mark.", "error");
      return;
    }
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      E.message(message, "Pass mark must be between 0 and 100 percent.", "error");
      return;
    }

    const start = startRaw ? new Date(startRaw).toISOString() : null;
    const end = endRaw ? new Date(endRaw).toISOString() : null;

    if (start && end && new Date(end) <= new Date(start)) {
      E.message(message, "The end time must be later than the start time.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Creating...";
    E.message(message, "Creating your examination...", "info");

    try {
      const result = await E.rpc("crest_teacher_create_examination_v2", {
        p_title: title,
        p_subject: subject,
        p_subject_id: values.get("subjectId") || null,
        p_duration_minutes: duration,
        p_total_marks: totalMarks,
        p_pass_mark: passMark,
        p_instructions: String(values.get("instructions") || "").trim() || null,
        p_start_time: start,
        p_ends_at: end
      });

      const examId = typeof result === "string" ? result : result?.id;
      if (!examId) throw new Error("The database did not return an examination ID.");

      E.message(message, "Examination created. Opening Question Management...", "success");
      window.location.href = `questions.html?exam=${encodeURIComponent(examId)}`;
    } catch (error) {
      console.error("Create examination:", error);
      E.message(message, error.message || String(error), "error");
      button.disabled = false;
      button.textContent = "Create examination";
    }
  });

  initialise();
})();
