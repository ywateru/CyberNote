import { openRuntime } from '/private/tmp/apple-notes-sync86-frontend/scripts/debug/runtime.mjs';
const r=await openRuntime();
try {
const p=r.page;
await p.locator('[data-mobile-editor-note="note-a"] .tiptap').focus();
await p.evaluate(()=>{window.focusEvents=[];for(const name of ['blur','focus'])window.addEventListener(name,e=>window.focusEvents.push({name:e.type,trusted:e.isTrusted,target:e.target===window?'window':e.target.tagName}),true)});
console.log('base',await p.evaluate(()=>({has:document.hasFocus(),active:document.activeElement.tagName})));
const q=await p.context().newPage();await q.goto('data:text/html,<input autofocus>');await q.bringToFront();await q.locator('input').focus();
console.log('page2',await p.evaluate(()=>({has:document.hasFocus(),active:document.activeElement.tagName,events:window.focusEvents})));
await q.close();await p.bringToFront();
await p.evaluate(()=>{const f=document.createElement('iframe');f.id='probe';f.srcdoc='<input id="other">';document.body.appendChild(f)});
const f=p.frameLocator('#probe');await f.locator('input').focus();
console.log('iframe',await p.evaluate(()=>({has:document.hasFocus(),active:document.activeElement.tagName,events:window.focusEvents})));
await f.locator('input').evaluate(n=>n.blur());
console.log('iframeblur',await p.evaluate(()=>({has:document.hasFocus(),active:document.activeElement.tagName,events:window.focusEvents})));
await p.evaluate(()=>document.getElementById('probe').remove());
console.log('remove',await p.evaluate(()=>({has:document.hasFocus(),active:document.activeElement.tagName,events:window.focusEvents})));
}finally{await r.cleanup()}
