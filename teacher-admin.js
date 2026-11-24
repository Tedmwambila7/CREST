(() => {
  "use strict";
  const URL = "https://otjybdiyoqnsynjbofuj.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc";
  const $ = id => document.getElementById(id);
  const adminKey = () => sessionStorage.getItem("crestAdminKey") || "";
  async function rpc(name, args) {
    const response = await fetch(URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {"Content-Type":"application/json", apikey:KEY, Authorization:"Bearer "+KEY},
      body: JSON.stringify(args || {})
    });
    const raw = await response.text(); let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (!response.ok) throw new Error((data && (data.message || data.details)) || "Request failed (" + response.status + ").");
    return data;
  }
  function message(id, value, isError) {
    const node = $(id); if (!node) return;
    node.textContent = value || "";
    node.style.color = isError ? "#fca5a5" : "#6ee7b7";
  }
  let started = false, teachers = [];

  function install() {
    if (started || document.body.classList.contains("locked") || !adminKey()) return;
    started = true;
    const section = document.createElement("section");
    section.id = "crestTeacherApprovalCentre";
    section.style.cssText = "display:grid;gap:18px;margin:0 0 36px;";
    section.innerHTML =
      '<style>' +
      '#crestTeacherApprovalCentre .ta-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.2fr);gap:18px}' +
      '#crestTeacherApprovalCentre .ta-card{background:#0b112c;border:1px solid rgba(56,189,248,.18);border-radius:18px;padding:22px;min-width:0}' +
      '#crestTeacherApprovalCentre h2{font-size:17px;color:#fff;margin:0 0 7px}' +
      '#crestTeacherApprovalCentre p{font-size:12px;color:#94a3b8;line-height:1.6;margin:0 0 15px}' +
      '#crestTeacherApprovalCentre label{display:block;font-size:11px;color:#7dd3fc;font-weight:700;margin:10px 0 5px}' +
      '#crestTeacherApprovalCentre input,#crestTeacherApprovalCentre select{width:100%;padding:10px 12px;background:#12193d;border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font:inherit;font-size:12px}' +
      '#crestTeacherApprovalCentre button{border:0;border-radius:9px;padding:9px 12px;background:#0ea5e9;color:#06111f;font-weight:800;font-size:11px;cursor:pointer}' +
      '#crestTeacherApprovalCentre button.secondary{background:#172b49;color:#dbeafe;border:1px solid #36516f}' +
      '#crestTeacherApprovalCentre button.danger{background:#7f1d1d;color:#fee2e2}' +
      '#crestTeacherApprovalCentre .ta-list{display:grid;gap:10px}' +
      '#crestTeacherApprovalCentre .ta-item{background:#080e23;border:1px solid rgba(255,255,255,.08);border-radius:13px;padding:14px}' +
      '#crestTeacherApprovalCentre .ta-meta{font-size:10px;color:#7dd3fc;font-weight:700;margin:5px 0 9px}' +
      '#crestTeacherApprovalCentre .ta-body{font-size:12px;color:#cbd5e1;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}' +
      '#crestTeacherApprovalCentre .ta-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '#crestTeacherApprovalCentre .ta-actions select{max-width:240px}' +
      '#crestTeacherApprovalCentre .ta-empty{padding:18px;border:1px dashed #36516f;border-radius:12px;color:#94a3b8;font-size:12px;text-align:center}' +
      '@media(max-width:850px){#crestTeacherApprovalCentre .ta-grid{grid-template-columns:1fr}}' +
      '</style>' +
      '<div class="ta-grid">' +
      '<section class="ta-card"><h2>Add a Teacher</h2><p>Create a teacher account. Give the teacher their email and temporary password.</p>' +
      '<form id="taCreateForm"><label>Teacher full name</label><input name="full_name" required minlength="3" placeholder="Full name">' +
      '<label>Email address</label><input name="email" type="email" required placeholder="teacher@example.com">' +
      '<label>Assigned subjects (select one or more)</label><select name="subjects" multiple required size="5"><option>Biology</option><option>Chemistry</option><option>Physics</option><option>Mathematics</option><option>English</option><option>Chichewa</option><option>Agriculture</option><option>Geography</option><option>History</option><option>Computer Studies</option><option>Business Studies</option><option>Life Skills</option></select><label>Assigned forms (select one or more)</label><select name="forms" multiple required size="4"><option>Form 1</option><option>Form 2</option><option>Form 3</option><option>Form 4</option></select>' +
      '<label>Temporary password</label><input name="password" type="password" minlength="8" required placeholder="At least 8 characters">' +
      '<button type="submit" style="width:100%;margin-top:14px">Create teacher account</button></form><div id="taCreateNotice" style="font-size:11px;margin-top:10px"></div></section>' +
      '<section class="ta-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>Teacher Accounts</h2><button type="button" class="secondary" id="taRefreshTeachers">Refresh</button></div>' +
      '<p>Activate or deactivate teacher access. Deactivated accounts cannot sign in.</p><div id="taTeachers" class="ta-list"><div class="ta-empty">Loading teachers…</div></div></section>' +
      '</div>' +
      '<section class="ta-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2>Approval Centre</h2><p>Student questions, student assignment submissions, teacher lessons, assignments and teacher responses come here first.</p></div><button type="button" class="secondary" id="taRefreshQueue">Refresh queue</button></div>' +
      '<div id="taQueue" class="ta-list"><div class="ta-empty">Loading approval queue…</div></div><div id="taQueueNotice" style="font-size:11px;margin-top:10px"></div></section>';

    const header = document.querySelector("body > header");
    if (header) header.insertAdjacentElement("afterend", section);
    else document.body.prepend(section);

    $("taCreateForm").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const values = new FormData(form);
        const result = await rpc("admin_add_teacher", {
          p_key:adminKey(), p_full_name:values.get("full_name"),
          p_email:values.get("email"), p_subject:values.get("subject"),
          p_password:values.get("password")
        });
        form.reset();
        message("taCreateNotice", result && result.message ? result.message : "Teacher account created.", false);
        await loadTeachers();
      } catch (error) { message("taCreateNotice", error.message, true); }
      finally { button.disabled = false; }
    });
    $("taRefreshTeachers").addEventListener("click", () => loadTeachers().catch(e => message("taCreateNotice",e.message,true)));
    $("taRefreshQueue").addEventListener("click", () => loadQueue().catch(e => message("taQueueNotice",e.message,true)));

    $("taTeachers").addEventListener("click", async event => {
      const reset = event.target.closest("button[data-teacher-reset]");
      if (reset) {
        const password = prompt("Enter a new temporary password (at least 8 characters):");
        if (!password) return;
        if (password.length < 8) { alert("Password must be at least 8 characters."); return; }
        reset.disabled = true;
        try {
          await rpc("admin_reset_teacher_password", {
            p_key:adminKey(), p_teacher_id:reset.dataset.teacherReset, p_password:password
          });
          alert("Password reset. The teacher must sign in again.");
        } catch (error) { alert(error.message); }
        finally { reset.disabled = false; }
        return;
      }
      const button = event.target.closest("button[data-teacher-id]");
      if (!button) return;
      button.disabled = true;
      try {
        await rpc("admin_set_teacher_active", {
          p_key:adminKey(), p_teacher_id:button.dataset.teacherId,
          p_active:button.dataset.active !== "true"
        });
        await loadTeachers();
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    });

    $("taQueue").addEventListener("click", async event => {
      const button = event.target.closest("button[data-item-action]");
      if (!button) return;
      button.disabled = true;
      const id = button.dataset.itemId, action = button.dataset.itemAction;
      try {
        let teacherId = null, target = "all", note = "";
        if (action === "forward") {
          const select = $("taTeacher-" + id); teacherId = select ? select.value : null;
          if (!teacherId) throw new Error("Choose a teacher before forwarding.");
        } else if (action === "approve") {
          const input = $("taTarget-" + id); if (input) target = input.value.trim() || "all";
        } else if (action === "reject" || action === "return") {
          note = prompt(action === "reject" ? "Reason for rejection (optional):" : "What should be corrected?") || "";
        }
        await rpc("admin_approval_action", {
          p_key:adminKey(), p_item_id:id, p_action:action,
          p_teacher_id:teacherId, p_note:note, p_target:target
        });
        message("taQueueNotice","Approval action saved.",false);
        await loadQueue();
      } catch (error) { message("taQueueNotice",error.message,true); }
      finally { button.disabled = false; }
    });

    loadTeachers().catch(e => message("taCreateNotice",e.message,true));
    loadQueue().catch(e => message("taQueueNotice",e.message,true));
  }

  async function loadTeachers() {
    teachers = await rpc("admin_teachers",{p_key:adminKey()}) || [];
    const root = $("taTeachers"); if (!root) return;
    root.textContent = "";
    if (!teachers.length) {
      const empty = document.createElement("div"); empty.className="ta-empty";
      empty.textContent="No teachers added yet. Create the first teacher using the form.";
      root.appendChild(empty); return;
    }
    teachers.forEach(teacher => {
      const row=document.createElement("div");row.className="ta-item";
      const name=document.createElement("strong");name.textContent=teacher.full_name;name.style.color="#fff";
      const info=document.createElement("div");info.className="ta-meta";info.textContent=teacher.email+" · "+((teacher.subjects||[]).join(", ")||teacher.subject||"No subject")+" · "+((teacher.forms||[]).join(", ")||"No forms assigned");
      const status=document.createElement("div");status.className="ta-meta";status.textContent=teacher.is_active?"ACTIVE":"INACTIVE";
      const button=document.createElement("button");button.className="secondary";
      button.textContent=teacher.is_active?"Deactivate":"Activate";
      button.dataset.teacherId=teacher.id;button.dataset.active=String(teacher.is_active);
      const reset=document.createElement("button");reset.className="secondary";reset.textContent="Reset password";reset.dataset.teacherReset=teacher.id;
      const actions=document.createElement("div");actions.className="ta-actions";
      const subjectSelect=document.createElement("select");subjectSelect.multiple=true;subjectSelect.size=4;subjectSelect.style.minWidth="180px";
      ["Biology","Chemistry","Physics","Mathematics","English","Chichewa","Agriculture","Geography","History","Computer Studies","Business Studies","Life Skills"].forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;o.selected=(teacher.subjects||[]).includes(v);subjectSelect.appendChild(o);});
      const formSelect=document.createElement("select");formSelect.multiple=true;formSelect.size=4;formSelect.style.minWidth="130px";
      ["Form 1","Form 2","Form 3","Form 4"].forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;o.selected=(teacher.forms||[]).includes(v);formSelect.appendChild(o);});
      const saveAssignment=document.createElement("button");saveAssignment.textContent="Save subjects & forms";saveAssignment.addEventListener("click",async()=>{saveAssignment.disabled=true;try{const subjects=Array.from(subjectSelect.selectedOptions).map(o=>o.value);const forms=Array.from(formSelect.selectedOptions).map(o=>o.value);await rpc("admin_assign_teacher",{p_key:adminKey(),p_teacher_id:teacher.id,p_subjects:subjects,p_forms:forms});await loadTeachers();}catch(e){alert(e.message);}finally{saveAssignment.disabled=false;}});
      actions.append(subjectSelect,formSelect,saveAssignment,button,reset);
      row.append(name,info,status,actions);root.appendChild(row);
    });
  }

  function detail(item) {
    const p=item.payload||{};
    if(item.item_type==="question")return p.message||p.text||"Student sent a question or attachment.";
    if(item.item_type==="assignment_submission")return "Assignment: "+(p.assignmentTitle||item.title||"Student assignment")+"\nInstructions: "+(p.assignmentDescription||"See assignment details.")+"\nStudent note: "+(p.note||p.answer||"No written note.");
    if(item.item_type==="lesson")return "Level: "+(p.level||"")+"\nTopic: "+(p.topic||"")+"\nFile: "+(p.file_name||"");
    if(item.item_type==="voice_lesson")return "Voice lesson\nTopic: "+(p.topic||"")+"\nAudio file: "+(p.file_name||"");
    if(item.item_type==="video_lesson")return "Video lesson\nTopic: "+(p.topic||"")+"\nVideo file: "+(p.file_name||"");
    if(item.item_type==="assignment")return p.description||"Teacher has prepared an assignment.";
    if(item.item_type==="teacher_response")return "Teacher response:\n"+(p.response||"");
    if(item.item_type==="assignment_mark")return "Marks: "+(p.score||"")+" / "+(p.out_of||"")+"\nGrade: "+(p.grade||"")+"\nFeedback: "+(p.remarks||"");
    return "";
  }
  function renderQueue(items) {
    const root=$("taQueue");if(!root)return;root.textContent="";
    if(!items.length){const empty=document.createElement("div");empty.className="ta-empty";empty.textContent="The approval queue is clear. New submissions will appear here.";root.appendChild(empty);return;}
    items.forEach(item=>{
      const card=document.createElement("article");card.className="ta-item";
      const title=document.createElement("strong");title.textContent=item.title||item.item_type;title.style.color="#fff";
      const meta=document.createElement("div");meta.className="ta-meta";
      meta.textContent=(item.item_type||"").replaceAll("_"," ").toUpperCase()+" · "+(item.submitter_phone||"Teacher submission")+" · "+(item.subject||"General");
      const body=document.createElement("div");body.className="ta-body";body.textContent=detail(item);
      card.append(title,meta,body);
      const payload=item.payload||{};
      const links=[];
      ["file_url","fileUrl","audio","video","document"].forEach(k=>{if(/^https:\/\//i.test(payload[k]||""))links.push(payload[k]);});
      if(Array.isArray(payload.attachments))payload.attachments.forEach(f=>{if(/^https:\/\//i.test(f.fileUrl||""))links.push(f.fileUrl);});
      links.forEach(url=>{const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.textContent="Open attachment";a.style.cssText="display:inline-block;color:#7dd3fc;font-size:11px;margin:8px 10px 0 0";card.appendChild(a);});
      const actions=document.createElement("div");actions.className="ta-actions";
      if(item.item_type==="question"||item.item_type==="assignment_submission"){
        const select=document.createElement("select");select.id="taTeacher-"+item.id;
        const first=document.createElement("option");first.value="";first.textContent="Forward to teacher…";select.appendChild(first);
        teachers.filter(t=>t.is_active).forEach(t=>{const option=document.createElement("option");option.value=t.id;option.textContent=t.full_name+" · "+t.subject;select.appendChild(option);});
        const forward=document.createElement("button");forward.textContent="Forward";forward.dataset.itemAction="forward";forward.dataset.itemId=item.id;
        actions.append(select,forward);
      }
      if(item.item_type==="assignment"){
        const target=document.createElement("input");target.id="taTarget-"+item.id;target.value="all";target.placeholder="all or student phone";target.style.maxWidth="190px";actions.appendChild(target);
      }
      if(["lesson","voice_lesson","video_lesson","assignment","teacher_response","assignment_mark"].includes(item.item_type)){
        const approve=document.createElement("button");approve.textContent=item.item_type==="lesson"||item.item_type==="assignment"?"Approve & publish":"Approve";approve.dataset.itemAction="approve";approve.dataset.itemId=item.id;actions.appendChild(approve);
      }
      ["reject","return"].forEach(action=>{
        const b=document.createElement("button");b.className=action==="reject"?"danger":"secondary";
        b.textContent=action==="reject"?"Reject":"Return for correction";b.dataset.itemAction=action;b.dataset.itemId=item.id;actions.appendChild(b);
      });
      card.appendChild(actions);root.appendChild(card);
    });
  }
  async function loadQueue() {
    const items=await rpc("admin_approval_list",{p_key:adminKey()})||[];
    renderQueue(Array.isArray(items)?items:[]);
  }
  async function boot() {
    if(started || document.body.classList.contains("locked") || !adminKey())return;
    try { const ok=await rpc("admin_check",{p_key:adminKey()});if(!ok)return;install(); }
    catch (_) {}
  }
  const observer=new MutationObserver(boot);
  observer.observe(document.body,{attributes:true,attributeFilter:["class"]});
  boot();
})();