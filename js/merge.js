'use strict';

// MERGE
// ══════════════════════════════════════════════════════════════════════
async function addMergeFiles(files){
  if(S.busy)return;
  let added=0;
  for(const file of files){
    if(S.mergeFiles.length>=LIMITS.maxMergeFiles){toast(t('Max {n} files per merge',{n:LIMITS.maxMergeFiles}),'w');break;}
    let ab;
    try{ab=await readPdfFile(file);}
    catch(err){toast(err.message,'e');continue;}
    let pageCount=0;
    try{const d=await pdfjsLib.getDocument({data:ab.slice(0)}).promise;pageCount=d.numPages;}catch(e){}
    S.mergeFiles.push({name:file.name,ab:ab.slice(0),pageCount});
    added++;
  }
  if(added){renderMergeList();G('merge-controls').style.display='';}
}

function renderMergeList(){
  const list=G('merge-list');
  list.innerHTML='';
  S.mergeFiles.forEach((f,i)=>{
    const div=document.createElement('div');
    div.className='merge-item';
    div.draggable=true;
    div.dataset.idx=i;
    div.innerHTML=`
      <span class="mi-icon">📄</span>
      <div class="mi-info">
        <div class="mi-name">${esc(f.name)}</div>
        <div class="mi-meta">${t('{n} pages',{n:f.pageCount})}</div>
      </div>
      <button class="mi-del btn" onclick="removeMergeFile(${i})" title="${t('Remove')}">✕</button>`;
    div.addEventListener('dragstart',ev=>{ev.dataTransfer.setData('text/plain',i);div.classList.add('dragging');});
    div.addEventListener('dragend',()=>div.classList.remove('dragging'));
    div.addEventListener('dragover',ev=>{ev.preventDefault();div.classList.add('drag-over');});
    div.addEventListener('dragleave',()=>div.classList.remove('drag-over'));
    div.addEventListener('drop',ev=>{
      ev.preventDefault();div.classList.remove('drag-over');
      const from=parseInt(ev.dataTransfer.getData('text/plain'));
      const to=i;
      if(from===to)return;
      const item=S.mergeFiles.splice(from,1)[0];
      S.mergeFiles.splice(to,0,item);
      renderMergeList();
    });
    list.appendChild(div);
  });
}

function removeMergeFile(i){
  S.mergeFiles.splice(i,1);
  if(!S.mergeFiles.length){G('merge-controls').style.display='none';}
  else renderMergeList();
}
function clearMerge(){S.mergeFiles=[];G('merge-controls').style.display='none';G('fi-merge').value='';}

async function startMerge(){
  if(S.busy||S.mergeFiles.length<2){
    if(S.mergeFiles.length<2)toast(t('Add at least 2 PDFs to merge'),'w');
    return;
  }
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('merge',true);
  setProgress('merge',0,S.mergeFiles.length);
  try{
    const buffers=S.mergeFiles.map(f=>f.ab.slice(0));
    const result=await runWorkerTask({
      type:'merge',
      buffers,
      PDFLibSrc:PDFLIB_URL
    },buffers,
    (cur,tot)=>setProgress('merge',cur,tot));
    setProgress('merge',S.mergeFiles.length,S.mergeFiles.length);
    downloadBytes(result.bytes,'merged.pdf');
    toast(t('Merge complete — downloading PDF'),'s');
  }catch(err){toast(t('Merge failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

// ══════════════════════════════════════════════════════════════════════
