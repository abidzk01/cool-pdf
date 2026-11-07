'use strict';
// ── Local asset URLs ────────────────────────────────────────────────
// Scripts and the blob worker resolve against document.baseURI.
const WORKER_URL=new URL('vendor/pdfjs/pdf.worker.min.js',document.baseURI).href;
const PDFLIB_URL=new URL('vendor/pdf-lib/pdf-lib.min.js',document.baseURI).href;
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER_URL;

// ── XSS helper ──────────────────────────────────────────────────────
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ── Validation ──────────────────────────────────────────────────────
// One place for limits. Keep the UI copy (drop zones / info boxes) in sync.
const LIMITS={
  maxBytes:1536*1024*1024,   // 1.5 GB per PDF
  maxPages:3000,             // advertised page ceiling (soft warning)
  maxMergeFiles:50,
  maxTextLength:120,
};

const APP_VERSION = '1.0.0';   // stamped from VERSION by tools/stamp-assets.js
const PDF_MAGIC='%PDF-';

// Clamp a numeric form value. Never let NaN/out-of-range reach PDF code.
function clampInt(value,min,max,fallback){
  const n=parseInt(value,10);
  if(!Number.isFinite(n))return fallback;
  return Math.min(max,Math.max(min,n));
}

function isPdfName(name){return typeof name==='string'&&/\.pdf$/i.test(name.trim());}

// Some real-world PDFs carry junk before the header; the spec tolerates it
// inside the first 1024 bytes, so scan that window instead of offset 0 only.
function hasPdfMagic(ab){
  if(!ab||ab.byteLength<5)return false;
  const head=new Uint8Array(ab,0,Math.min(ab.byteLength,1024));
  let text='';
  for(let i=0;i<head.length;i++)text+=String.fromCharCode(head[i]);
  return text.indexOf(PDF_MAGIC)!==-1;
}

function fmtBytes(n){
  if(n>=1073741824)return (n/1073741824).toFixed(2)+' GB';
  if(n>=1048576)return (n/1048576).toFixed(1)+' MB';
  if(n>=1024)return Math.round(n/1024)+' KB';
  return Math.max(0,Math.round(n))+' B';
}

// Single entry point for every file input and drop zone.
// opts.allowEncrypted — only the Unlock tool may accept a password-protected PDF.
async function readPdfFile(file,opts){
  if(!file)throw new Error(t('No file selected'));
  if(!isPdfName(file.name))throw new Error(t('"{name}" is not a PDF file',{name:file.name}));
  if(file.size===0)throw new Error(t('File is empty'));
  const maxBytes=(opts&&opts.maxBytes)||LIMITS.maxBytes;
  if(file.size>maxBytes)throw new Error(t('File too large ({size}) — max {max}',{size:fmtBytes(file.size),max:fmtBytes(maxBytes)}));
  const ab=await file.arrayBuffer();
  if(!hasPdfMagic(ab))throw new Error(t('Not a valid PDF — missing %PDF- header'));
  if(!(opts&&opts.allowEncrypted)&&!(await validatePDF(ab)))throw new Error(t('Invalid, corrupt or encrypted PDF'));
  return ab;
}

// Accepts "1-3,5,7-9" and returns a normalised in-bounds range, or '' if invalid.
function normalizeRange(value,total){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const out=[];
  for(const token of raw.split(',')){
    const part=token.trim();
    if(!part)continue;
    const m=part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!m)return '';
    const a=parseInt(m[1],10);
    const b=m[2]?parseInt(m[2],10):a;
    if(a<1||b<a||b>total)return '';
    out.push(a===b?String(a):`${a}-${b}`);
  }
  return out.join(',');
}

// ── State ────────────────────────────────────────────────────────────
const S={
  theme:'dark',
  busy:false,
  // split
  splitFile:null,pdfJsDoc:null,pageBuffers:[],pageOrder:[],
  rotations:{},selected:new Set(),deleted:new Set(),thumbnails:{},
  startTime:0,
  // merge
  mergeFiles:[],
  // one-shot file holders
  compressFile:null,imagesFile:null,watermarkFile:null,
  pageNumFile:null,protectFile:null,unlockFile:null,
  // editor
  edit:null,signPad:null,
};

