(async function(){
 const list=document.getElementById("examList"), msg=document.getElementById("message");
 const E=window.CREST_EXAM;
 async function load(){
  try{
   await E.requireTeacher();
   const {data,error}=await E.getClient().from("examinations")
    .select("id,title,subject,status,access_code,duration_minutes,starts_at,ends_at,created_at")
    .order("created_at",{ascending:false});
   if(error) throw error;
   if(!data.length){list.textContent="No examinations have been created yet.";return;}
   list.innerHTML=data.map(x=>`<article class="exam-item">
    <h3>${E.escape(x.title)}</h3><p>${E.escape(x.subject)} · ${x.duration_minutes} minutes</p>
    <p>Status: <b>${E.escape(x.status)}</b> · Access code: ${E.escape(x.access_code||"Open access")}</p>
    <p class="muted">Starts: ${E.escape(E.formatDate(x.starts_at))} | Ends: ${E.escape(E.formatDate(x.ends_at))}</p>
    <a class="button" href="questions.html?exam=${encodeURIComponent(x.id)}">Manage questions</a>
    <a class="button secondary" href="results.html?exam=${encodeURIComponent(x.id)}">View results</a>
   </article>`).join("");
  }catch(e){E.message(msg,e.message||String(e),"error");list.textContent="Could not load examinations."}
 }
 document.getElementById("refreshBtn").addEventListener("click",load); await load();
})();
