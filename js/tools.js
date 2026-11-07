'use strict';
// ══════════════════════════════════════════════════════════════════════
// COMPRESS
// ══════════════════════════════════════════════════════════════════════
const COMPRESS_MODES={
  balanced:{dpi:150,quality:.7},
  small:{dpi:100,quality:.55},
};
const COMPRESS_LIMITS={
  maxDpi:200,minDpi:72,maxPixels:32e6,
  qualityFloor:.3,qualityCeil:.92,searchSteps:5,maxMasterPages:300,
};

function compressMode(){return G('compress-mode').value;}

function onCompressModeChange(){
  const mode=compressMode();
  G('fg-compress-target').style.display=mode==='target'?'':'none';
  G('fg-compress-pct').style.display=mode==='percent'?'':'none';
  G('fg-compress-preview').style.display=(mode==='target'||mode==='percent')?'':'none';
  G('compress-warning').style.display=mode==='lossless'?'none':'';
  updateCompressPreview();
}

// Requested output size in bytes for the target/percentage modes.
function compressTargetBytes(){
  const E=S.compressFile;
  const mode=compressMode();
  const pct=clampInt(G('compress-pct').value,5,90,30);
  if(mode==='percent')return E?Math.round(E.ab.byteLength*pct/100):0;
  const value=clampInt(G('compress-target').value,10,2048,300);
  return G('compress-unit').value==='mb'?value*1024*1024:value*1024;
}

function updateCompressPreview(){
  const E=S.compressFile;
  const pct=clampInt(G('compress-pct').value,5,90,30);
  G('compress-pct-value').textContent=pct+'%';
  const mode=compressMode();
  if(mode!=='target'&&mode!=='percent')return;
  const target=compressTargetBytes();
  if(E)G('compress-preview').textContent=fmtBytes(E.ab.byteLength)+' → '+fmtBytes(target);
  else G('compress-preview').textContent=mode==='percent'?t('{n}% of the original size',{n:pct}):fmtBytes(target);
}

async function loadCompressFile(file){
  if(!file||S.busy)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  S.compressFile={name:file.name,ab};
  G('compress-opts').style.display='';
  G('compress-file-info').textContent=file.name+' · '+fmtBytes(ab.byteLength);
  G('fi-compress').value='';
  onCompressModeChange();
  updateCompressPreview();
  toast(t('Loaded "{name}"',{name:file.name}),'s',2000);
}

function clearCompress(){
  S.compressFile=null;
  G('compress-opts').style.display='none';
  G('fi-compress').value='';
  G('compress-file-info').textContent='';
  showProgress('compress',false);
}

function canvasToJpegBytes(canvas,quality){
  return new Promise(resolve=>{
    canvas.toBlob(async blob=>{
      if(!blob){resolve(null);return;}
      resolve(new Uint8Array(await blob.arrayBuffer()));
    },'image/jpeg',quality);
  });
}

function blobToImage(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=()=>resolve({img,url});
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('image decode failed'));};
    img.src=url;
  });
}

// Render every page once at `dpi` and keep it as a JPEG blob (the "master").
// The quality search then only re-encodes these masters, so the PDF is never
// rendered twice for one attempt.
async function renderCompressMasters(pdfDoc,dpi,onProgress){
  const n=pdfDoc.numPages;
  if(n>COMPRESS_LIMITS.maxMasterPages){
    throw new Error(t('This PDF has {n} pages — lossy compression is limited to {max}',{n,max:COMPRESS_LIMITS.maxMasterPages}));
  }
  const masters=[];
  for(let i=1;i<=n;i++){
    const page=await pdfDoc.getPage(i);
    const base=page.getViewport({scale:1,rotation:page.rotate});
    let scale=dpi/72;
    if(base.width*scale*base.height*scale>COMPRESS_LIMITS.maxPixels){
      scale=Math.sqrt(COMPRESS_LIMITS.maxPixels/(base.width*base.height));
    }
    const vp=page.getViewport({scale,rotation:page.rotate});
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(vp.width));
    canvas.height=Math.max(1,Math.ceil(vp.height));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:vp,background:'#ffffff'}).promise;
    const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',COMPRESS_LIMITS.qualityCeil));
    if(!blob)throw new Error(t('Compression failed: ')+'canvas export');
    masters.push({blob,pageW:base.width,pageH:base.height});
    canvas.width=1;canvas.height=1;
    onProgress&&onProgress(i,n);
  }
  return masters;
}

