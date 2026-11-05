import {openRuntime,api,idle,state,snapshot,saveJSON} from '/private/tmp/apple-notes-android-attachments75-01/scripts/debug/runtime.mjs';
const out='/private/tmp/apple-notes-android-attachments75-01/docs/verification/android-attachments75/before';
const rt=await openRuntime({root:'/private/tmp/apple-notes-android-attachments75-01',mobile:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
try {
 await api(rt.page,'note.select',{id:'note-a'}); await idle(rt.page);
 rt.backend.configure({delay:{read:650}});
 const fc=rt.page.waitForEvent('filechooser'); await api(rt.page,'attachment.choose',{kind:'file'}); await (await fc).setFiles([{name:'a.png',mimeType:'image/png',buffer:png},{name:'b.png',mimeType:'image/png',buffer:png}]);
 await idle(rt.page); await rt.page.waitForTimeout(1200);
 await saveJSON(out+'/multi-image.json',{state:await state(rt.page),snapshot:await snapshot(rt.page,{selector:'.app',maxChars:24000,maxNodes:100}),calls:rt.backend.calls,pageErrors:rt.errors}); await rt.page.screenshot({path:out+'/multi-image.png'});
 await rt.reset(); await api(rt.page,'note.select',{id:'note-a'}); await idle(rt.page);
 const fc2=rt.page.waitForEvent('filechooser'); await api(rt.page,'attachment.choose',{kind:'file'}); await (await fc2).setFiles({name:'empty-type.png',mimeType:'',buffer:png}); await idle(rt.page); await rt.page.waitForTimeout(200);
 await saveJSON(out+'/empty-mime.json',{state:await state(rt.page),snapshot:await snapshot(rt.page,{selector:'.app',maxChars:16000,maxNodes:70}),calls:rt.backend.calls,pageErrors:rt.errors}); await rt.page.screenshot({path:out+'/empty-mime.png'});
 console.log(JSON.stringify({multi:out+'/multi-image.json',emptyMime:out+'/empty-mime.json'}));
}finally{await rt.cleanup();}
