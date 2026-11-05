import {openRuntime,api,idle,state} from '/private/tmp/apple-notes-mobile-recording-primary73-review01/scripts/debug/runtime.mjs';
import {writeFile} from 'node:fs/promises';
const r=await openRuntime({root:'/private/tmp/apple-notes-mobile-recording-primary73-review01',mobile:true});const {page}=r;const result={checks:[]};
try{
await api(page,'note.select',{id:'note-a'});await api(page,'recording.open');await idle(page);await api(page,'recording.action',{action:'toggle'});await idle(page);await page.evaluate(()=>window.__DEBUG_PLATFORM__.advance(1500));await api(page,'recording.action',{action:'toggle'});await idle(page);await api(page,'recording.action',{action:'finish'});await idle(page);
await page.evaluate(()=>window.__DEBUG_PLATFORM__.configure({delay:{read:600}}));
await api(page,'note.select',{id:'note-b'});await idle(page);await api(page,'note.select',{id:'note-a'});await idle(page);
const selector='.editor-scroll:not([hidden]) .tiptap .audio-title-toggle';
result.beforeClick=await page.evaluate(selector=>({count:document.querySelectorAll(selector).length,src:document.querySelector('.audio-card audio')?.src,html:document.querySelector('.tiptap')?.outerHTML}),selector);
await api(page,'dom.click',{selector});await idle(page);
result.afterClick=await page.evaluate(()=>({titleCount:document.querySelectorAll('.audio-title-toggle').length,inputs:document.querySelectorAll('.editor-scroll:not([hidden]) .tiptap .audio-detail input').length,src:document.querySelector('.audio-card audio')?.src}));
await new Promise(t=>setTimeout(t,750));
result.afterMedia=await page.evaluate(()=>({titleCount:document.querySelectorAll('.audio-title-toggle').length,inputs:document.querySelectorAll('.editor-scroll:not([hidden]) .tiptap .audio-detail input').length,src:document.querySelector('.audio-card audio')?.src}));
try{await api(page,'dom.fill',{selector:'.editor-scroll:not([hidden]) .tiptap .audio-detail input',value:'1'});result.fill='success';}catch(e){result.fill={code:e.code,message:e.message};}
result.pageErrors=r.errors;
}finally{await writeFile('/private/tmp/primary73-remount-proof.json',JSON.stringify(result,null,2));await r.cleanup();}
console.log(JSON.stringify(result,null,2));