// ── Helpers ──────────────────────────────────────────────────────────
const G=id=>document.getElementById(id);
function toast(msg,type='i',dur=3500){
  const d=document.createElement('div');
  d.className='toast '+type;
  const icons={s:'✅',e:'❌',i:'ℹ️',w:'⚠️'};
  d.innerHTML=icons[type]+' '+esc(msg);
  G('toast-container').appendChild(d);
  setTimeout(()=>d.remove(),dur);
}

// BUG-7: global busy lock
function setAllBusy(v){
  S.busy=v;
  document.querySelectorAll('.btn').forEach(b=>{
    if(v){b.dataset.wd=b.disabled?'1':'0';b.disabled=true;}
    else if(b.dataset.wd!=='1'){b.disabled=false;}
  });
}

// BUG-2: validate PDF bytes
async function validatePDF(ab){
  try{await PDFLib.PDFDocument.load(ab.slice(0),{ignoreEncryption:false});return true;}
  catch(e){return false;}
}

// BUG-3: full split state reset
// S.cuts must exist
if(!S.cuts)S.cuts=new Set();
function resetSplitState(){
  S.splitFile=null;S.pdfJsDoc=null;S.pageBuffers=[];S.pageOrder=[];
  S.rotations={};S.selected.clear();S.deleted.clear();S.thumbnails={};
  S.cuts=new Set();
}

// Progress bar helper — uses IDs pf-TAB, ps-TAB, pp-TAB, pe-TAB
function showProgress(tab,show){
  const pw=G('pw-'+tab);
  if(pw){pw.className='progress-wrap'+(show?' show':'');}
}
function setProgress(tab,cur,tot){
  const pct=tot?Math.round(cur/tot*100):0;
  const el=(Date.now()-S.startTime)/1000;
  const eta=cur>0?((el/cur)*(tot-cur)).toFixed(0):'–';
  const fill=G('pf-'+tab),stats=G('ps-'+tab),pctEl=G('pp-'+tab),etaEl=G('pe-'+tab);
  if(fill)fill.style.width=pct+'%';
  if(stats)stats.textContent=cur+'/'+tot;
  if(pctEl)pctEl.textContent=pct+'%';
  if(etaEl)etaEl.textContent=pct<100?t('~{n}s left',{n:eta}):t('Done!');
}

// BUG-5: worker always terminated in try/finally
const WORKER_SRC=`
self.onmessage=async function(e){
  const {PDFLibSrc}=e.data;
  importScripts(PDFLibSrc);
  const PDFLib=self.PDFLib;
  if(e.data.type==='split'){
    const {buffers,order,rotations,deletedArr,mode,range,every}=e.data;
    try{
      const srcDoc=await PDFLib.PDFDocument.load(buffers[0]);
      const totalPages=srcDoc.getPageCount();
      let groups=[];
      if(mode==='selected'){
        const sel=order.filter(i=>!deletedArr.includes(i));
        groups=[sel];
      } else if(mode==='each'){
        groups=order.filter(i=>!deletedArr.includes(i)).map(i=>[i]);
      } else if(mode==='range'){
        const sel=[];
        range.split(',').forEach(p=>{
          p=p.trim();
          if(p.includes('-')){const[a,b]=p.split('-').map(Number);for(let i=a;i<=b;i++)sel.push(i-1);}
          else{const n=parseInt(p);if(!isNaN(n))sel.push(n-1);}
        });
        groups=[sel.filter(i=>i>=0&&i<totalPages)];
      } else if(mode==='every'){
        const n=parseInt(every)||2;
        const pages=order.filter(i=>!deletedArr.includes(i));
        for(let i=0;i<pages.length;i+=n)groups.push(pages.slice(i,i+n));
      }
      const results=[];
      for(let gi=0;gi<groups.length;gi++){
        const grp=groups[gi];
        const doc=await PDFLib.PDFDocument.create();
        const copied=await doc.copyPages(srcDoc,grp);
        copied.forEach((pg,ci)=>{
          const rot=(rotations[grp[ci]]||0);
          if(rot)pg.setRotation(PDFLib.degrees(rot));
          doc.addPage(pg);
        });
        const bytes=await doc.save();
        results.push({bytes,index:gi});
        self.postMessage({type:'progress',current:gi+1,total:groups.length});
      }
      self.postMessage({type:'split_done',results,multiple:groups.length>1});
    }catch(err){self.postMessage({type:'error',message:err.message});}
  } else if(e.data.type==='merge'){
    const {buffers,counts}=e.data;
    try{
      const merged=await PDFLib.PDFDocument.create();
      for(let i=0;i<buffers.length;i++){
        const src=await PDFLib.PDFDocument.load(buffers[i]);
        const pages=await merged.copyPages(src,src.getPageIndices());
        pages.forEach(p=>merged.addPage(p));
        self.postMessage({type:'progress',current:i+1,total:buffers.length});
      }
      const bytes=await merged.save();
      self.postMessage({type:'merge_done',bytes});
    }catch(err){self.postMessage({type:'error',message:err.message});}
  }
};
`;

