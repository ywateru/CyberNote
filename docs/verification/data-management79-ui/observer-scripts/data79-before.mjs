import {openRuntime, idle, saveJSON, snapshot} from '/private/tmp/apple-notes-data79-ui/scripts/debug/runtime.mjs';
import {chooseFiles,tinyPNG} from '/private/tmp/apple-notes-data79-ui/scripts/debug/mobile-attachments.mjs';
const root='/private/tmp/apple-notes-data79-ui',out=root+'/docs/verification/data-management79-ui/before';
const r=await openRuntime({root});
try {
 r.backend.configure({delay:{load:500}});
 await r.page.evaluate(()=>{
  const host=document.querySelector('.editor-scroll:not([hidden])'),editor=host.querySelector('.tiptap');
  window.__flash79={frames:[], mutations:[],host,editor,run:true};
  const sample=(type)=>{const f=window.__flash79;const app=document.querySelector('.app');const node=document.querySelector('.editor-scroll:not([hidden]) .tiptap');const cover=document.querySelector('.access-cover');const row={time:performance.now(),type,cover:!!cover,rootClass:app.className,editorVisibility:getComputedStyle(f.editor).visibility,sameHost:f.host===document.querySelector('.editor-scroll:not([hidden])'),sameEditor:f.editor===node};f[type==='mutation'?'mutations':'frames'].push(row);};
  window.__flash79.observer=new MutationObserver(()=>sample('mutation'));
  window.__flash79.observer.observe(document.querySelector('.app'),{attributes:true,subtree:true,childList:true});
  const tick=()=>{sample('frame');if(window.__flash79.run)requestAnimationFrame(tick);};requestAnimationFrame(tick);
 });
 const adding=chooseFiles(r.page,[{name:'flash79.png',mimeType:'image/png',buffer:tinyPNG}]);
 await r.page.waitForSelector('.access-cover');
 await r.page.screenshot({path:out+'/cover.png'});
 await adding;await idle(r.page);
 const result=await r.page.evaluate(()=>{const f=window.__flash79;f.run=false;f.observer.disconnect();return {frames:f.frames,mutations:f.mutations,coverFrames:f.frames.filter(x=>x.cover).length,hiddenFrames:f.frames.filter(x=>x.editorVisibility==='hidden').length,hostChanged:f.frames.some(x=>!x.sameHost),editorChanged:f.frames.some(x=>!x.sameEditor)};});
 if(!result.coverFrames||!result.hiddenFrames)throw Error('Before observer failed to capture cover');
 await saveJSON(out+'/timeline.json',{...result,pageErrors:r.errors,scope:r.metadata});
 await saveJSON(out+'/after.snapshot.json',await snapshot(r.page,{selector:'.app',maxChars:20000,maxNodes:100}));
 console.log(JSON.stringify({frames:result.frames.length,coverFrames:result.coverFrames,hiddenFrames:result.hiddenFrames,hostChanged:result.hostChanged,editorChanged:result.editorChanged,pageErrors:r.errors}));
} finally {await r.cleanup();}
