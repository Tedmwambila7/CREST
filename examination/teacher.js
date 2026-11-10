
/* CREST EXAMINATION — TEACHER DASHBOARD MASTER */

(async function () {
  "use strict";

  const E = window.CREST_EXAM;
  const list = document.getElementById("examList");
  const msg = document.getElementById("message");
  const refresh = document.getElementById("refreshBtn");

  if (!E || !list || !msg) {
    console.error("CREST Examination connection missing.");
    return;
  }

  const client = E.getClient();

  async function load() {
    list.textContent = "Loading examinations...";
    msg.textContent = "";

    try {
      await E.requireTeacher();

      const { data, error } = await client
        .from("examinations")
        .select(`
          id,
          title,
          subject,
          subject_id,
          status,
          duration_minutes,
          total_marks,
          start_time,
          scheduled_at,
          ends_at,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        list.textContent = "No examinations have been created yet.";
        return;
      }

      list.innerHTML = data.map(x => `
        <article class="exam-item">
          <h3>${E.escape(x.title)}</h3>

          <p>
            ${E.escape(x.subject || "Subject not specified")}
            · ${x.duration_minutes} minutes
          </p>

          <p>
            Total marks: ${x.total_marks ?? 0}
          </p>

          <p>
            Status: <b>${E.escape(x.status)}</b>
          </p>

          <p class="muted">
            Starts: ${E.escape(
              E.formatDate(x.scheduled_at || x.start_time)
            )}
          </p>

          <p class="muted">
            Ends: ${E.escape(E.formatDate(x.ends_at))}
          </p>

          <a class="button"
             href="questions.html?exam=${encodeURIComponent(x.id)}">
             Manage questions
          </a>

          <a class="button secondary"
             href="results.html?exam=${encodeURIComponent(x.id)}">
             View results
          </a>
        </article>
      `).join("");

    } catch (e) {
      E.message(msg, e.message || String(e), "error");
      list.textContent = "Could not load examinations.";
      console.error(e);
    }
  }

  refresh.addEventListener("click", load);

  await load();

})();
