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
