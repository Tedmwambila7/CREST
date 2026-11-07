(async function(){
 const E=window.CREST_EXAM, params=new URLSearchParams(location.search),examId=params.get("exam");
 const form=document.getElementById("questionForm"),msg=document.getElementById("message"),list=document.getElementById("questionList");
 if(!examId){E.message(msg,"Missing examination ID in the page address.","error");form.querySelector("button").disabled=true;return}
 try{await E.requireTeacher()}catch(e){E.message(msg,e.message,"error");form.querySelector("button").disabled=true;return}
 document.getElementById("examInfo").textContent="Examination ID: "+examId;
 async function load(){
  const {data,error}=await E.getClient().from("questions").select("id,question_number,question_text,marks")
   .eq("examination_id",examId).order("question_number");
  if(error)throw error;
  list.innerHTML=data.length?data.map(q=>`<article class="question-item"><b>Q${q.question_number}.</b> ${E.escape(q.question_text)} <span class="muted">(${q.marks} marks)</span></article>`).join(""):"No questions added yet.";
 }
 await load();
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();const f=new FormData(form);
  const p={p_exam_id:examId,p_question_number:Number(f.get("number")),p_question_text:f.get("question").trim(),
   p_option_a:f.get("a").trim(),p_option_b:f.get("b").trim(),p_option_c:f.get("c").trim(),p_option_d:f.get("d").trim(),
   p_correct_answer:f.get("correct"),p_marks:Number(f.get("marks")),p_explanation:f.get("explanation").trim()};
  try{await E.rpc("crest_teacher_add_mcq",p);E.message(msg,"Question and answer key saved.","success");form.reset();form.elements.marks.value=1;await load()}
  catch(e){E.message(msg,e.message||String(e),"error")}
 });
 document.getElementById("publishBtn").addEventListener("click",async()=>{
  if(!confirm("Publish this examination? Students may be able to access it according to its schedule."))return;
  try{const code=await E.rpc("crest_teacher_publish_exam",{p_exam_id:examId});E.message(msg,"Examination published. Access code: "+(code||"Open access"),"success")}
  catch(e){E.message(msg,e.message||String(e),"error")}
 });
})();
