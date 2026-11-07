'use strict';

// EDIT PDF — overlay editor + signature pad
// ══════════════════════════════════════════════════════════════════════
const EDIT_LIMITS={
  maxBytes:300*1024*1024, maxPages:500, maxText:500,
  maxImageBytes:5*1024*1024, maxObjects:600, maxHistory:40,
  maxStrokes:400, maxPoints:2000, maxObjectsPerPage:300,
};
const EDIT_FONT_CSS={
  Helvetica:"Helvetica,Arial,sans-serif",
  TimesRoman:"'Times New Roman',Times,serif",
  Courier:"'Courier New',Courier,monospace",
};
const EDIT_PEN=2.5;
let editRenderToken=0;

function nextEditId(){const E=S.edit;E.seq=(E.seq||1)+1;return 'o'+E.seq;}
function clamp01(v){return Math.min(1,Math.max(0,v));}
function editClamp(v,min,max){return Math.min(max,Math.max(min,v));}

async function loadEditFile(file){
  if(!file||S.busy)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  if(file.size>EDIT_LIMITS.maxBytes)toast(`Large file (${fmtBytes(file.size)}) — editing may be slow`,'w',5000);
  try{
    const pdfDoc=await pdfjsLib.getDocument({data:ab.slice(0)}).promise;
    const n=pdfDoc.numPages;
    if(n>EDIT_LIMITS.maxPages)toast(`${n} pages — editing may be slow beyond ${EDIT_LIMITS.maxPages}`,'w',5000);
    const plan=[];
    for(let i=0;i<n;i++){
      const p=await pdfDoc.getPage(i+1);
      const vp=p.getViewport({scale:1,rotation:p.rotate});
      plan.push({src:i,rot:0,blank:false,w:vp.width,h:vp.height});
    }
    S.edit={
      bytes:ab.slice(0),name:file.name.replace(/\.pdf$/i,''),fileName:file.name,
      pdfDoc,plan,page:0,scale:1,dispW:plan[0]?plan[0].w:612,dispH:plan[0]?plan[0].h:792,
      objects:[],selectedId:null,tool:'select',history:[],future:[],seq:1,
      meta:{},drag:null,textAt:null,textTarget:null,renderTask:null,
    };
    G('edit-workspace').style.display='';
    G('edit-text-panel').style.display='none';
    G('edit-pages-panel').style.display='none';
    G('edit-meta-panel').style.display='none';
    setEditTool('select');
    await renderEditPage(true);
    G('edit-workspace').scrollIntoView({block:'start'});
    toast(`Loaded "${file.name}" — ${n} page${n!==1?'s':''}. Pick a tool to start editing.`,'s');
  }catch(err){toast('Failed to open PDF: '+err.message,'e');}
}

function clearEdit(){
  if(S.busy)return;
  S.edit=null;
  G('edit-workspace').style.display='none';
  G('fi-edit').value='';
  G('fi-edit-image').value='';
  G('edit-layer').innerHTML='';
}

async function renderEditPage(fit){
  const E=S.edit;if(!E)return;
  const entry=E.plan[E.page];if(!entry)return;
  const token=++editRenderToken;
  const stage=G('edit-stage'),canvas=G('edit-canvas'),layer=G('edit-layer');
  const wrap=G('edit-page-wrap');
  let baseW,baseH,rot=0,page=null;

  if(entry.blank){
    baseW=entry.w;baseH=entry.h;
  }else{
    page=await E.pdfDoc.getPage(entry.src+1);
    if(token!==editRenderToken)return;
    rot=(page.rotate+entry.rot)%360;
    const vp=page.getViewport({scale:1,rotation:rot});
    baseW=vp.width;baseH=vp.height;
  }
  if(fit){
    const avail=Math.max(240,stage.clientWidth-40);
    E.scale=editClamp(avail/baseW,.2,2);
  }
  const cssW=Math.max(1,Math.round(baseW*E.scale));
  const cssH=Math.max(1,Math.round(baseH*E.scale));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(cssW*dpr);
  canvas.height=Math.round(cssH*dpr);
  canvas.style.width=cssW+'px';
  canvas.style.height=cssH+'px';
  wrap.style.width=cssW+'px';
  wrap.style.height=cssH+'px';
  layer.style.width=cssW+'px';
  layer.style.height=cssH+'px';

  const ctx=canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if(page){
    if(E.renderTask){try{E.renderTask.cancel();}catch(e){}}
    const vp=page.getViewport({scale:E.scale*dpr,rotation:rot});
    const task=page.render({canvasContext:ctx,viewport:vp});
    E.renderTask=task;
    try{await task.promise;}
    catch(e){if(token!==editRenderToken)return;}
    if(token!==editRenderToken)return;
  }else{
    G('edit-canvas').style.background='#fff';
  }

  E.dispW=baseW;
  E.dispH=baseH;
  G('edit-page-label').textContent=(E.page+1)+' / '+E.plan.length;
  G('edit-zoom-label').textContent=Math.round(E.scale*100)+'%';
  renderEditObjects();
  renderEditProps();
  G('edit-empty').style.display=E.objects.some(o=>o.page===E.page)?'none':'';
  updateEditHistoryButtons();
}

function renderEditObjects(){
  const E=S.edit;if(!E)return;
  const layer=G('edit-layer');
  layer.className='editor-layer tool-'+E.tool;
  layer.innerHTML='';
  E.objects.filter(o=>o.page===E.page).forEach(o=>layer.appendChild(buildEditObject(o)));
}

