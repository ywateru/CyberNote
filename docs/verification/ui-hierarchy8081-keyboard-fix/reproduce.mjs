import {openRuntime,api,idle,state,snapshot,saveJSON} from '../../../scripts/debug/runtime.mjs';
import {chooseFiles,tinyPNG} from '../../../scripts/debug/mobile-attachments.mjs';
import {sourceFingerprint} from '../../../scripts/debug/source-identity.mjs';
import {resolve} from 'node:path';
const output=resolve('docs/verification/ui-hierarchy8081-keyboard-fix/before');
let runtime;
try {
 runtime=await openRuntime();const {page,backend}=runtime;
 await chooseFiles(page,[{name:'keyboard-before.png',mimeType:'image/png',buffer:tinyPNG}]);await idle(page);
 const id=backend.workspace.attachments[0].id;const before=JSON.stringify((await state(page)).editorJSON);
 await api(page,'image.preview',{id});await idle(page);
 for (const path of [null,'content://synthetic/keyboard-before.png']) {
  await page.evaluate(path=>window.__DEBUG_PLATFORM__.configure({dialog:{save:[path]}}),path);
  await page.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);
 }
 const focus=await page.evaluate(()=>({activeElement:document.activeElement?.tagName,inside:!!document.querySelector('.image-preview')?.contains(document.activeElement)}));
 await page.keyboard.press('Escape');await idle(page);
 const diagnostic={focus,previewCount:await page.locator('.image-preview').count(),documentUnchanged:before===JSON.stringify((await state(page)).editorJSON),exports:backend.exports.length,sourceInputs:await sourceFingerprint(process.cwd())};
 await saveJSON(resolve(output,'diagnostic.json'),diagnostic);await saveJSON(resolve(output,'snapshot.json'),await snapshot(page,{selector:'.app'}));await page.screenshot({path:resolve(output,'screenshot.png')});console.log(JSON.stringify(diagnostic,null,2));
 if(diagnostic.previewCount!==0)throw Error('Export completion loses focus to body; Escape did not close preview');
} catch(error){process.exitCode=1;console.error(String(error));}finally{await runtime?.cleanup();}
