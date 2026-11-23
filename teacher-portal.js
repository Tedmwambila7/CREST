(() => {
  "use strict";
  const URL = "https://otjybdiyoqnsynjbofuj.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc";
  const CLOUD_URL = "https://api.cloudinary.com/v1_1/dfrnpdnld/auto/upload";
  const CLOUD_PRESET = "taydayo";
  const SESSION_KEY = "crestTeacherSession";
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeUrl = value => /^https:\/\//i.test(value || "") ? value : "";
  async function rpc(name, args) {
    const response = await fetch(URL + "/rest/v1/rpc/" + name, {
      method:"POST", headers:{"Content-Type":"application/json",apikey:KEY,Authorization:"Bearer "+KEY},
      body:JSON.stringify(args || {})
    });
    const body = await response.text(); let data = null;
    try { data = body ? JSON.parse(body) : null; } catch (_) {}
    if (!response.ok) throw new Error((data && (data.message || data.details)) || "Request failed ("+response.status+").");
    return data;
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function setMessage(id, message, error) {
    const node=$(id); if(!node)return;
    node.textContent=message || ""; node.style.color=error ? "#fca5a5" : "#6ee7b7";
  }
  async function upload(file) {
    const form = new FormData(); form.append("file",file,file.name || "crest-lesson");
    form.append("upload_preset",CLOUD_PRESET);
    const response=await fetch(CLOUD_URL,{method:"POST",body:form});
    if(!response.ok) throw new Error("File upload failed ("+response.status+").");
    const data=await response.json();
    if(!data.secure_url) throw new Error("Cloud storage did not return a secure file link.");
    return data.secure_url;
  }

  const loginForm=$("teacherLoginForm");
  if(loginForm) {
    loginForm.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=$("teacherLoginButton"); button.disabled=true;
      setMessage("teacherLoginMessage","Signing in…",false);
      try {
        const result=await rpc("teacher_login",{p_email:$("teacherEmail").value.trim(),p_password:$("teacherPassword").value});
        if(!result || !result.token) throw new Error("Email or password is incorrect, or this teacher account is inactive.");
        localStorage.setItem(SESSION_KEY,JSON.stringify(result));
        location.href="teacher-dashboard.html";
      } catch(error) { setMessage("teacherLoginMessage",error.message,true); }
      finally { button.disabled=false; }
    });
  }

  const dashboard=$("teacherDashboard");
  if(!dashboard)return;
  let teacher=null, recordedBlob=null, recorder=null, recorderStream=null, recorderParts=[];
  const session=getSession();
  const token=session && session.token;
  if(!token){ location.replace("teacher-login.html"); return; }

  async function refreshDashboard() {
    const inbox=await rpc("teacher_inbox",{p_token:token});
    const submissions=await rpc("teacher_my_submissions",{p_token:token});
    renderInbox(Array.isArray(inbox)?inbox:[]);
    renderSubmissions(Array.isArray(submissions)?submissions:[]);
  }
  function attachmentLinks(payload) {
    let links=[];
    if(safeUrl(payload.fileUrl)) links.push({url:payload.fileUrl,name:payload.fileName || "Attachment"});
    if(safeUrl(payload.document)) links.push({url:payload.document,name:"Document"});
    if(safeUrl(payload.audio)) links.push({url:payload.audio,name:"Audio"});
    if(safeUrl(payload.video)) links.push({url:payload.video,name:"Video"});
    if(Array.isArray(payload.attachments)) payload.attachments.forEach((f,i)=>{if(safeUrl(f.fileUrl))links.push({url:f.fileUrl,name:f.fileName || ("Attachment "+(i+1))});});
    return links;
  }
  function renderInbox(items) {
    const root=$("teacherInbox"); root.innerHTML="";
    if(!items.length){root.innerHTML='<div class="empty">No student work or questions have been forwarded to you yet.</div>';return;}
    items.forEach(item=>{
      const p=item.payload || {}, card=document.createElement("article"); card.className="queue-card";
      const title=document.createElement("h3"); title.textContent=item.title || (item.item_type==="question"?"Student question":"Student assignment"); card.appendChild(title);
      const meta=document.createElement("div"); meta.className="meta"; meta.textContent=(item.item_type==="question"?"QUESTION": "ASSIGNMENT SUBMISSION")+" · "+(item.subject || "General")+" · "+new Date(item.created_at).toLocaleString(); card.appendChild(meta);
      const body=document.createElement("div"); body.className="bodytext";
      body.textContent=item.item_type==="question" ? (p.message || p.text || "Student sent a question or attachment.") : ("Assignment: "+(p.assignmentTitle || item.title || "Student assignment")+"\nInstructions: "+(p.assignmentDescription || p.description || "See the assignment details.")+"\nStudent note: "+(p.note || p.answer || "No written note."));
      card.appendChild(body);
      const files=attachmentLinks(p);
      files.forEach(f=>{const a=document.createElement("a");a.className="filelink";a.href=f.url;a.target="_blank";a.rel="noopener";a.textContent="↗ "+f.name;card.appendChild(a);});
      const phone=document.createElement("div");phone.className="meta";phone.style.marginTop="10px";phone.textContent="Student: "+(p.name || "Student")+" · "+(item.submitter_phone || "Phone not available");card.appendChild(phone);
      const form=document.createElement("form");form.dataset.parentId=item.id;form.style.marginTop="12px";
      if(item.item_type==="question"){
        form.dataset.formType="response";
        form.innerHTML='<label>Your answer (sent to Admin for approval first)</label><textarea name="response" required placeholder="Write your answer to the student…"></textarea><button class="btn" type="submit">Send answer to Admin</button>';
      } else {
        form.dataset.formType="mark";
        form.innerHTML='<div class="row"><div><label>Marks awarded</label><input name="score" type="number" min="0" step="0.5" required></div><div><label>Total marks</label><input name="out_of" type="number" min="0.5" step="0.5" required></div></div><div class="row"><div><label>Grade (optional)</label><input name="grade" placeholder="A"></div><div><label>Feedback (optional)</label><input name="remarks" placeholder="Good work…"></div></div><button class="btn" type="submit">Submit marking to Admin</button>';
      }
      card.appendChild(form); root.appendChild(card);
    });
  }
  function renderSubmissions(items) {
    const root=$("teacherSubmissions"); root.innerHTML="";
    if(!items.length){root.innerHTML='<div class="empty">You have not submitted any lessons or assignments yet.</div>';return;}
    items.forEach(item=>{
      const card=document.createElement("article");card.className="queue-card";
      const h=document.createElement("h3");h.textContent=item.title || "Untitled";card.appendChild(h);
      const m=document.createElement("div");m.className="meta";m.textContent=(item.item_type || "").replace("_"," ").toUpperCase()+" · "+new Date(item.created_at).toLocaleString();card.appendChild(m);
      const s=document.createElement("span");s.className="status";s.textContent=(item.status || "pending").replaceAll("_"," ");card.appendChild(s);
      if(item.review_note){const n=document.createElement("div");n.className="bodytext";n.style.marginTop="8px";n.textContent="Admin note: "+item.review_note;card.appendChild(n);}
      root.appendChild(card);
    });
  }
  async function init() {
    try {
      teacher=await rpc("teacher_me",{p_token:token});
      if(!teacher || !teacher.id) throw new Error("Your teacher session has expired.");
      $("teacherName").textContent=teacher.name || "Teacher";
      $("teacherIdentity").textContent=(teacher.email || "")+(teacher.subject ? " · "+teacher.subject : "");
      await refreshDashboard();
      setInterval(()=>{if(document.visibilityState==="visible")refreshDashboard().catch(console.warn);},30000);
    } catch(error) {
      localStorage.removeItem(SESSION_KEY);
      alert(error.message || "Please sign in again.");
      location.replace("teacher-login.html");
    }
  }

  $("teacherLogout")?.addEventListener("click",async()=>{
    try{await rpc("teacher_logout",{p_token:token});}catch(_){}
    localStorage.removeItem(SESSION_KEY);location.replace("teacher-login.html");
  });

  $("lessonForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    setMessage("lessonMessage","Uploading lesson and sending it for approval…",false);
    try{
      const fd=new FormData(form);let file=fd.get("file"),url=String(fd.get("file_url")||"").trim(),name="",type="",size=null;
      if(recordedBlob && (!file || !file.size)){file=new File([recordedBlob],"recorded-lesson-"+Date.now()+".webm",{type:recordedBlob.type || "audio/webm"});}
      if(file && file.size){url=await upload(file);name=file.name;type=file.type || "application/octet-stream";size=file.size;}
      if(!safeUrl(url))throw new Error("Choose a lesson file, record audio, or enter a secure HTTPS link.");
      const selectedType=String(fd.get("material_type")||"lesson");
      const itemType=(recordedBlob && (!file || !file.size)) || (file && file.size && String(file.type||"").startsWith("audio/")) ? "voice_lesson" : (file && file.size && String(file.type||"").startsWith("video/")) ? "video_lesson" : selectedType;
      if((itemType==="voice_lesson" || itemType==="video_lesson") && !String(fd.get("topic")||"").trim())throw new Error("Enter the topic for this audio or video lesson.");
      await rpc("teacher_submit_material",{p_token:token,p_item_type:itemType,p_payload:{
        title:String(fd.get("title")||"").trim(),subject:String(fd.get("subject")||"").trim(),
        level:String(fd.get("level")||"Junior"),topic:String(fd.get("topic")||"").trim(),
        file_url:url,file_name:name || url.split("/").pop() || "Lesson material",
        file_type:type || "application/octet-stream",file_size:size
      }});
      form.reset();recordedBlob=null;setMessage("recordStatus","");setMessage("lessonMessage","Lesson submitted. It will appear to students after Admin approval.",false);await refreshDashboard();
    }catch(error){setMessage("lessonMessage",error.message,true);}
    finally{button.disabled=false;}
  });

  $("assignmentForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    setMessage("assignmentMessage","Preparing assignment for administrator review…",false);
    try{
      const fd=new FormData(form);let file=fd.get("file"),fileUrl="",fileName="",fileType="",fileSize=null;
      if(file && file.size){fileUrl=await upload(file);fileName=file.name;fileType=file.type || "application/octet-stream";fileSize=file.size;}
      await rpc("teacher_submit_material",{p_token:token,p_item_type:"assignment",p_payload:{
        title:String(fd.get("title")||"").trim(),subject:String(fd.get("subject")||"").trim(),
        description:String(fd.get("description")||"").trim(),due:String(fd.get("due")||""),
        fileUrl:fileUrl,fileName:fileName,fileType:fileType,fileSize:fileSize,to:"all"
      }});
      form.reset();setMessage("assignmentMessage","Assignment sent to Admin. Students will see it after approval.",false);await refreshDashboard();
    }catch(error){setMessage("assignmentMessage",error.message,true);}
    finally{button.disabled=false;}
  });

  $("teacherInbox")?.addEventListener("submit",async event=>{
    const form=event.target.closest("form[data-form-type]");if(!form)return;event.preventDefault();
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      if(form.dataset.formType==="response"){
        await rpc("teacher_submit_response",{p_token:token,p_parent_id:form.dataset.parentId,p_response:form.elements.response.value.trim()});
      }else{
        await rpc("teacher_submit_mark",{p_token:token,p_parent_id:form.dataset.parentId,
          p_score:Number(form.elements.score.value),p_out_of:Number(form.elements.out_of.value),
          p_grade:form.elements.grade.value.trim(),p_remarks:form.elements.remarks.value.trim()});
      }
      await refreshDashboard();
      alert("Submitted to the administrator. The student will receive it after approval.");
    }catch(error){alert(error.message || "Could not submit. Please try again.");button.disabled=false;}
  });

  $("recordLesson")?.addEventListener("click",async()=>{
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){setMessage("recordStatus","Audio recording is not supported in this browser.",true);return;}
    try{
      recorderStream=await navigator.mediaDevices.getUserMedia({audio:true});recorderParts=[];
      const mime=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(x=>MediaRecorder.isTypeSupported(x));
      recorder=mime?new MediaRecorder(recorderStream,{mimeType:mime}):new MediaRecorder(recorderStream);
      recorder.ondataavailable=e=>{if(e.data && e.data.size)recorderParts.push(e.data);};
      recorder.onstop=()=>{recordedBlob=new Blob(recorderParts,{type:recorder.mimeType || "audio/webm"});recorderStream?.getTracks().forEach(t=>t.stop());recorderStream=null;$("recordLesson").disabled=false;$("stopLesson").disabled=true;setMessage("recordStatus","Audio recording ready. Submit the lesson to upload it.",false);};
      recorder.start();$("recordLesson").disabled=true;$("stopLesson").disabled=false;setMessage("recordStatus","Recording… Press Stop recording when finished.",false);
    }catch(error){setMessage("recordStatus",error.message || "Microphone access was not granted.",true);}
  });
  $("stopLesson")?.addEventListener("click",()=>{if(recorder && recorder.state==="recording")recorder.stop();});
  init();
})();