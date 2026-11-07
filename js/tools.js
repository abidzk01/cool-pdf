'use strict';

// COMPRESS
// ══════════════════════════════════════════════════════════════════════
async function startCompress(file){
  if(!file||S.busy)return;
  let ab;
  try{ab=await readPdfFile(file);}
  catch(err){toast(err.message,'e');return;}
  S.startTime=Date.now();
  setAllBusy(true);
  showProgress('compress',true);
  G('pf-compress').style.width='30%';
  G('ps-compress').textContent='Processing…';
  try{
    const doc=await PDFLib.PDFDocument.load(ab);
    G('pf-compress').style.width='70%';
    const bytes=await doc.save({useObjectStreams:true,addDefaultPage:false});
    G('pf-compress').style.width='100%';
    G('ps-compress').textContent=`${(ab.byteLength/1024).toFixed(0)} KB → ${(bytes.byteLength/1024).toFixed(0)} KB`;
    const saved=ab.byteLength-bytes.byteLength;
    const pct=((saved/ab.byteLength)*100).toFixed(1);
    const baseName=file.name.replace(/\.pdf$/i,'');
    downloadBytes(bytes,baseName+'-compressed.pdf');
    if(saved>0)toast(`Compressed! Saved ${(saved/1024).toFixed(0)} KB (${pct}%)`,'s');
    else toast('Re-saved — this PDF was already optimised (no size reduction)','i');
  }catch(err){toast('Compression failed: '+err.message,'e');}
  finally{setAllBusy(false);}
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
    toast(`Exported ${n} images — downloading ZIP`,'s');
  }catch(err){toast('Export failed: '+err.message,'e');}
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
  toast(`Loaded "${file.name}"`,'s',2000);
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
    toast('Watermark added — downloading PDF','s');
  }catch(err){toast('Watermark failed: '+err.message,'e');}
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
  toast(`Loaded "${file.name}"`,'s',2000);
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
    toast('Page numbers added — downloading PDF','s');
  }catch(err){toast('Failed: '+err.message,'e');}
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
  toast(`Loaded "${file.name}"`,'s',2000);
}

async function startProtect(){
  if(S.busy||!S.protectFile)return;
  const pass=G('prot-pass').value;
  const pass2=G('prot-pass2').value;
  if(!pass){toast('Please enter a password','w');return;}
  if(pass.length>128){toast('Password is too long (max 128 characters)','w');return;}
  if(pass!==pass2){toast('Passwords do not match','e');return;}
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
    toast('PDF protected — downloading','s');
  }catch(err){toast('Protection failed: '+err.message,'e');}
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
  toast(`Loaded "${file.name}"`,'s',2000);
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
    toast('PDF unlocked — downloading','s');
  }catch(err){
    const msg=err.message||'';
    toast(msg.toLowerCase().includes('password')?'Wrong password or not encrypted':'Unlock failed: '+msg,'e');
  }
  finally{setAllBusy(false);}
}

// ── Init ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
