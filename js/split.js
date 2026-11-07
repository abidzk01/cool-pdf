'use strict';

// SPLIT
// ══════════════════════════════════════════════════════════════════════
async function loadSplitFile(file){
  if(!file||S.busy)return;
  resetSplitState(); // BUG-3
  toast(t('Loading PDF...'),'i',2000);
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  S.splitFile=ab.slice(0);
  S.splitFileName=file.name.replace(/\.pdf$/i,'');
  try{
    S.pdfJsDoc=await pdfjsLib.getDocument({data:ab.slice(0)}).promise;
    const n=S.pdfJsDoc.numPages;
    if(n>LIMITS.maxPages)toast(t('This PDF has {n} pages — very large files may be slow',{n}),'w',5000);
    S.pageOrder=Array.from({length:n},(_,i)=>i);
    S.pageBuffers=[ab.slice(0)];
    G('split-controls').style.display='';
    G('split-mode').value='cuts';
    onSplitModeChange();
    renderPageGrid();
    renderPartsSummary();
    toast(t('Loaded "{name}" — {n} pages. Click between pages to add ✂️ cuts.',{name:file.name,n}),'s');
  }catch(err){toast(t('Failed to read PDF: ')+err.message,'e');}
}

function renderPageGrid(){
  const container=G('page-grid');
  container.innerHTML='';
  // Remove grid display from container when in cuts mode — use sections instead
  const isCutsMode=G('split-mode').value==='cuts';
  const parts=isCutsMode?getPartsFromCuts():[];
  const hasCuts=isCutsMode&&S.cuts.size>0&&parts.length>1;

  if(isCutsMode){
    container.style.display='block';
    // Group pages into sections by cuts
    const sorted=[...S.cuts].sort((a,b)=>a-b);
    const breakpoints=[0,...sorted.map(c=>c+1),S.pageOrder.length];
    for(let s=0;s<breakpoints.length-1;s++){
      const start=breakpoints[s], end=breakpoints[s+1];
      const partColor=hasCuts?(PART_COLORS[s%PART_COLORS.length]):'';
      const partLabel=hasCuts?t('Part {n}',{n:s+1}):'';

      // Part header
      if(hasCuts){
        const hdr=document.createElement('div');
        hdr.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 4px 6px;';
        hdr.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${partColor}"></span>
          <span style="font-size:.78rem;font-weight:700;color:var(--text)">${partLabel}</span>
          <span style="font-size:.7rem;color:var(--text-m)">${t('{n} pages',{n:end-start})}</span>`;
        container.appendChild(hdr);
      }

      // Page grid section
      const section=document.createElement('div');
      section.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;margin-bottom:4px;';
      for(let pos=start;pos<end;pos++){
        const origIdx=S.pageOrder[pos];
        const div=makePageThumb(origIdx,pos,hasCuts?partColor:'',hasCuts?partLabel:'');
        section.appendChild(div);
        renderThumb(origIdx);
      }
      container.appendChild(section);

      // Cut marker or add-cut zone after this section (not after last)
      if(s<breakpoints.length-2){
        const cutPos=breakpoints[s+1]-1;
        if(S.cuts.has(cutPos)){
          const marker=document.createElement('div');
          marker.className='cut-marker';
          marker.style.margin='6px 0';
          marker.innerHTML=`<button class="cut-remove" onclick="removeCut(${cutPos})">✂️ Cut · click to remove</button>`;
          container.appendChild(marker);
        }
      }

      // Add-cut zones between last page of section and next (if no cut there yet)
      if(!hasCuts&&s<breakpoints.length-2)continue;// skip if no cuts
    }

    // If no cuts yet, also show add-cut hints between every row
    if(!hasCuts){
      // Just render as normal grid
      container.style.display='';
      container.innerHTML='';
      S.pageOrder.forEach((origIdx,pos)=>{
        const div=makePageThumb(origIdx,pos,'','');
        container.appendChild(div);
        renderThumb(origIdx);
      });
    }
  } else {
    // Non-cuts mode: standard grid
    container.style.display='';
    S.pageOrder.forEach((origIdx,pos)=>{
      const div=makePageThumb(origIdx,pos,'','');
      container.appendChild(div);
      renderThumb(origIdx);
    });
  }
  updateSelCount();
}

function makePageThumb(origIdx,pos,partColor,partLabel){
  const isSelected=S.selected.has(origIdx);
  const isDeleted=S.deleted.has(origIdx);
  const div=document.createElement('div');
  div.className='page-thumb'+(isSelected?' selected':'')+(isDeleted?' deleted':'');
  if(partColor)div.style.borderTopColor=partColor;
  div.dataset.orig=origIdx;
  div.dataset.pos=pos;
  div.draggable=true;
  div.innerHTML=`
    <span class="drag-handle">⠿</span>
    ${partColor?`<span class="part-label" style="background:${partColor}">${partLabel}</span>`:''}
    <canvas id="tc-${origIdx}" width="120" height="160" style="background:var(--inp);border-radius:6px"></canvas>
    <div class="page-num">${t('Page {n}',{n:origIdx+1})}</div>
    <div class="page-actions">
      <button class="btn btn-xs btn-ghost" onclick="rotatePage(${origIdx})" title="${t('Rotate')}">↻</button>
      <button class="btn btn-xs ${isDeleted?'btn-warning':'btn-danger'}" onclick="toggleDelete(${origIdx})" title="${isDeleted?t('Restore'):t('Delete')}">${isDeleted?'↩':'🗑'}</button>
    </div>`;
  div.addEventListener('click',ev=>{
    if(ev.target.closest('.btn')||ev.target.closest('.part-label'))return;
    // In cuts mode: clicking between "last in row" pages could add cuts
    isSelected?S.selected.delete(origIdx):S.selected.add(origIdx);
    renderPageGrid();
  });
  div.addEventListener('dragstart',ev=>{ev.dataTransfer.setData('text/plain',pos);div.classList.add('dragging');});
  div.addEventListener('dragend',()=>div.classList.remove('dragging'));
  div.addEventListener('dragover',ev=>{ev.preventDefault();div.classList.add('drag-over');});
  div.addEventListener('dragleave',()=>div.classList.remove('drag-over'));
  div.addEventListener('drop',ev=>{
    ev.preventDefault();div.classList.remove('drag-over');
    const fromPos=parseInt(ev.dataTransfer.getData('text/plain'));
    const toPos=pos;
    if(fromPos===toPos)return;
    const item=S.pageOrder.splice(fromPos,1)[0];
    S.pageOrder.splice(toPos,0,item);
    renderPageGrid();
  });
  return div;
}

function renderThumb(origIdx){
  if(S.thumbnails[origIdx]){
    const c=G('tc-'+origIdx);
    if(c){const img=new Image();img.onload=()=>{const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);};img.src=S.thumbnails[origIdx];}
    return;
  }
  if(!S.pdfJsDoc)return;
  S.pdfJsDoc.getPage(origIdx+1).then(page=>{
    const vp=page.getViewport({scale:0.25+(S.rotations[origIdx]||0)%180===0?0:0.25});
    const sc=page.getViewport({scale:0.35});
    const offscreen=document.createElement('canvas');
    offscreen.width=sc.width;offscreen.height=sc.height;
    page.render({canvasContext:offscreen.getContext('2d'),viewport:sc}).promise.then(()=>{
      const dataUrl=offscreen.toDataURL('image/jpeg',0.7);
      S.thumbnails[origIdx]=dataUrl;
      const c=G('tc-'+origIdx);
      if(c){const img=new Image();img.onload=()=>{const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);};img.src=dataUrl;}
    });
  }).catch(()=>{});
}

function updateSelCount(){G('sel-count').textContent=t('{n} selected',{n:S.selected.size});}
function selectAll(){S.pageOrder.forEach(i=>S.selected.add(i));renderPageGrid();}
function selectNone(){S.selected.clear();renderPageGrid();}
function invertSel(){S.pageOrder.forEach(i=>S.selected.has(i)?S.selected.delete(i):S.selected.add(i));renderPageGrid();}
function rotatePage(i){S.rotations[i]=((S.rotations[i]||0)+90)%360;renderPageGrid();}
function toggleDelete(i){S.deleted.has(i)?S.deleted.delete(i):S.deleted.add(i);renderPageGrid();}
function deleteSelected(){S.selected.forEach(i=>S.deleted.add(i));S.selected.clear();renderPageGrid();}
function restoreDeleted(){S.deleted.clear();renderPageGrid();}

// ── VISUAL CUTS SYSTEM ──────────────────────────────────────────────
const PART_COLORS=['#0071e3','#34c759','#ff9f0a','#ff3b30','#af52de','#5ac8fa','#ff2d55','#ffcc00','#30b0c7','#a2845e'];

function addCut(afterPos){
  S.cuts.add(afterPos);
  renderPageGrid();
  renderPartsSummary();
}
function removeCut(afterPos){
  S.cuts.delete(afterPos);
  renderPageGrid();
  renderPartsSummary();
}
function clearAllCuts(){
  S.cuts.clear();
  renderPageGrid();
  renderPartsSummary();
}
function getPartsFromCuts(){
  const active=S.pageOrder.filter((_,i)=>!S.deleted.has(S.pageOrder[i]));
  if(!S.cuts.size)return[{pages:active,label:t('All pages')}];
  const sorted=[...S.cuts].sort((a,b)=>a-b);
  const parts=[];
  let start=0;
  for(const cutAfter of sorted){
    const end=cutAfter+1;
    if(end>start){
      const pages=S.pageOrder.slice(start,end).filter(i=>!S.deleted.has(i));
      if(pages.length)parts.push({pages,startPos:start,endPos:end-1});
    }
    start=end;
  }
  // remaining
  const rem=S.pageOrder.slice(start).filter(i=>!S.deleted.has(i));
  if(rem.length)parts.push({pages:rem,startPos:start,endPos:S.pageOrder.length-1});
  return parts.map((p,i)=>({...p,label:t('Part {n}',{n:i+1}),color:PART_COLORS[i%PART_COLORS.length]}));
}
function renderPartsSummary(){
  const el=G('parts-summary');
  const parts=getPartsFromCuts();
  if(parts.length<=1||!S.cuts.size){el.style.display='none';return;}
  el.style.display='';
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:.9rem;font-weight:700;color:var(--text)">✂️ ${t('{n} parts',{n:parts.length})}</span>
      <div class="parts-actions">
        <button class="btn btn-primary btn-sm" onclick="downloadAllParts()">${t('⬇ Download All (ZIP)')}</button>
      </div>
    </div>
    ${parts.map((p,i)=>`
      <div class="part-row">
        <div class="part-dot" style="background:${p.color}"></div>
        <div class="part-info">
          <input class="part-name-input" id="pname-${i}" value="${esc(S.splitFileName||'document')}_part-${i+1}" style="border:1px solid var(--border);border-radius:8px;padding:2px 8px;font-size:.85rem;background:var(--bg-flat);color:var(--text);width:180px;outline:none">
          <div class="part-meta">${t('{n} pages',{n:p.pages.length})} · Pages ${p.pages.map(x=>x+1).join(', ').substring(0,60)}${p.pages.length>8?'…':''}</div>
        </div>
        <button class="part-dl" onclick="downloadPart(${i})">${t('⬇ Download')}</button>
      </div>`).join('')}`;
}
// Quick suggestions
function suggestCutHalf(){
  clearAllCuts();
  const n=S.pageOrder.length;
  if(n<2)return;
  addCut(Math.floor(n/2)-1);
}
function suggestCutThirds(){
  clearAllCuts();
  const n=S.pageOrder.length;
  if(n<3)return;
  addCut(Math.floor(n/3)-1);
  addCut(Math.floor(2*n/3)-1);
}
function suggestCutQuarters(){
  clearAllCuts();
  const n=S.pageOrder.length;
  if(n<4)return;
  for(let i=1;i<4;i++)addCut(Math.floor(i*n/4)-1);
}
function suggestCutEvery(k){
  clearAllCuts();
  const n=S.pageOrder.length;
  for(let i=k;i<n;i+=k)S.cuts.add(i-1);
  renderPageGrid();
  renderPartsSummary();
}
// Download individual part
async function downloadPart(partIndex){
  if(S.busy)return;
  const parts=getPartsFromCuts();
  if(!parts[partIndex])return;
  const p=parts[partIndex];
  setAllBusy(true);showProgress('split',true);setProgress('split',0,1);
  S.startTime=Date.now();
  try{
    const result=await runWorkerTask({
      type:'split',
      buffers:[S.splitFile.slice(0)],
      order:p.pages,
      rotations:Object.assign({},S.rotations),
      deletedArr:[],
      mode:'selected',range:'',every:'',
      PDFLibSrc:PDFLIB_URL
    },[S.splitFile.slice(0)],
    (cur,tot)=>setProgress('split',cur,tot));
    const fname=(G('pname-'+partIndex)?.value||p.label).replace(/\.pdf$/i,'')+'.pdf';
    downloadBytes(result.results[0].bytes,fname);
    toast(t('{name} downloaded ✅',{name:p.label}),'s');
  }catch(err){toast(t('Download failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}
// Download all parts as ZIP
async function downloadAllParts(){
  if(S.busy)return;
  const parts=getPartsFromCuts();
  if(parts.length<2)return;
  setAllBusy(true);showProgress('split',true);
  S.startTime=Date.now();
  try{
    const allResults=[];
    for(let i=0;i<parts.length;i++){
      setProgress('split',i,parts.length);
      const p=parts[i];
      const result=await runWorkerTask({
        type:'split',
        buffers:[S.splitFile.slice(0)],
        order:p.pages,
        rotations:Object.assign({},S.rotations),
        deletedArr:[],
        mode:'selected',range:'',every:'',
        PDFLibSrc:PDFLIB_URL
      },[S.splitFile.slice(0)],()=>{});
      const fname=(G('pname-'+i)?.value||p.label).replace(/\.pdf$/i,'')+'.pdf';
      allResults.push({name:fname,bytes:result.results[0].bytes});
    }
    setProgress('split',parts.length,parts.length);
    await downloadZip(allResults,(S.splitFileName||'split')+'-parts.zip');
    toast(t('Downloaded {n} parts as ZIP ✅',{n:parts.length}),'s');
  }catch(err){toast(t('Download failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

function onSplitModeChange(){
  const m=G('split-mode').value;
  G('fg-range').style.display=m==='range'?'':'none';
  G('fg-every').style.display=m==='every'?'':'none';
  G('cut-suggestions').style.display=m==='cuts'?'':'none';
  G('parts-summary').style.display=(m==='cuts'&&S.cuts.size)?'':'none';
  renderPageGrid();
}
function clearSplit(){
  resetSplitState();
  G('split-controls').style.display='none';
  G('fi-split').value='';
  showProgress('split',false);
}

async function startSplit(){
  if(S.busy||!S.splitFile)return;
  const mode=G('split-mode').value;
  // Handle cuts mode via downloadAllParts
  if(mode==='cuts'){
    if(!S.cuts.size){toast(t('Place at least one ✂️ cut between pages first'),'w');return;}
    await downloadAllParts();
    return;
  }
  let range=G('split-range').value;
  const every=String(clampInt(G('split-every').value,1,9999,2));
  if(mode==='range'){
    range=normalizeRange(range,S.pageOrder.length);
    if(!range){toast(t('Invalid range — use e.g. 1-3,5,7-9 (1-{n})',{n:S.pageOrder.length}),'w');return;}
  }
  let order=S.pageOrder.slice();
  let deletedArr=Array.from(S.deleted);
  if(mode==='selected'){
    order=S.pageOrder.filter(i=>S.selected.has(i)&&!S.deleted.has(i));
    deletedArr=[];
    if(!order.length){toast(t('Select at least one page first'),'w');return;}
  }
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('split',true);
  setProgress('split',0,1);
  try{
    const result=await runWorkerTask({
      type:'split',
      buffers:[S.splitFile.slice(0)],
      order,
      rotations:Object.assign({},S.rotations),
      deletedArr,
      mode,range,every,
      PDFLibSrc:PDFLIB_URL
    },[S.splitFile.slice(0)],
    (cur,tot)=>setProgress('split',cur,tot));
    setProgress('split',1,1);
    if(result.multiple){
      const files=result.results.map((r,i)=>({name:`part-${i+1}.pdf`,bytes:r.bytes}));
      await downloadZip(files,'split-pages.zip');
      toast(t('Split into {n} files — downloading ZIP',{n:files.length}),'s');
    } else {
      downloadBytes(result.results[0].bytes,'split-output.pdf');
      toast(t('Split complete — downloading PDF'),'s');
    }
  }catch(err){toast(t('Split failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

// ══════════════════════════════════════════════════════════════════════