async function assembleCompressedPdf(masters,quality){
  const out=await PDFLib.PDFDocument.create();
  for(const master of masters){
    const decoded=await blobToImage(master.blob);
    const canvas=document.createElement('canvas');
    canvas.width=decoded.img.naturalWidth;
    canvas.height=decoded.img.naturalHeight;
    canvas.getContext('2d').drawImage(decoded.img,0,0);
    URL.revokeObjectURL(decoded.url);
    const bytes=await canvasToJpegBytes(canvas,quality);
    if(!bytes)throw new Error(t('Compression failed: ')+'canvas export');
    const embedded=await out.embedJpg(bytes);
    const page=out.addPage([master.pageW,master.pageH]);
    page.drawImage(embedded,{x:0,y:0,width:master.pageW,height:master.pageH});
    canvas.width=1;canvas.height=1;
  }
  return out.save();
}

// A fitting file always wins; between two that fit, keep the larger (best
// quality); if nothing fits, keep the smallest.
function betterCompressCandidate(candidate,best,target){
  const fits=candidate.bytes.length<=target;
  const bestFits=best.bytes.length<=target;
  if(fits!==bestFits)return fits;
  if(fits&&bestFits)return candidate.bytes.length>best.bytes.length;
  return candidate.bytes.length<best.bytes.length;
}

async function findCompressTarget(ab,target,onProgress){
  const pdfDoc=await pdfjsLib.getDocument({data:ab.slice(0)}).promise;
  const ratio=target/ab.byteLength;
  const preferred=ratio<=.15?72:ratio<=.4?100:ratio<=.7?150:COMPRESS_LIMITS.maxDpi;
  const dpis=[];
  for(const dpi of [preferred,100,COMPRESS_LIMITS.minDpi]){
    if(!dpis.includes(dpi)&&dpi<=COMPRESS_LIMITS.maxDpi)dpis.push(dpi);
  }
  let best=null;
  for(let d=0;d<dpis.length;d++){
    const dpi=dpis[d];
    const masters=await renderCompressMasters(pdfDoc,dpi,(i,total)=>{
      onProgress&&onProgress({phase:'render',dpi,i,total,attempt:d+1,attempts:dpis.length});
    });
    let lo=COMPRESS_LIMITS.qualityFloor,hi=COMPRESS_LIMITS.qualityCeil;
    for(let step=0;step<COMPRESS_LIMITS.searchSteps;step++){
      const quality=(lo+hi)/2;
      const bytes=await assembleCompressedPdf(masters,quality);
      const candidate={bytes,quality,dpi};
      if(!best||betterCompressCandidate(candidate,best,target))best=candidate;
      onProgress&&onProgress({phase:'search',dpi,quality,size:bytes.length,target,step:step+1,steps:COMPRESS_LIMITS.searchSteps,attempt:d+1,attempts:dpis.length});
      if(bytes.length>target)hi=quality;else lo=quality;
      if(Math.abs(bytes.length-target)<target*.03)break;
    }
    if(best&&best.bytes.length<=target&&best.bytes.length>=target*.6)break;
  }
  return {best,target,original:ab.byteLength};
}

