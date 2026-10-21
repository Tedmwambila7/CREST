// 🔑 SECURITY METADATA KEYS
const API_KEY = "$2a$10$ZYjc47iFsl/P17Lr4XgnweJOTspAyJjfEf.wLyFMRHeAq6iF/5FbS";
const BIN_ID = "6a35b1caf5f4af5e29118111";
const BASE_URL = "https://api.jsonbin.io/v3/b/" + BIN_ID;

// Active Navigation State State Tracker
let currentLevel = "";
let selectedClass = "";
let selectedSubject = "";
let selectedType = "All"; 
let selectedSyllabus = "All"; // Tracker for syllabus configuration choice: All, National, Cambridge
let allBooks = [];
let searchTerm = "";

// 🇲🇼 Verified Curriculum Subject Arrays
const subjectsList = {
  primary: ["Mathematics", "Chichewa", "English", "Primary Science", "Social Studies", "Agriculture", "Life Skills"],
  secondary: ["Mathematics", "Biology", "Physics", "Chemistry", "Agriculture", "English Language & Literature", "History", "Geography", "Social & Life Skills", "Bible Knowledge"],
  tertiary: ["Computer Science", "Engineering", "Business Administration", "Medicine & Health", "Education", "Other"]
};

const classMapping = {
  primary: ['Standard 1','Standard 2','Standard 3','Standard 4','Standard 5','Standard 6','Standard 7','Standard 8'],
  secondary: ['Form 1','Form 2','Form 3','Form 4'],
  tertiary: ['Year 1','Year 2','Year 3','Year 4','Year 5']
};

window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
  }, 1000);
  loadLibraryData();
});

const typingWords = ["Video Lessons", "Past Exam Papers", "Cambridge Tracks", "Academy Core Hub"];
let wIdx = 0, cIdx = 0, isDel = false;
function typeEffect() {
  const target = document.getElementById('typedText');
  if (!target) return;
  let curWord = typingWords[wIdx];
  target.textContent = isDel ? curWord.substring(0, cIdx--) : curWord.substring(0, cIdx++);
  if (!isDel && cIdx === curWord.length + 1) { isDel = true; setTimeout(typeEffect, 1600); return; }
  if (isDel && cIdx === 0) { isDel = false; wIdx = (wIdx + 1) % typingWords.length; }
  setTimeout(typeEffect, isDel ? 60 : 100);
}
typeEffect();

async function loadLibraryData() {
  try {
    const res = await fetch(BASE_URL + "/latest", { headers: { "X-Master-Key": API_KEY } });
    const payload = await res.json();
    allBooks = payload.record.books || [];
  } catch (err) { console.error("Database connection failure:", err); }
}

