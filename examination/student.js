/* CREST STUDENT PORTAL — current examination_questions delivery model */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  const msg = $("message"), access = $("accessCard"), examCard = $("examCard"), done = $("doneCard");
  const form = $("accessForm");
  let token = "", attemptId = null, deadline = 0, timer = null, saving = false;

  function message(text, type="info") { E.message(msg, text, type); }
  function safeUrl(value) {
    try { const u = new URL(value, location.href); return ["https:","http:"].includes(u.protocol) ? u.href : ""; }
    catch (_) { return ""; }
  }

  async function loadAvailableExams() {
    try {
      message("Verifying your CREST student session...");
      token = await E.getExamSessionToken();
      message("Loading available examinations...");
      const exams = await E.rpc("crest_online_list_exams_v2", {p_session_token:token});
      const select = $("examSelect");
      select.innerHTML = '<option value="">Choose an examination</option>';
      (exams || []).forEach(exam => {
        const option = document.createElement("option");
        option.value = exam.id;
        option.textContent = `${exam.title} — ${exam.subject || "General"} (${exam.duration_minutes} min)`;
        select.appendChild(option);
      });
      if (!exams?.length) message("There are currently no published examinations available to you.","info");
      else message(`${exams.length} examination(s) available. Select one and begin.`,"success");
    } catch (error) { message(error.message || String(error),"error"); }
  }

  function renderQuestions(questions) {
    const host = $("questions");
    host.replaceChildren();
    questions.forEach((q, index) => {
      const article = document.createElement("article");
      article.className = "question-item";
      article.dataset.qid = q.id;
      const heading = document.createElement("h3");
      heading.textContent = `Question ${q.question_order || index+1} (${q.marks} marks)`;
      const prompt = document.createElement("p");
      prompt.textContent = q.question_text || "";
      article.append(heading,prompt);
      const image = safeUrl(q.image_url);
      if (image) { const img=document.createElement("img"); img.src=image; img.alt="Question illustration"; img.loading="lazy"; img.style.maxWidth="100%"; article.append(img); }
      if (Array.isArray(q.options) && q.options.length) {
        q.options.forEach(option => {
          const label=document.createElement("label"); label.className="option";
          const input=document.createElement("input"); input.type="radio"; input.name=`q_${q.id}`; input.value=option.id;
          const span=document.createElement("span"); span.textContent=`${option.label}. ${option.text}`;
          label.append(input,span); article.append(label);
          input.addEventListener("change",()=>saveAnswer(article));
        });
      } else {
        const field=document.createElement(q.question_type === "essay" ? "textarea" : "input");
        field.dataset.answerText="true"; field.placeholder=q.question_type === "essay" ? "Write your answer here..." : "Enter your answer...";
        if (field.tagName === "TEXTAREA") field.rows=5;
        field.maxLength=20000; field.addEventListener("change",()=>saveAnswer(article));
        article.append(field);
      }
      host.append(article);
    });
  }

  async function saveAnswer(card) {
    if (!attemptId || saving) return;
    const chosen=card.querySelector("input[type=radio]:checked");
    const text=card.querySelector("[data-answer-text]");
    try {
      await E.rpc("crest_online_save_answer_v2", {
        p_session_token:token,p_attempt_id:attemptId,p_question_id:card.dataset.qid,
        p_selected_option_id:chosen ? chosen.value : null,
        p_answer_text:text ? text.value : null
      });
    } catch (error) { message(`Answer could not be saved: ${error.message || error}`,"error"); }
  }

  async function startExam(event) {
    event.preventDefault();
    const examId=$("examSelect").value;
    if (!examId) { message("Select an examination first.","error"); return; }
    const btn=$("startExamBtn"); btn.disabled=true;
    try {
      const started=await E.rpc("crest_online_start_exam_v2",{p_session_token:token,p_exam_id:examId});
      attemptId=started.attempt_id; deadline=new Date(started.deadline).getTime();
      $("examTitle").textContent=started.title;
      $("examInstructions").textContent=started.instructions || "Read each question carefully. Your answers are saved as you work.";
      const questions=await E.rpc("crest_online_get_questions_v2",{p_session_token:token,p_attempt_id:attemptId});
      renderQuestions(questions || []);
      access.classList.add("hidden"); examCard.classList.remove("hidden");
      $("submitBtn").disabled=false; timer=setInterval(updateTimer,1000); updateTimer();
      message("");
    } catch (error) { message(error.message || String(error),"error"); btn.disabled=false; }
  }

  async function submitExam() {
    const btn=$("submitBtn"); if (btn.disabled) return;
    btn.disabled=true;
    try {
      for (const card of document.querySelectorAll("[data-qid]")) await saveAnswer(card);
      const result=await E.rpc("crest_online_submit_exam_v2",{p_session_token:token,p_attempt_id:attemptId});
      clearInterval(timer); examCard.classList.add("hidden"); done.classList.remove("hidden");
      const percent=Number(result.percentage || 0).toFixed(1);
      $("doneText").textContent = result.status === "pending review"
        ? `Your answers have been submitted. Automatically marked: ${result.automatic_marks} out of ${result.total_marks} (${percent}%). Written answers are awaiting teacher marking.`
        : `Your examination has been submitted and automatically marked. Score: ${result.automatic_marks} out of ${result.total_marks} (${percent}%).`;
    } catch (error) { btn.disabled=false; message(error.message || String(error),"error"); }
  }

  function updateTimer() {
    const remaining=Math.max(0,deadline-Date.now()),seconds=Math.floor(remaining/1000);
    $("timer").textContent=`Time remaining: ${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
    if (remaining<=0) { clearInterval(timer); submitExam(); }
  }

  form.addEventListener("submit",startExam);
  $("submitBtn").addEventListener("click",submitExam);
  $("reloadExams").addEventListener("click",loadAvailableExams);
  loadAvailableExams();
})();