function buildEditObject(o){
  const E=S.edit;
  const d=document.createElement('div');
  d.className='edit-obj'+(o.id===E.selectedId?' selected':'');
  d.dataset.id=o.id;
  d.style.left=(o.fx*100)+'%';
  d.style.top=(o.fy*100)+'%';
  d.style.width=(o.fw*100)+'%';
  d.style.height=(o.fh*100)+'%';

  const c=document.createElement('div');
  c.className='edit-content';
  if(o.opacity!=null&&o.opacity<1&&o.type!=='cover'&&!(o.type==='highlight'))c.style.opacity=String(o.opacity);
  if(o.type==='text'){
    const t=document.createElement('div');
    t.className='edit-text';
    t.style.fontSize=Math.max(6,o.size*E.scale)+'px';
    t.style.color=o.color;
    t.style.fontFamily=EDIT_FONT_CSS[o.font]||EDIT_FONT_CSS.Helvetica;
    t.textContent=o.text;
    c.appendChild(t);
  }else if(o.type==='sign'||o.type==='image'){
    const img=document.createElement('img');
    img.src=o.src;
    img.alt='';
    c.appendChild(img);
  }else if(o.type==='ink'){
    c.appendChild(buildInkSvg(o));
  }else if(o.type==='highlight'||o.type==='cover'){
    c.style.background=o.type==='cover'?'#ffffff':o.color;
    if(o.type!=='cover')c.style.opacity=String(o.opacity);
  }else{
    c.appendChild(buildShapeSvg(o));
  }
  d.appendChild(c);

  if(o.id===E.selectedId){
    ['nw','ne','sw','se','n','s','w','e'].forEach(h=>{
      const s=document.createElement('div');
      s.className='edit-handle';
      s.dataset.h=h;
      d.appendChild(s);
    });
  }

  d.addEventListener('pointerdown',ev=>editObjectDown(ev,o));
  return d;
}

function buildInkSvg(o){
  const NS='http://www.w3.org/2000/svg';
  const E=S.edit;
  const minSide=Math.min(o.fw*E.dispW,o.fh*E.dispH)*E.scale;
  const strokePx=Math.max(1,(o.sw||.0025)*minSide);
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 1 1');
  svg.setAttribute('preserveAspectRatio','none');
  svg.style.width='100%';svg.style.height='100%';
  svg.style.display='block';svg.style.overflow='visible';
  o.strokes.forEach(st=>{
    if(st.length<2){
      const dot=document.createElementNS(NS,'circle');
      dot.setAttribute('cx',st[0]?st[0].x:.5);
      dot.setAttribute('cy',st[0]?st[0].y:.5);
      dot.setAttribute('r',String(o.sw/2));
      dot.setAttribute('fill',o.color);
      svg.appendChild(dot);
      return;
    }
    const p=document.createElementNS(NS,'path');
    let d='M'+st[0].x.toFixed(4)+' '+st[0].y.toFixed(4);
    for(let i=1;i<st.length;i++)d+=' L'+st[i].x.toFixed(4)+' '+st[i].y.toFixed(4);
    p.setAttribute('d',d);
    p.setAttribute('fill','none');
    p.setAttribute('stroke',o.color);
    p.setAttribute('stroke-width',String(strokePx));
    p.setAttribute('vector-effect','non-scaling-stroke');
    p.setAttribute('stroke-linecap','round');
    p.setAttribute('stroke-linejoin','round');
    svg.appendChild(p);
  });
  return svg;
}

function buildShapeSvg(o){
  const NS='http://www.w3.org/2000/svg';
  const E=S.edit;
  const minSide=Math.min(o.fw*E.dispW,o.fh*E.dispH)*E.scale;
  const sw=Math.max(1,(o.sw||.004)*minSide);
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 1 1');
  svg.setAttribute('preserveAspectRatio','none');
  svg.style.width='100%';svg.style.height='100%';
  svg.style.display='block';svg.style.overflow='visible';
  let el;
  if(o.type==='ellipse'){
    el=document.createElementNS(NS,'ellipse');
    el.setAttribute('cx','0.5');el.setAttribute('cy','0.5');
    el.setAttribute('rx','0.5');el.setAttribute('ry','0.5');
  }else if(o.type==='line'){
    el=document.createElementNS(NS,'line');
    el.setAttribute('x1','0');el.setAttribute('y1',o.rev?'1':'0');
    el.setAttribute('x2','1');el.setAttribute('y2',o.rev?'0':'1');
  }else{
    el=document.createElementNS(NS,'rect');
    el.setAttribute('x','0');el.setAttribute('y','0');
    el.setAttribute('width','1');el.setAttribute('height','1');
  }
  el.setAttribute('fill','none');
  el.setAttribute('stroke',o.color);
  el.setAttribute('stroke-width',String(sw));
  el.setAttribute('vector-effect','non-scaling-stroke');
  svg.appendChild(el);
  return svg;
}

function setEditTool(tool){
  const E=S.edit;
  if(E){
    E.tool=tool;
    E.selectedId=(tool==='select')?E.selectedId:null;
    if(tool!=='select')G('edit-props').style.display='none';
  }
  document.querySelectorAll('#edit-toolbar .tool-btn[data-tool]').forEach(b=>{
    b.classList.toggle('active',b.dataset.tool===tool);
  });
  const layer=G('edit-layer');
  if(layer)layer.className='editor-layer tool-'+tool;
}

function updateEditHistoryButtons(){
  const E=S.edit;
  if(!E)return;
  G('edit-undo').disabled=!E.history.length;
  G('edit-redo').disabled=!E.future.length;
}

