(async function(){
 const form=document.getElementById("examForm"),msg=document.getElementById("message"),E=window.CREST_EXAM;
 try{await E.requireTeacher()}catch(e){E.message(msg,e.message,"error");form.querySelector("button").disabled=true;return}
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();const f=new FormData(form);
  const start=f.get("startsAt")?new Date(f.get("startsAt")).toISOString():null;
  const end=f.get("endsAt")?new Date(f.get("endsAt")).toISOString():null;
  if(start&&end&&new Date(end)<=new Date(start)){E.message(msg,"End time must be after start time.","error");return}
  const payload={p_title:f.get("title").trim(),p_subject:f.get("subject").trim(),
   p_instructions:f.get("instructions").trim(),p_duration_minutes:Number(f.get("duration")),
   p_max_attempts:Number(f.get("maxAttempts")||1),p_access_type:f.get("accessType"),
   p_starts_at:start,p_ends_at:end};
  const btn=form.querySelector("button");btn.disabled=true;
  try{
   const result=await E.rpc("crest_teacher_create_exam",payload);
   const id=typeof result==="string"?result:result?.id;
   if(!id)throw new Error("The server did not return an examination ID.");
   E.message(msg,"Examination created. Opening question editor...","success");
   location.href="questions.html?exam="+encodeURIComponent(id);
  }catch(e){E.message(msg,e.message||String(e),"error");btn.disabled=false}
 });
})();
