(async function(){
 const E=window.CREST_EXAM,msg=document.getElementById("message"),form=document.getElementById("accessForm");
 const access=document.getElementById("accessCard"),examCard=document.getElementById("examCard"),done=document.getElementById("doneCard");
 let attemptId=null,deadline=null,tick=null;
 function showError(e){E.message(msg,e.message||String(e),"error")}
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();
  const token=E.getStudentSessionToken();
  if(!token){showError(new Error("Your CREST student session was not found. Sign in on the main CREST website, then return here. If you are already signed in, connect getStudentSessionToken() in exam.js to the session token used by your login."));return}
  try{
   const code=new FormData(form).get("code").trim();
   const started=await E.rpc("crest_student_start_exam",{p_session_token:token,p_access_code:code||null});
   attemptId=started.attempt_id;deadline=new Date(started.deadline).getTime();
   document.getElementById("examTitle").textContent=started.title;
   document.getElementById("examInstructions").textContent=started.instructions||"Read each question carefully.";
   const qs=await E.rpc("crest_student_get_questions",{p_session_token:token,p_attempt_id:attemptId});
   document.getElementById("questions").innerHTML=qs.map((q,i)=>`<article class="question-item" data-qid="${E.escape(q.id)}">
    <h3>Question ${q.question_number} (${q.marks} marks)</h3><p>${E.escape(q.question_text)}</p>
    ${["A","B","C","D"].map(letter=>`<label class="option"><input type="radio" name="q_${E.escape(q.id)}" value="${letter}"><span><b>${letter}.</b> ${E.escape(q["option_"+letter.toLowerCase()])}</span></label>`).join("")}
    </article>`).join("");
   access.classList.add("hidden");examCard.classList.remove("hidden");
   document.getElementById("submitBtn").addEventListener("click",()=>submit(false),{once:true});
   tick=setInterval(updateTimer,1000);updateTimer();
  }catch(e){showError(e)}
 });
 async function saveAll(){
  const token=E.getStudentSessionToken();
  const cards=[...document.querySelectorAll("[data-qid]")];
  for(const card of cards){
   const chosen=card.querySelector("input:checked");
   await E.rpc("crest_student_save_answer",{p_session_token:token,p_attempt_id:attemptId,
    p_question_id:card.dataset.qid,p_selected_answer:chosen?chosen.value:null});
  }
 }
 async function submit(auto){
  const btn=document.getElementById("submitBtn");btn.disabled=true;
  try{
   await saveAll();
   const result=await E.rpc("crest_student_submit_exam",{p_session_token:E.getStudentSessionToken(),p_attempt_id:attemptId});
   clearInterval(tick);examCard.classList.add("hidden");done.classList.remove("hidden");
   document.getElementById("doneText").textContent=auto?"Time ended. Your answers were submitted.":"Your answers have been submitted. Your score is "+result.marks_obtained+" out of "+result.total_marks+" ("+Number(result.percentage).toFixed(1)+"%).";
  }catch(e){btn.disabled=false;alert(e.message||String(e))}
 }
 function updateTimer(){
  const left=Math.max(0,deadline-Date.now()),s=Math.floor(left/1000);
  document.getElementById("timer").textContent="Time remaining: "+String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
  if(left<=0){clearInterval(tick);submit(true)}
 }
})();