function cloneEditObjects(list){
  return list.map(o=>{
    const c=Object.assign({},o);
    if(o.strokes)c.strokes=o.strokes.map(s=>s.map(p=>({x:p.x,y:p.y})));
    return c;
  });
}
function editSnapshot(){
  const E=S.edit;if(!E)return;
  E.history.push(cloneEditObjects(E.objects));
  if(E.history.length>EDIT_LIMITS.maxHistory)E.history.shift();
  E.future=[];
  updateEditHistoryButtons();
}
function editUndo(){
  const E=S.edit;if(!E||!E.history.length)return;
  E.future.push(cloneEditObjects(E.objects));
  E.objects=E.history.pop();
  E.selectedId=null;
  renderEditObjects();renderEditProps();updateEditHistoryButtons();
}
function editRedo(){
  const E=S.edit;if(!E||!E.future.length)return;
  E.history.push(cloneEditObjects(E.objects));
  E.objects=E.future.pop();
  E.selectedId=null;
  renderEditObjects();renderEditProps();updateEditHistoryButtons();
}

function selectedEditObject(){
  const E=S.edit;
  if(!E||!E.selectedId)return null;
  return E.objects.find(o=>o.id===E.selectedId)||null;
}
function selectEditObject(id){
  const E=S.edit;if(!E)return;
  E.selectedId=id||null;
  renderEditObjects();
  renderEditProps();
}

function renderEditProps(){
  const E=S.edit;
  const o=selectedEditObject();
  const box=G('edit-props');
  if(!E||!o||E.tool!=='select'){box.style.display='none';return;}
  box.style.display='';
  G('edit-props-name').textContent=o.type;
  G('edit-opacity').value=String(Math.round((o.opacity==null?1:o.opacity)*100));
  G('edit-color').value=o.color||'#111111';
  const sizeVal=o.type==='text'?o.size:Math.round((o.sw||.0025)*1000);
  G('edit-size').value=String(sizeVal);
  G('edit-size-wrap').style.display=
    (o.type==='text'||o.type==='ink'||o.type==='rect'||o.type==='ellipse'||o.type==='line')?'':'none';
  G('edit-text-btn').style.display=o.type==='text'?'':'none';
  G('edit-color').disabled=(o.type==='cover');
}

function editProp(key,value){
  const o=selectedEditObject();
  if(!o)return;
  if(key==='opacity')o.opacity=editClamp(parseInt(value,10)||100,10,100)/100;
  else if(key==='color'&&o.type!=='cover')o.color=/^#[0-9a-f]{6}$/i.test(value)?value:o.color;
  else if(key==='size'){
    if(o.type==='text')o.size=editClamp(parseInt(value,10)||18,6,96);
    else o.sw=editClamp(parseInt(value,10)||2,1,40)/1000;
  }
  renderEditObjects();
}

function editDeleteSelected(){
  const E=S.edit;const o=selectedEditObject();
  if(!E||!o)return;
  editSnapshot();
  E.objects=E.objects.filter(x=>x.id!==o.id);
  E.selectedId=null;
  renderEditObjects();renderEditProps();
}
function editDuplicateSelected(){
  const E=S.edit;const o=selectedEditObject();
  if(!E||!o)return;
  editSnapshot();
  const c=Object.assign({},o);
  c.id=nextEditId();
  c.fx=clamp01(o.fx+.03);c.fy=clamp01(o.fy+.03);
  if(c.strokes)c.strokes=o.strokes.map(s=>s.map(p=>({x:p.x,y:p.y})));
  E.objects.push(c);
  E.selectedId=c.id;
  renderEditObjects();renderEditProps();
}
function editLayer(dir){
  const E=S.edit;const o=selectedEditObject();
  if(!E||!o)return;
  const i=E.objects.indexOf(o);
  const j=i+dir;
  if(j<0||j>=E.objects.length)return;
  editSnapshot();
  E.objects.splice(i,1);
  E.objects.splice(j,0,o);
  renderEditObjects();
}

// ── Editor pointer interactions ─────────────────────────────────────
function editObjectDown(ev,o){
  const E=S.edit;
  if(!E||S.busy||E.tool!=='select')return;
  ev.preventDefault();
  ev.stopPropagation();
  if(E.selectedId!==o.id){E.selectedId=o.id;renderEditObjects();renderEditProps();}
  const layer=G('edit-layer');
  const rect=layer.getBoundingClientRect();
  const handle=ev.target.classList.contains('edit-handle')?ev.target.dataset.h:null;
  E.drag={
    mode:handle?'resize':'move',handle,id:o.id,
    startX:ev.clientX,startY:ev.clientY,
    fx:o.fx,fy:o.fy,fw:o.fw,fh:o.fh,
    rw:rect.width,rh:rect.height,snapped:false,
  };
  layer.setPointerCapture(ev.pointerId);
}

function editLayerDown(ev){
  const E=S.edit;
  if(!E||S.busy)return;
  const layer=G('edit-layer');
  if(E.tool==='select'){selectEditObject(null);return;}
  const rect=layer.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const x=clamp01((ev.clientX-rect.left)/rect.width);
  const y=clamp01((ev.clientY-rect.top)/rect.height);
  if(E.tool==='text'){openTextPanel(x,y);return;}

  E.drag={
    mode:'create',type:E.tool,x0:x,y0:y,x1:x,y1:y,
    points:[[x,y]],rw:rect.width,rh:rect.height,snapped:false,
  };
  layer.setPointerCapture(ev.pointerId);
  editSnapshot();
  if(E.tool==='ink')layer.appendChild(buildTempInk(E.drag));
  else layer.appendChild(buildTempBox(E.drag));
}

