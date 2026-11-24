/* CREST Academy admin dashboard navigation and overview */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 function targetFor(key){
  const map={
   exams:'crestExamSubmissions', timetable:'crestTimetableAdmin', work:'workSection',
   teachers:'crestTeacherApprovalCentre', students:'partModal', chat:'adminChatMessagesLog',
   voice:'crestVoiceLessonAdmin', video:'crestVideoLessonAdmin'
  };
  if(key==='resources'){const n=$('bookTitle');return n?n.closest('.admin-grid'):null;}
  if(key==='students')return $('partModal');
  if(key==='chat'){const n=$('adminChatMessagesLog');return n?n.closest('.catalog-section')||n:null;}
  return $(map[key]||key);
 }
 function go(key){
  const node=targetFor(key); if(!node){if(key==='students'&&window.openAddParticipant)window.openAddParticipant();return;}
  if(key==='students'&&window.openAddParticipant){window.openAddParticipant();return;}
  node.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelectorAll('#crestAdminSidebar a').forEach(a=>a.classList.toggle('active',a.dataset.go===key));
 }
 function init(){
  if($('crestAdminSidebar'))return;
  const side=document.createElement('aside');side.id='crestAdminSidebar';
  side.innerHTML='<div class="brand"><div class="crest-mark"><i class="fa-solid fa-book-open"></i></div><strong>CREST Academy</strong><small>Administrator Portal</small></div>'+
   '<div class="nav-label">School management</div>'+
   '<a href="#top" data-go="top" class="active"><i class="fa-solid fa-house"></i><span>Dashboard</span></a>'+
   '<a href="#students" data-go="students"><i class="fa-solid fa-user-graduate"></i><span>Students</span></a>'+
   '<a href="#teachers" data-go="teachers"><i class="fa-solid fa-chalkboard-user"></i><span>Teachers</span></a>'+
   '<a href="#timetable" data-go="timetable"><i class="fa-solid fa-calendar-days"></i><span>Timetable</span></a>'+
   '<a href="#resources" data-go="resources"><i class="fa-solid fa-folder-open"></i><span>Learning Resources</span></a>'+
   '<div class="nav-label">Academic control</div>'+
   '<a href="#work" data-go="work"><i class="fa-solid fa-clipboard-list"></i><span>Assignments & Results</span></a>'+
   '<a href="#exams" data-go="exams"><i class="fa-solid fa-file-circle-check"></i><span>Examinations</span></a>'+
   '<a href="#voice" data-go="voice"><i class="fa-solid fa-microphone-lines"></i><span>Voice Lessons</span></a>'+
   '<a href="#video" data-go="video"><i class="fa-solid fa-video"></i><span>Video Lessons</span></a>'+
   '<a href="#chat" data-go="chat"><i class="fa-solid fa-comments"></i><span>Messages</span></a>'+
   '<div class="nav-label">Account</div>'+
   '<button type="button" id="crestAdminLogout"><i class="fa-solid fa-right-from-bracket"></i><span>Sign out</span></button>'+
   '<div class="sidebar-foot">Learn · Practise · Excel<br>CREST Academy school control</div>';
  document.body.insertBefore(side,document.body.firstChild);
  const header=document.querySelector('body>header');
  const hero=document.createElement('section');hero.id='crestAdminHero';hero.innerHTML='<h2>Welcome to CREST Academy Administration</h2><p>One place to manage learners, teachers, teaching, examinations and the school timetable.</p>';
  if(header)header.insertAdjacentElement('afterend',hero);
  const overview=document.createElement('section');overview.id='crestAdminOverview';
  overview.innerHTML='<div class="crest-admin-stat"><div class="ico"><i class="fa-solid fa-user-graduate"></i></div><div><strong>Student Management</strong><span>Register and manage learners</span></div></div>'+
   '<div class="crest-admin-stat"><div class="ico"><i class="fa-solid fa-chalkboard-user"></i></div><div><strong>Teacher Management</strong><span>Create accounts and assign classes</span></div></div>'+
   '<div class="crest-admin-stat"><div class="ico"><i class="fa-solid fa-calendar-check"></i></div><div><strong>School Timetable</strong><span>Set and publish class schedules</span></div></div>'+
   '<div class="crest-admin-stat"><div class="ico"><i class="fa-solid fa-shield-halved"></i></div><div><strong>Academic Oversight</strong><span>Monitor learning and assessment</span></div></div>';
  if(hero)hero.insertAdjacentElement('afterend',overview);
  const quick=document.createElement('section');quick.id='crestAdminQuick';
  quick.innerHTML='<h3><i class="fa-solid fa-bolt" style="color:#f59e0b"></i> Quick Actions</h3><div class="actions">'+
   '<a href="#students" data-go="students"><i class="fa-solid fa-user-plus"></i>Register Student</a>'+
   '<a href="#teachers" data-go="teachers"><i class="fa-solid fa-user-tie"></i>Manage Teachers</a>'+
   '<a href="#resources" data-go="resources"><i class="fa-solid fa-cloud-arrow-up"></i>Upload Resource</a>'+
   '<a href="#timetable" data-go="timetable"><i class="fa-solid fa-calendar-plus"></i>Set Timetable</a>'+
   '<a href="#exams" data-go="exams"><i class="fa-solid fa-file-circle-check"></i>Examination Centre</a></div>';
  overview.insertAdjacentElement('afterend',quick);
  document.querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();go(a.dataset.go)}));
  $('crestAdminLogout').addEventListener('click',()=>{if(window.adminSignOut)window.adminSignOut();else{sessionStorage.removeItem('crestAdminOK');sessionStorage.removeItem('crestAdminKey');location.reload();}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
