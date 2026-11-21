/* CREST offline learning library — instant open/play with background saving */
(function(){
  'use strict';
  const DB='crest-offline-library-v1', STORE='files';
  let dbPromise;
  const blobUrls=new Set();
  const status=(el,msg)=>{let n=el.parentElement&&el.parentElement.querySelector('.crest-offline-status');if(!n){n=document.createElement('small');n.className='crest-offline-status';n.style.cssText='display:block;margin-top:6px;color:#7dd3fc;font-size:12px';el.insertAdjacentElement('afterend',n);}n.textContent=msg;};
  function studentKey(){try{const s=window.studentSession||{};return String(s.phone||s.email||s.student_id||s.id||'').trim().toLowerCase()||'guest';}catch(_){return 'guest';}}
  function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(new Error('Offline storage is not supported.'));return;}const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open offline storage.'));});return dbPromise;}
  function stableUrl(raw){const u=new URL(raw,location.href);if(!/^https?:$/.test(u.protocol))throw new Error('Unsupported file address.');return u.origin+u.pathname;}
  async function read(key){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  async function write(row){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE,'readwrite').objectStore(STORE).put(row);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
  async function getSaved(url){const row=await read(studentKey()+'|'+stableUrl(url));return row&&row.blob instanceof Blob?row:null;}
  async function save(url,onProgress){const key=studentKey()+'|'+stableUrl(url);const prior=await read(key);if(prior&&prior.blob instanceof Blob)return prior;const response=await fetch(url,{mode:'cors',credentials:'include'});if(!response.ok)throw new Error('Save failed ('+response.status+').');const blob=await response.blob();if(!blob.size)throw new Error('The file was empty.');const row={key,url:stableUrl(url),blob,type:blob.type||response.headers.get('content-type')||'application/octet-stream',savedAt:Date.now(),size:blob.size};await write(row);if(onProgress)onProgress(blob.size);return row;}
  function formatSize(n){return n<1048576?Math.round(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';}
  function localUrl(blob){const u=URL.createObjectURL(blob);blobUrls.add(u);return u;}
  const saving=new Map();
  function saveInBackground(url,el){const key=studentKey()+'|'+stableUrl(url);if(saving.has(key))return saving.get(key);const task=(async()=>{try{const existing=await getSaved(url);if(existing){if(el)status(el,'Available offline · '+formatSize(existing.size));return existing;}if(el)status(el,'Playing/opening now · saving a copy in the background…');const row=await save(url);if(el)status(el,'Saved for offline use · '+formatSize(row.size));return row;}catch(err){if(el)status(el,'Opened online · offline copy could not be saved ('+(err.message||'network or access issue')+').');return null;}finally{saving.delete(key);}})();saving.set(key,task);return task;}
  async function prepareMedia(el){
    if(el.dataset.crestLocal==='1'||el.dataset.crestPreparing==='1')return;
    const remote=el.dataset.crestRemote||el.currentSrc||el.src;if(!remote)return;
    el.dataset.crestRemote=remote;el.dataset.crestPreparing='1';const wasPlaying=!el.paused;
    try{
      const cached=await getSaved(remote);
      if(cached){el.dataset.crestLocal='1';el.src=localUrl(cached.blob);el.load();status(el,'Playing saved offline copy · '+formatSize(cached.size));if(wasPlaying)try{await el.play();}catch(_){} }
      else {status(el,'Playing now · saving for offline use in the background…');saveInBackground(remote,el);}
    }catch(_){status(el,'Playing online. Offline saving is not available for this file.');}
    finally{el.dataset.crestPreparing='0';}
  }
  document.addEventListener('play',e=>{
    const el=e.target;if(!(el instanceof HTMLMediaElement)||!el.matches('audio,video')||el.dataset.crestLocal==='1'||el.dataset.crestPreparing==='1')return;
    /* Do not pause or block playback: save in the background. */
    prepareMedia(el);
  },true);

  let viewer;
  function ensureViewer(){
    if(viewer)return viewer;
    const wrap=document.createElement('div');wrap.id='crest-resource-viewer';wrap.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(3,7,18,.96);display:none;flex-direction:column;padding:12px;box-sizing:border-box';
    const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;gap:12px;padding:8px 4px;color:white;font:600 14px Arial,sans-serif';
    const name=document.createElement('span');name.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const state=document.createElement('small');state.style.cssText='color:#7dd3fc;font-weight:400';
    const close=document.createElement('button');close.type='button';close.textContent='Close';close.style.cssText='border:0;border-radius:8px;padding:9px 14px;background:#38bdf8;color:#06111f;font-weight:700';
    const frame=document.createElement('iframe');frame.title='CREST learning resource';frame.style.cssText='width:100%;height:100%;flex:1;border:0;border-radius:10px;background:white';
    close.onclick=()=>{wrap.style.display='none';frame.src='about:blank';};
    bar.append(name,state,close);wrap.append(bar,frame);document.body.appendChild(wrap);viewer={wrap,frame,name,state};return viewer;
  }
  function extOf(url){try{return new URL(url,location.href).pathname.split('.').pop().toLowerCase();}catch(_){return '';}}
  const supported=['pdf','ppt','pptx','doc','docx','xls','xlsx','odp','odt'];
  let viewerOpenId=0;
  document.addEventListener('click',async e=>{
    const a=e.target.closest&&e.target.closest('a[href]');if(!a||!a.href||a.origin!==location.origin&&a.protocol!=='https:')return;
    const ext=extOf(a.href);if(!supported.includes(ext)&&!a.hasAttribute('data-crest-offline'))return;
    if(a.dataset.crestOpening==='1')return;
    e.preventDefault();e.stopPropagation();
    const v=ensureViewer(),openId=++viewerOpenId;
    const label=(a.textContent||'Learning resource').trim();
    v.wrap.style.display='flex';v.name.textContent=label;v.state.textContent='Opening…';
    try{
      const cached=await getSaved(a.href);
      if(cached&&openId===viewerOpenId){
        v.frame.src=localUrl(cached.blob);
        v.state.textContent='Opened saved copy · '+formatSize(cached.size);
        return;
      }
    }catch(_){}
    if(ext==='pdf'){
      /* Never make successful CORS access a condition for viewing.
         Show the original PDF immediately; cache it only as a background enhancement. */
      v.frame.src=a.href;
      v.state.textContent='PDF opened · saving an offline copy in the background…';
      save(a.href).then(row=>{
        if(openId!==viewerOpenId||v.wrap.style.display!=='flex')return;
        v.frame.src=localUrl(row.blob);
        v.state.textContent='PDF ready · saved for offline use · '+formatSize(row.size);
      }).catch(err=>{
        if(openId!==viewerOpenId||v.wrap.style.display!=='flex')return;
        /* Cross-origin hosts may block JavaScript downloads while still allowing
           their PDF to display in an iframe. Keep the online document open. */
        v.state.textContent='PDF opened online · offline copy unavailable';
        console.warn('CREST PDF background save failed; online viewer remains active:',err);
      });
      return;
    }
    v.frame.src=a.href;v.state.textContent='Opening now · saving in background…';
    const task=saveInBackground(a.href,null);
    task.then(row=>{if(!row||openId!==viewerOpenId)return;if(v.wrap.style.display==='flex'){v.frame.src=localUrl(row.blob);v.state.textContent='Saved for offline use · '+formatSize(row.size);}});
  },true);
  window.CRESTOffline={
    save,getSaved,
    async usage(){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result.filter(x=>x.key.startsWith(studentKey()+'|')).reduce((a,x)=>a+(x.size||0),0));r.onerror=()=>reject(r.error);});},
    async clear(){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite'),s=tx.objectStore(STORE),r=s.getAllKeys();r.onsuccess=()=>r.result.filter(k=>k.startsWith(studentKey()+'|')).forEach(k=>s.delete(k));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  };
  window.addEventListener('beforeunload',()=>blobUrls.forEach(URL.revokeObjectURL));
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
  console.info('CREST instant-open offline library ready.');
})();