function buildTempBox(drag){
  const d=document.createElement('div');
  d.id='edit-temp';
  d.style.cssText='position:absolute;border:1.5px dashed var(--accent);background:rgba(0,113,227,.08);pointer-events:none;box-sizing:border-box';
  drag.temp=d;
  return d;
}
function buildTempInk(drag){
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.id='edit-temp';
  svg.setAttribute('viewBox','0 0 1 1');
  svg.setAttribute('preserveAspectRatio','none');
  svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
  const p=document.createElementNS(NS,'path');
  p.setAttribute('fill','none');
  p.setAttribute('stroke','#111');
  p.setAttribute('stroke-width','0.004');
  p.setAttribute('stroke-linecap','round');
  p.setAttribute('stroke-linejoin','round');
  svg.appendChild(p);
  drag.tempPath=p;
  return svg;
}

function editLayerMove(ev){
  const E=S.edit;
  if(!E||!E.drag)return;
  const d=E.drag;
  const layer=G('edit-layer');
  if(d.mode==='move'||d.mode==='resize'){
    if(!d.snapped){editSnapshot();d.snapped=true;}
    const dx=(ev.clientX-d.startX)/d.rw;
    const dy=(ev.clientY-d.startY)/d.rh;
    const o=E.objects.find(x=>x.id===d.id);
    if(!o)return;
    if(d.mode==='move'){
      o.fx=editClamp(d.fx+dx,0,1-o.fw);
      o.fy=editClamp(d.fy+dy,0,1-o.fh);
    }else{
      const h=d.handle;
      let fx=d.fx,fy=d.fy,fw=d.fw,fh=d.fh;
      if(h.includes('e'))fw=d.fw+dx;
      if(h.includes('s'))fh=d.fh+dy;
      if(h.includes('w')){fx=d.fx+dx;fw=d.fw-dx;}
      if(h.includes('n')){fy=d.fy+dy;fh=d.fh-dy;}
      fw=editClamp(fw,.02,1);fh=editClamp(fh,.02,1);
      fx=editClamp(fx,0,1-fw);fy=editClamp(fy,0,1-fh);
      if((o.type==='sign'||o.type==='image')&&o.aspect){
        fh=editClamp((fw*E.dispW)/(o.aspect*E.dispH),.02,1);
        if(h.includes('n'))fy=editClamp(d.fy+d.fh-fh,0,1-fh);
      }
      o.fx=fx;o.fy=fy;o.fw=fw;o.fh=fh;
    }
    const node=layer.querySelector('.edit-obj[data-id="'+o.id+'"]');
    if(node){
      node.style.left=(o.fx*100)+'%';
      node.style.top=(o.fy*100)+'%';
      node.style.width=(o.fw*100)+'%';
      node.style.height=(o.fh*100)+'%';
    }
    return;
  }

  // creation
  const rect=layer.getBoundingClientRect();
  d.x1=clamp01((ev.clientX-rect.left)/rect.width);
  d.y1=clamp01((ev.clientY-rect.top)/rect.height);
  if(d.type==='ink'){
    d.points.push([d.x1,d.y1]);
    if(d.tempPath&&d.points.length>1){
      let path='M'+d.points[0][0].toFixed(4)+' '+d.points[0][1].toFixed(4);
      for(let i=1;i<d.points.length;i++)path+=' L'+d.points[i][0].toFixed(4)+' '+d.points[i][1].toFixed(4);
      d.tempPath.setAttribute('d',path);
    }
    return;
  }
  if(d.temp){
    const x=Math.min(d.x0,d.x1),y=Math.min(d.y0,d.y1);
    const w=Math.abs(d.x1-d.x0),h=Math.abs(d.y1-d.y0);
    d.temp.style.left=(x*100)+'%';
    d.temp.style.top=(y*100)+'%';
    d.temp.style.width=(w*100)+'%';
    d.temp.style.height=(h*100)+'%';
  }
}

function editLayerUp(ev){
  const E=S.edit;
  if(!E||!E.drag)return;
  const d=E.drag;
  const temp=G('edit-temp');
  if(temp)temp.remove();
  E.drag=null;
  const layer=G('edit-layer');
  try{layer.releasePointerCapture(ev.pointerId);}catch(e){}

  if(d.mode==='create'){
    if(d.type==='ink')finishInk(d);
    else finishBox(d);
  }
  renderEditObjects();
  renderEditProps();
}

function finishBox(d){
  const E=S.edit;
  const x=Math.min(d.x0,d.x1),y=Math.min(d.y0,d.y1);
  const w=Math.abs(d.x1-d.x0),h=Math.abs(d.y1-d.y0);
  if(w<.005||h<.005){return;}
  if(E.objects.length>=EDIT_LIMITS.maxObjects){toast('Object limit reached','w');return;}
  const type=d.type;
  const o={
    id:nextEditId(),page:E.page,type,
    fx:clamp01(x),fy:clamp01(y),
    fw:editClamp(w,.01,1),fh:editClamp(h,.01,1),
    color:type==='highlight'?'#ffd60a':type==='cover'?'#ffffff':'#0071e3',
    opacity:type==='highlight'?.35:type==='cover'?1:1,
    sw:.004,
  };
  if(type==='line')o.rev=(d.x1-d.x0)*(d.y1-d.y0)<0;
  E.objects.push(o);
  E.selectedId=o.id;
  setEditTool('select');
}