function makeWorker(){
  const blob=new Blob([WORKER_SRC],{type:'application/javascript'});
  const url=URL.createObjectURL(blob);
  const w=new Worker(url);
  w._url=url;
  return w;
}
function killWorker(w){
  try{w.terminate();}catch(e){}
  try{URL.revokeObjectURL(w._url);}catch(e){}
}

function runWorkerTask(msg,xfer,onprog){
  return new Promise((res,rej)=>{
    const w=makeWorker();
    w.onmessage=ev=>{
      const d=ev.data;
      if(d.type==='progress'){onprog&&onprog(d.current,d.total);}
      else if(d.type==='split_done'||d.type==='merge_done'){killWorker(w);res(d);}
      else if(d.type==='error'){killWorker(w);rej(new Error(d.message));}
    };
    w.onerror=ev=>{killWorker(w);rej(new Error(ev.message||'Worker error'));};
    w.postMessage(msg,xfer||[]);
  });
}

// ── Theme ────────────────────────────────────────────────────────────
function setTheme(t){
  S.theme=t;
  document.documentElement.setAttribute('data-theme',t);
  const bl=G('btnLight'),bd=G('btnDark');
  if(bl)bl.classList.toggle('active',t==='light');
  if(bd)bd.classList.toggle('active',t==='dark');
}

// ── Tabs ─────────────────────────────────────────────────────────────
function switchTab(name){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panel=G('panel-'+name);
  if(panel)panel.classList.add('active');
  let active=null;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    const on=b.getAttribute('onclick')===`switchTab('${name}')`;
    b.classList.toggle('active',on);
    if(on)active=b;
  });
  // The strip scrolls horizontally on small screens; keep the active tab in view.
  if(active&&active.scrollIntoView)active.scrollIntoView({block:'nearest',inline:'nearest'});
}

// ── Drag & Drop helpers ──────────────────────────────────────────────
function dzOver(e,id){e.preventDefault();G('dz-'+id).classList.add('dragover');}
function dzLeave(id){G('dz-'+id).classList.remove('dragover');}
function dzDrop(e,id){
  e.preventDefault();dzLeave(id);
  const files=e.dataTransfer.files;
  if(!files.length)return;
  if(id==='split')loadSplitFile(files[0]);
  else if(id==='merge')addMergeFiles(files);
  else if(id==='compress')loadCompressFile(files[0]);
  else if(id==='images')startImages(files[0]);
  else if(id==='watermark')loadWatermarkFile(files[0]);
  else if(id==='pagenums')loadPageNumFile(files[0]);
  else if(id==='protect')loadProtectFile(files[0]);
  else if(id==='unlock')loadUnlockFile(files[0]);
  else if(id==='edit')loadEditFile(files[0]);
}

// ── Download helper ──────────────────────────────────────────────────
function safeName(name){
  // Strip path separators, control chars, and Windows-reserved names
  let n=String(name||'download.pdf').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'_').slice(0,200);
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(n))n='_'+n;
  return n||'download.pdf';
}
function downloadBytes(bytes,name){
  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=safeName(name);a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function downloadZip(files,zipName){
  const zip=new JSZip();
  files.forEach(f=>zip.file(safeName(f.name),f.bytes));
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=safeName(zipName);a.click();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
}

// ══════════════════════════════════════════════════════════════════════
