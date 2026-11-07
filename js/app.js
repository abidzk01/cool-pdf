'use strict';

// ── Editor init and global wiring ────────────────────────────────────
setTheme(S.theme);
onSplitModeChange();
initSignPad();
G('sign-pen').addEventListener('input',drawSignPad);
G('edit-layer').addEventListener('pointerdown',editLayerDown);
G('edit-layer').addEventListener('pointermove',editLayerMove);
G('edit-layer').addEventListener('pointerup',editLayerUp);
G('edit-layer').addEventListener('pointercancel',editLayerUp);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(G('sign-modal').style.display!=='none'){closeSignPad();return;}
    if(S.edit&&S.edit.tool!=='select'){setEditTool('select');return;}
    if(G('edit-text-panel').style.display!=='none'){editCancelText();return;}
  }
  if(!S.edit||S.busy)return;
  const tag=(e.target&&e.target.tagName)||'';
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(tag))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();
    e.shiftKey?editRedo():editUndo();
  }
});

// ── i18n ─────────────────────────────────────────────────────────────
// Called by applyI18n(): re-render the pieces that are built in JS.
function refreshDynamicTranslations(){
  if(S.splitFile){
    renderPageGrid();
    renderPartsSummary();
  }
  if(S.mergeFiles&&S.mergeFiles.length)renderMergeList();
  if(S.edit){
    G('edit-page-label').textContent=(S.edit.page+1)+' / '+S.edit.plan.length;
    renderEditProps();
    const add=G('edit-text-add');
    if(add&&G('edit-text-panel').style.display!=='none'){
      add.textContent=t(S.edit.textTarget?'Update text':'Add text');
    }
  }
}

initLang();