function finishInk(d){
  const E=S.edit;
  if(d.points.length<2){return;}
  const xs=d.points.map(p=>p[0]),ys=d.points.map(p=>p[1]);
  const x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
  const y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  const fw=Math.max(x1-x0,.01),fh=Math.max(y1-y0,.01);
  const strokes=[d.points.map(p=>({x:clamp01((p[0]-x0)/fw),y:clamp01((p[1]-y0)/fh)}))];
  const sw=EDIT_PEN/(fw*d.rw);
  const o={
    id:nextEditId(),page:E.page,type:'ink',
    fx:clamp01(x0),fy:clamp01(y0),fw:editClamp(fw,.01,1),fh:editClamp(fh,.01,1),
    color:'#111111',sw:Math.max(.0015,sw),opacity:1,strokes,
  };
  E.objects.push(o);
  E.selectedId=o.id;
  setEditTool('select');
}

// ── Text object panel ───────────────────────────────────────────────
function openTextPanel(fx,fy){
  const E=S.edit;if(!E)return;
  E.textAt={fx,fy};
  E.textTarget=null;
  G('edit-text-value').value='';
  G('edit-text-add').textContent='Add text';
  G('edit-text-panel').style.display='';
  G('edit-pages-panel').style.display='none';
  G('edit-meta-panel').style.display='none';
  G('edit-text-value').focus();
}
function editCancelText(){
  const E=S.edit;
  if(E){E.textAt=null;E.textTarget=null;}
  G('edit-text-panel').style.display='none';
}
function editEditText(){
  const E=S.edit,o=selectedEditObject();
  if(!E||!o||o.type!=='text')return;
  E.textTarget={id:o.id};
  E.textAt={fx:o.fx,fy:o.fy};
  G('edit-text-value').value=o.text;
  G('edit-text-font').value=o.font;
  G('edit-text-size').value=String(o.size);
  G('edit-text-color').value=o.color;
  G('edit-text-add').textContent='Update text';
  G('edit-text-panel').style.display='';
  G('edit-text-value').focus();
}
function editCommitText(){
  const E=S.edit;if(!E)return;
  const raw=G('edit-text-value').value||'';
  const text=raw.trim().slice(0,EDIT_LIMITS.maxText);
  if(!text){toast('Type some text first','w');return;}
  const size=clampInt(G('edit-text-size').value,6,96,18);
  const font=EDIT_FONT_CSS[G('edit-text-font').value]?G('edit-text-font').value:'Helvetica';
  const color=/^#[0-9a-f]{6}$/i.test(G('edit-text-color').value)?G('edit-text-color').value:'#111111';

  if(E.textTarget){
    const o=E.objects.find(x=>x.id===E.textTarget.id);
    if(o){
      editSnapshot();
      o.text=text;o.size=size;o.font=font;o.color=color;
      E.selectedId=o.id;
    }
  }else{
    if(E.objects.length>=EDIT_LIMITS.maxObjects){toast('Object limit reached','w');return;}
    const at=E.textAt||{fx:.1,fy:.1};
    const fw=.45;
    const charsPerLine=Math.max(8,Math.floor((fw*E.dispW)/(size*.55)));
    const explicit=text.split('\n').length;
    const lines=Math.min(40,Math.max(explicit,Math.ceil(text.length/charsPerLine)));
    const fh=Math.min(.9,(size*1.3*lines)/E.dispH);
    const o={
      id:nextEditId(),page:E.page,type:'text',
      fx:editClamp(at.fx,0,1-fw),fy:editClamp(at.fy,0,1-fh),
      fw,fh,text,size,font,color,opacity:1,
    };
    editSnapshot();
    E.objects.push(o);
    E.selectedId=o.id;
  }
  E.textAt=null;E.textTarget=null;
  G('edit-text-panel').style.display='none';
  setEditTool('select');
  renderEditObjects();renderEditProps();
}

// ── Images and signatures as objects ────────────────────────────────
function readFileAsDataURL(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=()=>rej(new Error('Could not read the image'));
    r.readAsDataURL(file);
  });
}
function loadImageEl(src){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>res(img);
    img.onerror=()=>rej(new Error('Invalid image file'));
    img.src=src;
  });
}
function dataUrlBytes(url){
  const b64=String(url).split(',')[1]||'';
  const bin=atob(b64);
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return arr;
}

function addEditImageObject(src,imgW,imgH,type){
  const E=S.edit;
  if(!E)return;
  if(E.objects.length>=EDIT_LIMITS.maxObjects){toast('Object limit reached','w');return;}
  const aspect=imgW/imgH;
  const defW=type==='sign'?.3:.32;
  let fw=defW;
  let fh=(fw*E.dispW)/(aspect*E.dispH);
  if(fh>.8){fh=.8;fw=(fh*aspect*E.dispH)/E.dispW;}
  fh=editClamp(fh,.02,1);
  const o={
    id:nextEditId(),page:E.page,type,
    fx:editClamp(.5-fw/2,0,1-fw),fy:editClamp(type==='sign'?.72:.5-fh/2,0,1-fh),
    fw:editClamp(fw,.02,1),fh,src,aspect,opacity:1,color:'#111111',
  };
  E.objects.push(o);
  E.selectedId=o.id;
  setEditTool('select');
  renderEditObjects();renderEditProps();
}

