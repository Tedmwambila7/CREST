(async function () {
  "use strict";
  const E = window.CREST_EXAM;
  const form = document.getElementById("examForm");
  const msg = document.getElementById("message");
  const submit = form.querySelector('button[type="submit"]');

  try {
    await E.requireTeacher();
  } catch (error) {
    E.message(msg, error.message || String(error), "error");
    submit.disabled = true;
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    const subject = String(f.get("subject") || "").trim();
    const duration = Number(f.get("duration"));
    const maxAttempts = Number(f.get("maxAttempts") || 1);
    const accessType = String(f.get("accessType") || "code");
    const startRaw = String(f.get("startsAt") || "");
    const endRaw = String(f.get("endsAt") || "");
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;

    if (!title || !subject) return E.message(msg, "Enter an examination title and subject.", "error");
    if (!Number.isInteger(duration) || duration < 1 || duration > 600)
      return E.message(msg, "Duration must be between 1 and 600 minutes.", "error");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
      return E.message(msg, "Maximum attempts must be between 1 and 10.", "error");
    if (startDate && Number.isNaN(startDate.getTime()))
      return E.message(msg, "The start date is invalid.", "error");
    if (endDate && Number.isNaN(endDate.getTime()))
      return E.message(msg, "The end date is invalid.", "error");
    if (startDate && endDate && endDate <= startDate)
      return E.message(msg, "End time must be after start time.", "error");

    submit.disabled = true;
    E.message(msg, "Creating examination...", "info");
    try {
      const result = await E.rpc("crest_teacher_create_exam", {
        p_title: title,
        p_subject: subject,
        p_instructions: String(f.get("instructions") || "").trim(),
        p_duration_minutes: duration,
        p_max_attempts: maxAttempts,
        p_access_type: accessType,
        p_starts_at: startDate ? startDate.toISOString() : null,
        p_ends_at: endDate ? endDate.toISOString() : null
      });
      const id = typeof result === "string" ? result : result && result.id;
      if (!id) throw new Error("The server did not return an examination ID.");
      location.href = "questions.html?exam=" + encodeURIComponent(id);
    } catch (error) {
      E.message(msg, error.message || String(error), "error");
      submit.disabled = false;
    }
  });
})();