function switchHub(level) {
  currentLevel = level;
  selectedClass = "";
  selectedSubject = "";
  selectedType = "All";
  selectedSyllabus = "All"; // Reset track configuration

  document.querySelectorAll('.hub-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`hub-${level}`).classList.add('active');

  document.querySelectorAll('.console-tray').forEach(t => t.style.display = 'none');
  document.getElementById(`tray-${level}`).style.display = 'block';

  if(level === 'request') return;

  resetFilterUIButtons(level);

  const classGrid = document.getElementById(`class-grid-${level}`);
  classGrid.innerHTML = classMapping[level].map(cls => `
    <button class="btn-pill" id="btn-cls-${cls.replace(' ','')}" onclick="chooseClass('${cls}')">${cls}</button>
  `).join('');

  document.getElementById(`subject-grid-${level}`).innerHTML = "";
  document.getElementById(`cards-${level}`).innerHTML = `<p style="color:var(--text-muted); font-size:14px;">Select a standard/form folder layer above to view data.</p>`;
}

function chooseClass(cls) {
  selectedClass = cls;
  selectedSubject = "";

  document.querySelectorAll('.btn-pill').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-cls-${cls.replace(' ','')}`).classList.add('active');

  // Injecting an extra filter panel row item inside subject folder generation zone
  const subGrid = document.getElementById(`subject-grid-${currentLevel}`);
  subGrid.innerHTML = `
    <div style="width:100%; display:flex; gap:10px; margin-bottom:10px; border-bottom:1px dashed rgba(255,255,255,0.05); padding-bottom:10px;">
      <span style="font-size:12px; color:#94a3b8; align-self:center;">Syllabus Stream:</span>
      <button class="btn-tab active" id="track-all" onclick="filterBySyllabus('All')">🌐 Show All</button>
      <button class="btn-tab" id="track-national" onclick="filterBySyllabus('National')">🇲🇼 National Stream</button>
      <button class="btn-tab" id="track-cambridge" onclick="filterBySyllabus('Cambridge')">🇬🇧 Cambridge Track</button>
    </div>
    <button class="btn-tab active" id="tab-all" onclick="chooseSubject('')">📂 All Subjects</button>
    ` + subjectsList[currentLevel].map(sub => `
      <button class="btn-tab" id="tab-${sub.replace(/[^a-zA-Z0-9]/g,'')}" onclick="chooseSubject('${sub}')">📚 ${sub}</button>
    `).join('');

  processFilterRender();
}

// Handler option switcher for custom Cambridge track layout configurations
function filterBySyllabus(track) {
  selectedSyllabus = track;
  document.getElementById('track-all').classList.remove('active');
  document.getElementById('track-national').classList.remove('active');
  document.getElementById('track-cambridge').classList.remove('active');

  if(track === 'All') document.getElementById('track-all').classList.add('active');
  if(track === 'National') document.getElementById('track-national').classList.add('active');
  if(track === 'Cambridge') document.getElementById('track-cambridge').classList.add('active');

  processFilterRender();
}

function chooseSubject(sub) {
  selectedSubject = sub;
  document.querySelectorAll('.btn-tab').forEach(t => {
    if(t.id.startsWith('tab-')) t.classList.remove('active');
  });
  if(sub === '') document.getElementById('tab-all').classList.add('active');
  else document.getElementById(`tab-${sub.replace(/[^a-zA-Z0-9]/g,'')}`).classList.add('active');

  processFilterRender();
}

function filterByType(type) {
  selectedType = type;
  if (!currentLevel) return;

  resetFilterUIButtons(currentLevel);

  if (type === 'All') {
    const btn = document.getElementById(`btnAll-${currentLevel}`);
    if (btn) { btn.style.borderColor = '#38bdf8'; btn.style.color = '#fff'; }
  } else if (type === 'Book') {
    const btn = document.getElementById(`btnBooks-${currentLevel}`);
    if (btn) { btn.style.borderColor = '#38bdf8'; btn.style.color = '#fff'; }
  } else if (type === 'Video Lesson') {
    const btn = document.getElementById(`btnVideos-${currentLevel}`);
    if (btn) { btn.style.borderColor = '#38bdf8'; btn.style.color = '#fff'; }
  }

  processFilterRender();
}

function resetFilterUIButtons(level) {
  const allBtn = document.getElementById(`btnAll-${level}`);
  const bookBtn = document.getElementById(`btnBooks-${level}`);
  const videoBtn = document.getElementById(`btnVideos-${level}`);

  if (allBtn) { allBtn.style.borderColor = 'transparent'; allBtn.style.color = '#94a3b8'; }
  if (bookBtn) { bookBtn.style.borderColor = 'transparent'; bookBtn.style.color = '#94a3b8'; }
  if (videoBtn) { videoBtn.style.borderColor = 'transparent'; videoBtn.style.color = '#94a3b8'; }

  if (selectedType === 'All' && allBtn) { allBtn.style.borderColor = '#38bdf8'; allBtn.style.color = '#fff'; }
}

function processFilterRender() {
  const container = document.getElementById(`cards-${currentLevel}`);
  let searchVal = searchTerm.toLowerCase();

  let datasets = allBooks.filter(b => b.level === currentLevel && b.className === selectedClass);

  if (selectedSubject !== "") {
    datasets = datasets.filter(b => b.subject === selectedSubject);
  }
  if (searchVal !== "") {
    datasets = datasets.filter(b => b.title.toLowerCase().includes(searchVal) || b.subject.toLowerCase().includes(searchVal));
  }

  if (selectedType === "Book") {
    datasets = datasets.filter(b => b.type === "Book" || b.type === "Notes" || b.type === "Past Paper");
  } else if (selectedType === "Video Lesson") {
    datasets = datasets.filter(b => b.type === "Video Lesson");
  }

  // Filter track based on database property selection rules 
  if (selectedSyllabus === "National") {
    datasets = datasets.filter(b => !b.syllabus || b.syllabus === "National");
  } else if (selectedSyllabus === "Cambridge") {
    datasets = datasets.filter(b => b.syllabus === "Cambridge");
  }

  if (datasets.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; color:var(--text-muted); font-size:13px; font-style:italic; padding:20px 0;">📭 No resources matching this syllabus track configuration are available yet.</p>`;
    return;
  }

  container.innerHTML = datasets.map(item => {
    const isVideo = item.type === "Video Lesson";
    const badgeClass = isVideo ? "badge-video" : "badge-doc";
    const trackBadge = item.syllabus === "Cambridge" ? "🇬🇧 Cambridge" : "🇲🇼 National";
    const badgeLabel = isVideo ? `📺 Video • ${trackBadge}` : `📄 ${item.type} • ${trackBadge}`;
    
    return `
      <div class="card">
        <div>
          <span class="card-badge ${badgeClass}">${badgeLabel}</span>
          <div class="card-icon">${isVideo ? '📺' : '📖'}</div>
          <h4>${item.title}</h4>
          <p class="meta-text">${item.subject} • ${item.className}</p>
        </div>
        <div class="action-row">
          <a href="${item.link}" target="_blank" class="btn-action ${isVideo ? 'action-watch' : 'action-down'}">
            <i class="fas ${isVideo ? 'fa-play' : 'fa-download'}"></i>
            ${isVideo ? 'Watch Lesson' : 'Download'}
          </a>
          <button class="btn-pill" style="padding:10px;" onclick="shareAsset('${item.title}','${item.link}')">
            <i class="fas fa-share-alt"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function submitRequest() {
  const name = document.getElementById('reqName').value.trim();
  const level = document.getElementById('reqLevel').value;
  const details = document.getElementById('reqDetails').value.trim();
  if(!name || !details) { alert("⚠️ Please fill out your details!"); return; }
  const successLabel = document.getElementById('reqSuccess');
  successLabel.textContent = `🚀 Thank you ${name}! Request successfully channeled to Sir Taydayo.`;
  document.getElementById('reqName').value = "";
  document.getElementById('reqDetails').value = "";
  setTimeout(() => { successLabel.textContent = ""; }, 6000);
}

function searchBooks() {
  searchTerm = document.getElementById('searchBox').value;
  if(currentLevel !== "" && selectedClass !== "") processFilterRender();
}

function shareAsset(title, link) {
  if (navigator.share) { navigator.share({ title: title, url: link }); } 
  else { navigator.clipboard.writeText(link); alert('📋 Link copied to device clipboard!'); }
}

window.switchHub = switchHub;
window.chooseClass = chooseClass;
window.chooseSubject = chooseSubject;
window.filterByType = filterByType;
window.filterBySyllabus = filterBySyllabus; // Expose track logic to browser layout elements
window.submitRequest = submitRequest;
window.searchBooks = searchBooks;