async function editAddImage(file){
  const E=S.edit;
  if(!E||!file)return;
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){toast('Use a PNG, JPEG or WebP image','e');G('fi-edit-image').value='';return;}
  if(file.size>EDIT_LIMITS.maxImageBytes){toast(`Image too large (max ${fmtBytes(EDIT_LIMITS.maxImageBytes)})`,'e');G('fi-edit-image').value='';return;}
  try{
    const data=await readFileAsDataURL(file);
    const img=await loadImageEl(data);
    if(img.naturalWidth<32||img.naturalHeight<32){toast('Image is too small (min 32x32 px)','e');G('fi-edit-image').value='';return;}
    const c=document.createElement('canvas');
    c.width=img.naturalWidth;c.height=img.naturalHeight;
    c.getContext('2d').drawImage(img,0,0);
    addEditImageObject(c.toDataURL('image/png'),c.width,c.height,'image');
  }catch(err){toast(err.message,'e');}
  G('fi-edit-image').value='';
}

// ── Signature pad ───────────────────────────────────────────────────
function initSignPad(){
  const c=G('sign-canvas');
  if(!c||c._init)return;
  c._init=true;
  const pos=e=>{
    const r=c.getBoundingClientRect();
    return {x:clamp01((e.clientX-r.left)/r.width),y:clamp01((e.clientY-r.top)/r.height)};
  };
  c.addEventListener('pointerdown',e=>{
    if(!S.signPad)return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    const p=pos(e);
    if(S.signPad.strokes.length>=EDIT_LIMITS.maxStrokes){toast('Too many strokes — use Clear','w');return;}
    S.signPad.cur=[p];
    drawSignPad();
  });
  c.addEventListener('pointermove',e=>{
    if(!S.signPad||!S.signPad.cur)return;
    const p=pos(e);
    const cur=S.signPad.cur;
    const last=cur[cur.length-1];
    if(cur.length<EDIT_LIMITS.maxPoints&&(Math.abs(p.x-last.x)>0.001||Math.abs(p.y-last.y)>0.001))cur.push(p);
    drawSignPad();
  });
  const end=()=>{
    if(!S.signPad||!S.signPad.cur)return;
    if(S.signPad.cur.length>SIGN_MIN_POINTS)S.signPad.strokes.push(S.signPad.cur);
    S.signPad.cur=null;
    drawSignPad();
  };
  c.addEventListener('pointerup',end);
  c.addEventListener('pointercancel',end);
  c.addEventListener('pointerleave',e=>{if(e.buttons===0)end();});
}
const SIGN_MIN_POINTS=3;

function openSignPad(){
  const E=S.edit;
  if(!E){toast('Load a PDF first','w');return;}
  setEditTool('select');
  S.signPad={strokes:[],cur:null,pen:3,color:'#111111'};
  G('sign-modal').style.display='flex';
  const c=G('sign-canvas');
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const r=c.getBoundingClientRect();
  c.width=Math.max(320,Math.round(r.width*dpr));
  c.height=Math.max(110,Math.round(r.height*dpr));
  c.dataset.dpr=String(dpr);
  initSignPad();
  drawSignPad();
  G('sign-pen').value='3';
}

function closeSignPad(){
  G('sign-modal').style.display='none';
  S.signPad=null;
}

function drawSignPad(){
  const c=G('sign-canvas');
  if(!c)return;
  const dpr=parseFloat(c.dataset.dpr)||1;
  const cssW=c.width/dpr,cssH=c.height/dpr;
  const ctx=c.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,c.width,c.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const pen=parseInt(G('sign-pen').value,10)||3;
  if(S.signPad)S.signPad.pen=pen;
  ctx.strokeStyle=S.signPad?S.signPad.color:'#111111';
  ctx.fillStyle=ctx.strokeStyle;
  ctx.lineWidth=pen;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  const lists=S.signPad?S.signPad.strokes.concat(S.signPad.cur?[S.signPad.cur]:[]):[];
  lists.forEach(pts=>drawSignStroke(ctx,pts,cssW,cssH));
}

