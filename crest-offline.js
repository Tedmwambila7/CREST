/* CREST offline learning library — per-student persistent device cache */
(function(){
  'use strict';
  const DB='crest-offline-library-v1', STORE='files';
  let dbPromise;
  const blobUrls=new Set();
  const status=(el,msg)=>{let n=el.parentElement&&el.parentElement.querySelector('.crest-offline-status');if(!n){n=document.createElement('small');n.className='crest-offline-status';n.style.cssText='display:block;margin-top:6px;color:#7dd3fc;font-size:12px';el.insertAdjacentElement('afterend',n);}n.textContent=msg;};
  function studentKey(){
    try{const s=window.studentSession||{};return String(s.phone||s.email||s.student_id||s.id||'').trim().toLowerCase()||'guest';}
    catch(_){return 'guest';}
  }
  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('This browser does not support offline storage.'));return;}
      const req=indexedDB.open(DB,1);
      req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'key'});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open offline storage.'));
    });return dbPromise;
  }
  function stableUrl(raw){
    const u=new URL(raw,location.href);
    if(!/^https?:$/.test(u.protocol))throw new Error('Unsupported file address.');
    return u.origin+u.pathname;
  }
  async function read(key){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  async function write(row){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE,'readwrite').objectStore(STORE).put(row);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});}
  async function getSaved(url){
    const key=studentKey()+'|'+stableUrl(url);
    const row=await read(key);
    return row&&row.blob instanceof Blob?row:null;
  }
  async function save(url,onProgress){
    const key=studentKey()+'|'+stableUrl(url);
    const prior=await read(key);if(prior&&prior.blob instanceof Blob)return prior;
    const response=await fetch(url,{mode:'cors',credentials:'include'});
    if(!response.ok)throw new Error('Download failed ('+response.status+').');
    const blob=await response.blob();
    if(!blob.size)throw new Error('The downloaded file was empty.');
    const row={key,url:stableUrl(url),blob:blob,type:blob.type||response.headers.get('content-type')||'application/octet-stream',savedAt:Date.now(),size:blob.size};
    await write(row);if(onProgress)onProgress(blob.size);
    return row;
  }
  function formatSize(n){return n<1048576?Math.round(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';}
  function localUrl(blob){const u=URL.createObjectURL(blob);blobUrls.add(u);return u;}
  async function prepareMedia(el){
    if(el.dataset.crestLocal==='1'||el.dataset.crestPreparing==='1')return;
    const remote=el.dataset.crestRemote||el.currentSrc||el.src;if(!remote)return;
    el.dataset.crestRemote=remote;el.dataset.crestPreparing='1';
    const wasPlaying=!el.paused;el.pause();
    status(el,'Checking saved copy…');
    try{
      let row=await getSaved(remote),fresh=!!row;
      if(!row){status(el,'Saving this lesson to your device before playback…');row=await save(remote);}
      const old=el.src;el.dataset.crestLocal='1';el.src=localUrl(row.blob);el.load();
      status(el,(fresh?'Playing saved offline copy':'Saved on this device for future visits')+' · '+formatSize(row.size));
      if(wasPlaying||el.dataset.crestAutoplay==='1'){try{await el.play();}catch(_){}}
    }catch(err){
      status(el,'Offline save unavailable: '+(err.message||'network or storage error')+'. Playing online instead.');
      el.dataset.crestPreparing='0';
      if(wasPlaying)try{await el.play();}catch(_){}
    }finally{el.dataset.crestPreparing='0';}
  }
  document.addEventListener('play',e=>{
    const el=e.target;if(!(el instanceof HTMLMediaElement)||!el.matches('audio,video'))return;
    if(el.dataset.crestLocal==='1'||el.dataset.crestPreparing==='1')return;
    e.preventDefault();el.dataset.crestAutoplay='1';el.pause();prepareMedia(el);
  },true);
  document.addEventListener('click',async e=>{
    const a=e.target.closest&&e.target.closest('a[href]');
    if(!a||!a.href||a.origin!==location.origin&&a.protocol!=='https:')return;
    if(!/\.pdf(?:$|[?#])/i.test(a.href)&&!a.hasAttribute('data-crest-offline'))return;
    if(a.dataset.crestOpening==='1')return;
    e.preventDefault();a.dataset.crestOpening='1';
    const old=a.textContent; a.textContent='Preparing saved copy…';
    try{
      const row=await getSaved(a.href)||await save(a.href);
      const u=localUrl(row.blob);window.open(u,'_blank','noopener');
      a.textContent='Saved · Opened locally';
    }catch(err){a.textContent=old;window.open(a.href,'_blank','noopener');}
    finally{setTimeout(()=>{a.dataset.crestOpening='0';},1500);}
  },true);
  window.CRESTOffline={
    save, getSaved,
    async usage(){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result.filter(x=>x.key.startsWith(studentKey()+'|')).reduce((a,x)=>a+(x.size||0),0));r.onerror=()=>reject(r.error);});},
    async clear(){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite'),s=tx.objectStore(STORE),r=s.getAllKeys();r.onsuccess=()=>r.result.filter(k=>k.startsWith(studentKey()+'|')).forEach(k=>s.delete(k));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  };
  window.addEventListener('beforeunload',()=>blobUrls.forEach(URL.revokeObjectURL));
  if('storage' in navigator&&navigator.storage&&navigator.storage.persist){navigator.storage.persist().catch(()=>{});}
  console.info('CREST offline learning cache ready.');
})();