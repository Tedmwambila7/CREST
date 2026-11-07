(async function(){
 const E=window.CREST_EXAM,msg=document.getElementById("message"),out=document.getElementById("results");
 try{
  await E.requireTeacher();
  const examId=new URLSearchParams(location.search).get("exam");
  let query=E.getClient().from("exam_results").select("id,student_id,examination_id,total_marks,marks_obtained,percentage,grade,released_at,created_at").order("created_at",{ascending:false});
  if(examId)query=query.eq("examination_id",examId);
  const {data,error}=await query;if(error)throw error;
  if(!data.length){out.textContent="No submitted results are available yet.";return}
  out.innerHTML=`<table><thead><tr><th>Student ID</th><th>Marks</th><th>Total</th><th>Percentage</th><th>Grade</th><th>Date</th></tr></thead><tbody>${
   data.map(r=>`<tr><td>${E.escape(r.student_id)}</td><td>${r.marks_obtained}</td><td>${r.total_marks}</td><td>${Number(r.percentage).toFixed(1)}%</td><td>${E.escape(r.grade||"—")}</td><td>${E.escape(E.formatDate(r.created_at))}</td></tr>`).join("")
  }</tbody></table>`;
 }catch(e){E.message(msg,e.message||String(e),"error");out.textContent="Could not load results."}
})();