function drawSignStroke(ctx,pts,cssW,cssH){
  if(!pts.length)return;
  if(pts.length===1){
    ctx.beginPath();
    ctx.arc(pts[0].x*cssW,pts[0].y*cssH,ctx.lineWidth/2,0,Math.PI*2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x*cssW,pts[0].y*cssH);
  for(let i=1;i<pts.length-1;i++){
    const mx=(pts[i].x+pts[i+1].x)/2*cssW;
    const my=(pts[i].y+pts[i+1].y)/2*cssH;
    ctx.quadraticCurveTo(pts[i].x*cssW,pts[i].y*cssH,mx,my);
  }
  const last=pts[pts.length-1];
  ctx.lineTo(last.x*cssW,last.y*cssH);
  ctx.stroke();
}

function signUndo(){
  if(!S.signPad)return;
  if(S.signPad.cur){S.signPad.cur=null;}
  else S.signPad.strokes.pop();
  drawSignPad();
}
function signClear(){
  if(!S.signPad)return;
  S.signPad.strokes=[];
  S.signPad.cur=null;
  drawSignPad();
}

function signApply(){
  const P=S.signPad;
  if(!P){return;}
  const strokes=P.strokes.concat(P.cur?[P.cur]:[]);
  const all=[];
  strokes.forEach(s=>s.forEach(p=>all.push(p)));
  if(all.length<SIGN_MIN_POINTS){toast('Draw your signature first','w');return;}
  const xs=all.map(p=>p.x),ys=all.map(p=>p.y);
  let x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
  let y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  if(x1-x0<.02||y1-y0<.01){toast('Signature is too small — draw a little larger','w');return;}
  const c=G('sign-canvas');
  const dpr=parseFloat(c.dataset.dpr)||1;
  const cssW=c.width/dpr,cssH=c.height/dpr;
  const pad=.02;
  x0=Math.max(0,x0-pad);x1=Math.min(1,x1+pad);
  y0=Math.max(0,y0-pad);y1=Math.min(1,y1+pad);
  const s=800/((x1-x0)*cssW);
  const outW=800;
  const outH=Math.max(40,Math.round((y1-y0)*cssH*s));
  const oc=document.createElement('canvas');
  oc.width=outW;oc.height=outH;
  const ctx=oc.getContext('2d');
  ctx.setTransform(s,0,0,s,-x0*cssW*s,-y0*cssH*s);
  ctx.strokeStyle=P.color;
  ctx.fillStyle=P.color;
  ctx.lineWidth=P.pen;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  strokes.forEach(pts=>drawSignStroke(ctx,pts,cssW,cssH));
  addEditImageObject(oc.toDataURL('image/png'),outW,outH,'sign');
  closeSignPad();
  toast('Signature added — drag it into place, then save','s');
}

// ── Page operations ─────────────────────────────────────────────────
function editPage(delta){
  const E=S.edit;if(!E)return;
  E.page=editClamp(E.page+delta,0,E.plan.length-1);
  renderEditPage(false);
}
function editZoom(dir){
  const E=S.edit;if(!E)return;
  E.scale=editClamp(E.scale*(dir>0?1.2:1/1.2),.2,3);
  renderEditPage(false);
}
function editFit(){renderEditPage(true);}

function shiftEditObjects(fromPage,delta){
  const E=S.edit;
  E.objects.forEach(o=>{if(o.page>=fromPage)o.page+=delta;});
}
function editRotatePage(){
  const E=S.edit;if(!E||S.busy)return;
  const p=E.plan[E.page];
  p.rot=(p.rot+90)%360;
  renderEditPage(false);
  toast('Page rotated 90°','i',1500);
}
function editDuplicatePage(){
  const E=S.edit;if(!E||S.busy)return;
  const i=E.page,p=E.plan[i];
  E.plan.splice(i+1,0,{src:p.src,rot:p.rot,blank:p.blank,w:p.w,h:p.h});
  const clones=E.objects.filter(o=>o.page===i).map(o=>{
    const c=Object.assign({},o);
    c.id=nextEditId();c.page=i+1;
    if(o.strokes)c.strokes=o.strokes.map(s=>s.map(q=>({x:q.x,y:q.y})));
    return c;
  });
  E.objects.forEach(o=>{if(o.page>i)o.page++;});
  E.objects.push.apply(E.objects,clones);
  E.page=i+1;
  renderEditPage(false);
  toast('Page duplicated','s',1500);
}
function editInsertPage(){
  const E=S.edit;if(!E||S.busy)return;
  const i=E.page,p=E.plan[i];
  shiftEditObjects(i+1,1);
  E.plan.splice(i+1,0,{src:null,rot:0,blank:true,w:p.w,h:p.h});
  E.page=i+1;
  renderEditPage(false);
  toast('Blank page inserted','s',1500);
}
function editDeletePage(){
  const E=S.edit;if(!E||S.busy)return;
  if(E.plan.length<=1){toast('A PDF needs at least one page','w');return;}
  const i=E.page;
  E.plan.splice(i,1);
  E.objects=E.objects.filter(o=>o.page!==i);
  E.objects.forEach(o=>{if(o.page>i)o.page--;});
  E.page=Math.min(E.page,E.plan.length-1);
  renderEditPage(false);
  toast('Page deleted','s',1500);
}
function editMovePage(dir){
  const E=S.edit;if(!E||S.busy)return;
  const i=E.page,j=i+dir;
  if(j<0||j>=E.plan.length)return;
  const tmp=E.plan[i];E.plan[i]=E.plan[j];E.plan[j]=tmp;
  E.objects.forEach(o=>{
    if(o.page===i)o.page=j;
    else if(o.page===j)o.page=i;
  });
  E.page=j;
  renderEditPage(false);
}

function editTogglePanel(which){
  const text=G('edit-text-panel'),pages=G('edit-pages-panel'),meta=G('edit-meta-panel');
  text.style.display='none';
  const target=which==='pages'?pages:meta;
  const other=which==='pages'?meta:pages;
  other.style.display='none';
  const show=target.style.display==='none';
  target.style.display=show?'':'none';
  if(show&&which==='meta'){
    const m=S.edit?S.edit.meta:{};
    G('edit-meta-title').value=m.title||'';
    G('edit-meta-author').value=m.author||'';
    G('edit-meta-subject').value=m.subject||'';
    G('edit-meta-keywords').value=m.keywords||'';
  }
}

function readEditMeta(){
  if(!S.edit)return;
  S.edit.meta={
    title:G('edit-meta-title').value.trim().slice(0,200),
    author:G('edit-meta-author').value.trim().slice(0,200),
    subject:G('edit-meta-subject').value.trim().slice(0,200),
    keywords:G('edit-meta-keywords').value.trim().slice(0,300),
  };
}

function hexToPdfRgb(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');
  if(!m)return PDFLib.rgb(0,0,0);
  const n=parseInt(m[1],16);
  return PDFLib.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);
}

async function editPageMapping(E,entry){
  if(entry.blank){
    const w=entry.w,h=entry.h;
    return {rot:0,dispW:w,dispH:h,toPdf:(x,y)=>[x,h-y]};
  }
  const p=await E.pdfDoc.getPage(entry.src+1);
  const rot=(p.rotate+entry.rot)%360;
  const vp=p.getViewport({scale:1,rotation:rot});
  return {rot,dispW:vp.width,dispH:vp.height,toPdf:(x,y)=>vp.convertToPdfPoint(x,y)};
}