async function startCompress(){
  const file=S.compressFile;
  if(!file||S.busy)return;
  const mode=compressMode();
  const original=file.ab.byteLength;
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('compress',true);
  setProgress('compress',0,1);
  G('pf-compress').style.width='5%';
  G('ps-compress').textContent=t('Processing...');
  try{
    let bytes;
    if(mode==='lossless'){
      const doc=await PDFLib.PDFDocument.load(file.ab.slice(0));
      G('pf-compress').style.width='70%';
      bytes=await doc.save({useObjectStreams:true,addDefaultPage:false});
    }else if(mode==='percent'||mode==='target'){
      const target=Math.max(10*1024,Math.min(compressTargetBytes(),original));
      const result=await findCompressTarget(file.ab,target,info=>{
        if(info.phase==='render'){
          setProgress('compress',info.i,info.total);
          G('ps-compress').textContent=t('Rendering page {i}/{total} ({dpi} DPI)',{i:info.i,total:info.total,dpi:info.dpi});
        }else{
          G('ps-compress').textContent=t('Searching quality {q}% · {size}',{q:Math.round(info.quality*100),size:fmtBytes(info.size)});
        }
      });
      if(!result.best)throw new Error(t('Compression failed: ')+'no output');
      bytes=result.best.bytes;
      const base=file.name.replace(/\.pdf$/i,'');
      downloadBytes(bytes,base+'-compressed.pdf');
      setProgress('compress',1,1);
      G('pf-compress').style.width='100%';
      G('ps-compress').textContent=`${(original/1024).toFixed(0)} KB → ${(bytes.byteLength/1024).toFixed(0)} KB`;
      if(bytes.byteLength<=target){
        toast(t('Compressed to {size} (target {target})',{size:fmtBytes(bytes.byteLength),target:fmtBytes(target)}),'s',5000);
      }else{
        toast(t('Could not reach {target} — smallest was {size} at {dpi} DPI',{target:fmtBytes(target),size:fmtBytes(bytes.byteLength),dpi:result.best.dpi}),'w',7000);
      }
      setTimeout(()=>showProgress('compress',false),1500);
      return;
    }else{
      const preset=COMPRESS_MODES[mode]||COMPRESS_MODES.balanced;
      const pdfDoc=await pdfjsLib.getDocument({data:file.ab.slice(0)}).promise;
      const masters=await renderCompressMasters(pdfDoc,preset.dpi,(i,total)=>{
        setProgress('compress',i,total);
        G('ps-compress').textContent=t('Rendering page {i}/{total} ({dpi} DPI)',{i,total,dpi:preset.dpi});
      });
      bytes=await assembleCompressedPdf(masters,preset.quality);
    }
    G('pf-compress').style.width='100%';
    G('ps-compress').textContent=`${(original/1024).toFixed(0)} KB → ${(bytes.byteLength/1024).toFixed(0)} KB`;
    const saved=original-bytes.byteLength;
    const pct=((saved/original)*100).toFixed(1);
    const baseName=file.name.replace(/\.pdf$/i,'');
    downloadBytes(bytes,baseName+'-compressed.pdf');
    if(saved>0)toast(t('Compressed! Saved {kb} KB ({pct}%)',{kb:(saved/1024).toFixed(0),pct}),'s');
    else if(mode==='lossless')toast(t('Re-saved — this PDF was already optimised (no size reduction)'),'i');
    else toast(t('The result is larger than the original ({size}) — try Small or a lower target',{size:fmtBytes(bytes.byteLength)}),'w',6000);
    setTimeout(()=>showProgress('compress',false),1500);
  }catch(err){
    toast(t('Compression failed: ')+err.message,'e');
  }finally{
    setAllBusy(false);
  }
}

