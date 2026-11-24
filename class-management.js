(() => {
  "use strict";
  const URL = "https://otjybdiyoqnsynjbofuj.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc";
  const forms = ["Form 1", "Form 2", "Form 3", "Form 4"];
  const $ = id => document.getElementById(id);
  const key = () => sessionStorage.getItem("crestAdminKey") || "";
  async function rpc(name,args) {
    const res = await fetch(URL + "/rest/v1/rpc/" + name, {
      method:"POST",
      headers:{"Content-Type":"application/json",apikey:KEY,Authorization:"Bearer "+KEY},
      body:JSON.stringify(args || {})
    });
    const raw=await res.text(); let data=null;
    try{data=raw?JSON.parse(raw):null;}catch(_){}
    if(!res.ok) throw new Error(data?.message || data?.details || "Request failed ("+res.status+").");
    return data;
  }
  function notice(message,good=true) {
    const n=$("crestClassNotice"); if(!n)return;
    n.textContent=message;n.style.display="block";
    n.className="status-msg "+(good?"success":"danger");
  }
  async function load() {
    const root=$("crestClassRoster"); if(!root)return;
    root.innerHTML='<p style="color:var(--text-muted)">Loading student register…</p>';
    try {
      const rows=await rpc("admin_students",{p_key:key()}) || [];
      if(!rows.length){root.innerHTML='<p style="color:var(--text-muted)">No student accounts have been created yet.</p>';return;}
      root.textContent="";
      rows.forEach(student=>{
        const row=document.createElement("div");
        row.style.cssText="display:grid;grid-template-columns:minmax(150px,1fr) minmax(120px,180px) auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--border-color);border-radius:12px;";
        const who=document.createElement("div");
        const name=document.createElement("strong");name.textContent=student.name || "Student";
        const phone=document.createElement("small");phone.textContent=student.phone || "";phone.style.cssText="display:block;color:var(--text-muted);margin-top:3px";
        who.append(name,phone);
        const select=document.createElement("select");
        forms.forEach(form=>{const op=document.createElement("option");op.value=form;op.textContent=form;select.appendChild(op);});
        if(student.form && forms.includes(student.form))select.value=student.form;
        const save=document.createElement("button");save.type="button";save.className="mini-btn blue";save.textContent="Save class";
        save.addEventListener("click",async()=>{
          save.disabled=true;
          try{await rpc("admin_set_student_form",{p_key:key(),p_phone:student.phone,p_form:select.value});notice(student.name+" is now assigned to "+select.value+".");}
          catch(e){notice(e.message,false);}
          finally{save.disabled=false;}
        });
        row.append(who,select,save);root.appendChild(row);
      });
    } catch(e){root.innerHTML='<p style="color:#f87171">Could not load students: '+String(e.message).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</p>';}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load);else load();
})();