async function editSave(){
  const E=S.edit;
  if(!E||S.busy)return;
  readEditMeta();
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('edit',true);
  setProgress('edit',0,E.plan.length);
  try{
    const srcDoc=await PDFLib.PDFDocument.load(E.bytes.slice(0));
    const out=await PDFLib.PDFDocument.create();
    const outPages=[];
    for(let i=0;i<E.plan.length;i++){
      const e=E.plan[i];
      if(e.blank){
        outPages.push(out.addPage([e.w,e.h]));
      }else{
        const copied=await out.copyPages(srcDoc,[e.src]);
        const pg=copied[0];
        const srcRot=srcDoc.getPage(e.src).getRotation().angle||0;
        pg.setRotation(PDFLib.degrees((srcRot+e.rot+360)%360));
        outPages.push(out.addPage(pg));
      }
      setProgress('edit',i+1,E.plan.length);
    }

    const m=E.meta;
    if(m.title)out.setTitle(m.title);
    if(m.author)out.setAuthor(m.author);
    if(m.subject)out.setSubject(m.subject);
    if(m.keywords){
      const kws=m.keywords.split(',').map(s=>s.trim()).filter(Boolean);
      if(kws.length)out.setKeywords(kws);
    }

    const fontCache={};
    const imgCache={};
    for(const obj of E.objects){
      const entry=E.plan[obj.page];
      if(!entry)continue;
      const page=outPages[obj.page];
      if(!page)continue;
      const map=await editPageMapping(E,entry);
      const dx=obj.fx*map.dispW;
      const dy=obj.fy*map.dispH;
      const dw=obj.fw*map.dispW;
      const dh=obj.fh*map.dispH;
      const rot=PDFLib.degrees(-map.rot);
      const color=hexToPdfRgb(obj.color||'#111111');
      const opacity=obj.opacity==null?1:obj.opacity;

      if(obj.type==='sign'||obj.type==='image'){
        if(!obj.src)continue;
        if(!imgCache[obj.src]){
          const bytes=dataUrlBytes(obj.src);
          imgCache[obj.src]=await out.embedPng(bytes);
        }
        const xy=map.toPdf(dx,dy+dh);
        page.drawImage(imgCache[obj.src],{
          x:xy[0],y:xy[1],width:dw,height:dh,rotate:rot,opacity,
        });
      }else if(obj.type==='text'){
        const name=EDIT_FONT_CSS[obj.font]?obj.font:'Helvetica';
        if(!fontCache[name])fontCache[name]=await out.embedFont(PDFLib.StandardFonts[name]);
        const size=obj.size;
        const xy=map.toPdf(dx+1,dy+size*.82);
        page.drawText(obj.text,{
          x:xy[0],y:xy[1],size,font:fontCache[name],color,opacity,
          lineHeight:size*1.25,rotate:rot,maxWidth:Math.max(8,dw-2),
        });
      }else if(obj.type==='highlight'||obj.type==='cover'){
        const xy=map.toPdf(dx,dy+dh);
        page.drawRectangle({
          x:xy[0],y:xy[1],width:dw,height:dh,rotate:rot,
          color:obj.type==='cover'?PDFLib.rgb(1,1,1):color,
          opacity:obj.type==='cover'?1:opacity,
        });
      }else if(obj.type==='rect'){
        const xy=map.toPdf(dx,dy+dh);
        page.drawRectangle({
          x:xy[0],y:xy[1],width:dw,height:dh,rotate:rot,
          borderColor:color,borderWidth:Math.max(.4,(obj.sw||.004)*Math.min(dw,dh)),
          borderOpacity:opacity,
        });
      }else if(obj.type==='ellipse'){
        const xy=map.toPdf(dx+dw/2,dy+dh/2);
        page.drawEllipse({
          x:xy[0],y:xy[1],xScale:dw/2,yScale:dh/2,rotate:rot,
          borderColor:color,borderWidth:Math.max(.4,(obj.sw||.004)*Math.min(dw,dh)),
          borderOpacity:opacity,
        });
      }else if(obj.type==='line'){
        const start=map.toPdf(dx,obj.rev?dy:dy+dh);
        const end=map.toPdf(dx+dw,obj.rev?dy+dh:dy);
        page.drawLine({
          start:{x:start[0],y:start[1]},
          end:{x:end[0],y:end[1]},
          thickness:Math.max(.4,(obj.sw||.004)*Math.min(dw,dh)),
          color,opacity,
        });
      }else if(obj.type==='ink'){
        const thick=Math.max(.4,(obj.sw||.0025)*Math.min(dw,dh));
        (obj.strokes||[]).forEach(st=>{
          if(!st.length)return;
          let prev=map.toPdf(dx+st[0].x*dw,dy+st[0].y*dh);
          for(let i=1;i<st.length;i++){
            const cur=map.toPdf(dx+st[i].x*dw,dy+st[i].y*dh);
            page.drawLine({
              start:{x:prev[0],y:prev[1]},
              end:{x:cur[0],y:cur[1]},
              thickness:thick,color,opacity,
            });
            prev=cur;
          }
        });
      }
    }

    const bytes=await out.save();
    downloadBytes(bytes,(E.name||'document')+'-edited.pdf');
    setProgress('edit',E.plan.length,E.plan.length);
    toast('Saved — downloading your edited PDF','s');
    setTimeout(()=>showProgress('edit',false),1500);
  }catch(err){
    toast('Save failed: '+err.message,'e');
  }finally{
    setAllBusy(false);
  }
}