// ══════════════════════════════════════════════════════════════════════
// PDF → IMAGES
// ══════════════════════════════════════════════════════════════════════
async function startImages(file){
  if(!file||S.busy)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  const rawScale=parseFloat(G('img-scale').value);
  const scale=[1,1.5,2,3].indexOf(rawScale)!==-1?rawScale:2;
  const fmt=(G('img-format').value==='png')?'png':'jpeg';
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('images',true);
  try{
    const pdfDoc=await pdfjsLib.getDocument({data:ab.slice(0)}).promise;
    const n=pdfDoc.numPages;
    const images=[];
    for(let i=1;i<=n;i++){
      const page=await pdfDoc.getPage(i);
      const vp=page.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=vp.width;canvas.height=vp.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      const mime='image/'+fmt;
      const dataUrl=canvas.toDataURL(mime,0.92);
      const b64=dataUrl.split(',')[1];
      const bin=atob(b64);
      const arr=new Uint8Array(bin.length);
      for(let j=0;j<bin.length;j++)arr[j]=bin.charCodeAt(j);
      images.push({name:`page-${String(i).padStart(3,'0')}.${fmt}`,bytes:arr});
      setProgress('images',i,n);
    }
    const baseName=file.name.replace(/\.pdf$/i,'');
    await downloadZip(images,baseName+'-images.zip');
    toast(t('Exported {n} images — downloading ZIP',{n}),'s');
  }catch(err){toast(t('Export failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

// ══════════════════════════════════════════════════════════════════════
// WATERMARK
// ══════════════════════════════════════════════════════════════════════
async function loadWatermarkFile(file){
  if(!file)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  S.watermarkFile={name:file.name,ab};
  G('watermark-opts').style.display='';
  toast(t('Loaded "{name}"',{name:file.name}),'s',2000);
}

async function startWatermark(){
  if(S.busy||!S.watermarkFile)return;
  const text=(G('wm-text').value||'').trim().slice(0,LIMITS.maxTextLength)||'WATERMARK';
  const fontSize=clampInt(G('wm-size').value,10,200,48);
  const colorHex=/^#[0-9a-f]{6}$/i.test(G('wm-color').value)?G('wm-color').value:'#6366f1';
  const opacity=clampInt(G('wm-opacity').value,5,100,30)/100;
  const position=G('wm-position').value;
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('watermark',true);
  try{
    const doc=await PDFLib.PDFDocument.load(S.watermarkFile.ab.slice(0));
    const pages=doc.getPages();
    const r=parseInt(colorHex.slice(1,3),16)/255;
    const g=parseInt(colorHex.slice(3,5),16)/255;
    const b=parseInt(colorHex.slice(5,7),16)/255;
    for(let i=0;i<pages.length;i++){
      const page=pages[i];
      const {width,height}=page.getSize();
      let x,y,rotate=0;
      if(position==='center'){x=width/2;y=height/2;rotate=PDFLib.degrees(-45);}
      else if(position==='top-left'){x=80;y=height-40;}
      else if(position==='top-right'){x=width-80;y=height-40;}
      else if(position==='bottom-left'){x=80;y=30;}
      else{x=width-80;y=30;}
      page.drawText(text,{
        x,y,size:fontSize,
        color:PDFLib.rgb(r,g,b),
        opacity,
        rotate:PDFLib.degrees(position==='center'?-45:0),
      });
      setProgress('watermark',i+1,pages.length);
    }
    const bytes=await doc.save();
    const baseName=S.watermarkFile.name.replace(/\.pdf$/i,'');
    downloadBytes(bytes,baseName+'-watermarked.pdf');
    toast(t('Watermark added — downloading PDF'),'s');
  }catch(err){toast(t('Watermark failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

// ══════════════════════════════════════════════════════════════════════
// PAGE NUMBERS
// ══════════════════════════════════════════════════════════════════════
async function loadPageNumFile(file){
  if(!file)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  S.pageNumFile={name:file.name,ab};
  G('pagenums-opts').style.display='';
  toast(t('Loaded "{name}"',{name:file.name}),'s',2000);
}

async function startPageNums(){
  if(S.busy||!S.pageNumFile)return;
  const startNum=clampInt(G('pn-start').value,1,99999,1);
  const pos=G('pn-position').value;
  const fontSize=clampInt(G('pn-size').value,6,36,12);
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('pagenums',true);
  try{
    const doc=await PDFLib.PDFDocument.load(S.pageNumFile.ab.slice(0));
    const pages=doc.getPages();
    for(let i=0;i<pages.length;i++){
      const page=pages[i];
      const {width,height}=page.getSize();
      const label=String(startNum+i);
      let x,y;
      const margin=24;
      if(pos==='bottom-center'){x=width/2-fontSize*0.3*label.length;y=margin;}
      else if(pos==='bottom-right'){x=width-margin-fontSize*0.6*label.length;y=margin;}
      else if(pos==='bottom-left'){x=margin;y=margin;}
      else if(pos==='top-center'){x=width/2-fontSize*0.3*label.length;y=height-margin-fontSize;}
      else if(pos==='top-right'){x=width-margin-fontSize*0.6*label.length;y=height-margin-fontSize;}
      else{x=margin;y=height-margin-fontSize;}
      page.drawText(label,{x,y,size:fontSize,color:PDFLib.rgb(0.3,0.3,0.3)});
      setProgress('pagenums',i+1,pages.length);
    }
    const bytes=await doc.save();
    const baseName=S.pageNumFile.name.replace(/\.pdf$/i,'');
    downloadBytes(bytes,baseName+'-numbered.pdf');
    toast(t('Page numbers added — downloading PDF'),'s');
  }catch(err){toast(t('Failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

// ══════════════════════════════════════════════════════════════════════
// PASSWORD PROTECT
// ══════════════════════════════════════════════════════════════════════
async function loadProtectFile(file){
  if(!file)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  S.protectFile={name:file.name,ab};
  G('protect-opts').style.display='';
  toast(t('Loaded "{name}"',{name:file.name}),'s',2000);
}

async function startProtect(){
  if(S.busy||!S.protectFile)return;
  const pass=G('prot-pass').value;
  const pass2=G('prot-pass2').value;
  if(!pass){toast(t('Please enter a password'),'w');return;}
  if(pass.length>128){toast(t('Password is too long (max 128 characters)'),'w');return;}
  if(pass!==pass2){toast(t('Passwords do not match'),'e');return;}
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('protect',true);
  G('pf-protect').style.width='40%';
  try{
    const doc=await PDFLib.PDFDocument.load(S.protectFile.ab.slice(0));
    G('pf-protect').style.width='60%';
    // @cantoo/pdf-lib: encryption is applied via encrypt() (AES-256 by default).
    doc.encrypt({
      userPassword:pass,
      ownerPassword:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),
      permissions:{
        printing:'highResolution',
        modifying:false,
        copying:false,
        annotating:false,
        fillingForms:false,
        contentAccessibility:true,
        documentAssembly:false,
      }
    });
    G('pf-protect').style.width='80%';
    const bytes=await doc.save();
    G('pf-protect').style.width='100%';
    const baseName=S.protectFile.name.replace(/\.pdf$/i,'');
    downloadBytes(bytes,baseName+'-protected.pdf');
    // Clear password fields from DOM after use
    G('prot-pass').value='';G('prot-pass2').value='';
    toast(t('PDF protected — downloading'),'s');
  }catch(err){toast(t('Protection failed: ')+err.message,'e');}
  finally{setAllBusy(false);}
}

// ══════════════════════════════════════════════════════════════════════
// UNLOCK PDF
// ══════════════════════════════════════════════════════════════════════
async function loadUnlockFile(file){
  if(!file)return;
  let ab;
  try{ab=await readPdfFile(file,{allowEncrypted:true});}
  catch(err){toast(err.message,'e');return;}
  S.unlockFile={name:file.name,ab};
  G('unlock-opts').style.display='';
  toast(t('Loaded "{name}"',{name:file.name}),'s',2000);
}

async function startUnlock(){
  if(S.busy||!S.unlockFile)return;
  const pass=G('unlock-pass').value;
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('unlock',true);
  G('pf-unlock').style.width='40%';
  try{
    const doc=await PDFLib.PDFDocument.load(S.unlockFile.ab.slice(0),{password:pass});
    G('pf-unlock').style.width='60%';
    // Rebuild into a fresh document: saving a decrypted doc would keep its
    // /Encrypt dictionary, so copying pages is what actually strips protection.
    const out=await PDFLib.PDFDocument.create();
    const pages=await out.copyPages(doc,doc.getPageIndices());
    pages.forEach(p=>out.addPage(p));
    G('pf-unlock').style.width='80%';
    const bytes=await out.save();
    G('pf-unlock').style.width='100%';
    const baseName=S.unlockFile.name.replace(/\.pdf$/i,'');
    downloadBytes(bytes,baseName+'-unlocked.pdf');
    G('unlock-pass').value='';
    toast(t('PDF unlocked — downloading'),'s');
  }catch(err){
    const msg=err.message||'';
    toast(msg.toLowerCase().includes('password')?t('Wrong password or not encrypted'):t('Unlock failed: ')+msg,'e');
  }
  finally{setAllBusy(false);}
}

// ── Init ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
