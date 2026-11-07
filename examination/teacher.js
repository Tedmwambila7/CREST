(async function () {
  "use strict";
  const E = window.CREST_EXAM;
  const list = document.getElementById("examList");
  const msg = document.getElementById("message");
  const refresh = document.getElementById("refreshBtn");

  async function load() {
    refresh.disabled = true;
    list.textContent = "Loading examinations...";
    E.message(msg, "");
    try {
      await E.requireTeacher();
      const { data, error } = await E.getClient().from("examinations")
        .select("id,title,subject,status,access_code,duration_minutes,starts_at,ends_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        list.textContent = "No examinations have been created yet.";
        return;
      }
      list.innerHTML = data.map(x => `
        <article class="exam-item">
          <h3>${E.escape(x.title)}</h3>
          <p>${E.escape(x.subject)} · ${Number(x.duration_minutes)} minutes</p>
          <p>Status: <b>${E.escape(x.status)}</b> · Access code: <b>${E.escape(x.access_code || "Open access")}</b></p>
          <p class="muted">Starts: ${E.escape(E.formatDate(x.starts_at))} | Ends: ${E.escape(E.formatDate(x.ends_at))}</p>
          <a class="button" href="questions.html?exam=${encodeURIComponent(x.id)}">Manage questions</a>
          <a class="button secondary" href="results.html?exam=${encodeURIComponent(x.id)}">View results</a>
        </article>`).join("");
    } catch (error) {
      E.message(msg, error.message || String(error), "error");
      list.textContent = "Could not load examinations.";
    } finally {
      refresh.disabled = false;
    }
  }

  refresh.addEventListener("click", load);
  await load();
})();
