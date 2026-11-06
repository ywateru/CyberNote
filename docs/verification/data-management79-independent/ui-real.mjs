import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,stat,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {installRealImportBarrier} from './barrier-adapter.mjs';

const [root,binary,output]=process.argv.slice(2).map(x=>resolve(x));
await mkdir(output,{recursive:true});
const {openRuntime,api,idle,state,snapshot}=await import(pathToFileURL(join(root,'scripts/debug/runtime.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(join(root,'scripts/debug/source-identity.mjs')));
const {chooseFiles,tinyPNG}=await import(pathToFileURL(join(root,'scripts/debug/mobile-attachments.mjs')));
const {startSurfaceTrace,stopSurfaceTrace}=await import(pathToFileURL(join(root,'scripts/debug/data-management.mjs')));
const before=await sourceFingerprint(root), started=performance.now(), checks=[],processes=[],details={};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(name,value=true)=>{assert(value,name);checks.push({name,pass:true});};
let rt,barrier;
const save=async(name,value)=>writeFile(join(output,name),JSON.stringify(value,null,2)+'\n');
const command=async(id,args={})=>{const r=await api(rt.page,id,args);await idle(rt.page);return r;};
const ws=async()=>{const row=await rt.backend.call('load_workspace');assert(row.ok,JSON.stringify(row));return row.value;};
const close=async()=>{if(!rt)return;const r=rt;rt=undefined;await r.cleanup({keep:true});processes.push(r.backend.lifecycle);assert.equal(r.backend.lifecycle.exit?.code,0);};
async function setup(name){rt=await openRuntime({root,transport:binary,storeDirectory:join(output,name),keep:true});await rt.page.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);window.__independentDialogs={save:null,open:null,calls:[]};window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='plugin:dialog|save'||command==='plugin:dialog|open'){const key=command.endsWith('|save')?'save':'open';window.__independentDialogs.calls.push({key,args});return window.__independentDialogs[key];}return original(command,args);};});}
const dialog=async(key,path)=>rt.page.evaluate(({key,path})=>window.__independentDialogs[key]=path,{key,path});
const editorSelection=async()=>rt.page.evaluate(()=>{const s=getSelection();return s&&{anchor:s.anchorNode?.parentElement?.tagName,focus:s.focusNode?.parentElement?.tagName,anchorOffset:s.anchorOffset,focusOffset:s.focusOffset,text:s.toString()};});
const capture=async(name)=>{await save(name+'.snapshot.json',await snapshot(rt.page,{selector:'.app',maxChars:60000,maxNodes:240}));await rt.page.screenshot({path:join(output,name+'.png')});};
try{
 await setup('source');
 await command('note.create');await command('editor.insertText',{text:'独审 REAL APP 79 原图与非零音轨'});await command('app.flush');
 await chooseFiles(rt.page,[{name:'独立原图.png',mimeType:'image/png',buffer:tinyPNG}]);await idle(rt.page);
 const wav=Buffer.alloc(44+4800);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(4800,40);for(let i=0;i<2400;i++)wav.writeInt16LE(Math.round(7000*Math.sin(i/24000*880*Math.PI)),44+i*2);
 const raw=rt.backend.call.bind(rt.backend);let delayLoad=false;rt.backend.call=async(c,a)=>{if(delayLoad&&c==='load_workspace')await new Promise(done=>setTimeout(done,150));return raw(c,a);};
 delayLoad=true;await startSurfaceTrace(rt.page);
 await chooseFiles(rt.page,[{name:'独立非零录音.wav',mimeType:'audio/wav',buffer:wav}]);await idle(rt.page);delayLoad=false;
 const trace=await stopSurfaceTrace(rt.page);await save('real-quiet-trace.json',trace);
 check('Real Rust attachment ACK chain preserves Host/editor/old media with zero frame or mutation cover',trace.frames.length>10&&trace.coverFrames===0&&trace.hiddenFrames===0&&trace.changedFrames===0&&!trace.mutations.some(x=>x.cover||x.visibility==='hidden'||!x.sameHost||!x.sameEditor||!x.sameMedia));
 let source=await ws();check('DOM picker created two real Rust originals and confirmed body references',source.attachments.length===2&&source.attachments.every(a=>JSON.stringify(source.notes.find(n=>n.id===a.noteId).document).includes(a.id)));
 const image=source.attachments.find(a=>a.kind==='image'),audio=source.attachments.find(a=>a.kind==='audio');assert(image&&audio);
 const originalDoc=JSON.stringify((await state(rt.page)).editorJSON);
 await command('editor.select',{from:1,to:4});const originalSelection=await editorSelection();assert(originalSelection?.text,'actual noncollapsed DOM editor selection present');
 await dialog('save',null);await command('image.save',{id:image.id});
 check('Real card cancellation produces no export invocation or success notice',rt.backend.calls.filter(x=>x.command==='export_attachment').length===0&&!await rt.page.locator('.image-export-status[role="status"]').count());
 await dialog('save',join(output,'card-original.png'));await command('image.save',{id:image.id});
 check('Actual image-card Rust export has exact original bytes',Buffer.compare(await readFile(join(output,'card-original.png')),tinyPNG)===0);
 check('Actual original-image export preserves editor JSON and selection',JSON.stringify((await state(rt.page)).editorJSON)===originalDoc&&JSON.stringify(await editorSelection())===JSON.stringify(originalSelection));
 await command('image.preview',{id:image.id});await dialog('save',join(output,'preview-original.png'));await rt.page.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(rt.page);
 check('Actual image preview exports original bytes through Rust',Buffer.compare(await readFile(join(output,'preview-original.png')),tinyPNG)===0);await rt.page.getByRole('button',{name:'关闭图片预览',exact:true}).click();
 await command('data.open');await rt.page.waitForSelector('.data-root');
 check('Data management renders exact real Rust directory', (await rt.page.locator('.data-root').innerText()).includes(join(output,'source')));
 const databaseRow=rt.page.locator('[data-file-path="notes.sqlite3"]');check('Database stat DOM equals independently measured real file size',(await databaseRow.innerText()).includes(((await stat(join(output,'source/notes.sqlite3'))).size/1024).toFixed(1)+' KB'));
 check('Management explanation covers saved data, merge copies and settings',/已保存/.test(await rt.page.locator('.data-explanation').first().innerText())&&/冲突保留为副本.*应用备份设置/.test(await rt.page.locator('.data-explanation').first().innerText()));
 await dialog('save',join(output,'row-audio.wav'));await command('data.exportAttachment',{id:audio.id});check('Management audio row exports real nonzero original WAV',Buffer.compare(await readFile(join(output,'row-audio.wav')),wav)===0);
 await dialog('save',join(output,'all.notesbackup'));await rt.page.getByRole('button',{name:'导出完整备份…',exact:true}).click();await idle(rt.page);
 const archive=JSON.parse(await readFile(join(output,'all.notesbackup'),'utf8'));check('Actual management export contains both exact original media',archive.attachments.length===2&&Buffer.compare(Buffer.from(archive.blobs[image.id],'base64'),tinyPNG)===0&&Buffer.compare(Buffer.from(archive.blobs[audio.id],'base64'),wav)===0);
 await capture('source-management');details.source={workspace:source,trace: {frames:trace.frames.length,mutations:trace.mutations.length,coverFrames:trace.coverFrames},calls:rt.backend.calls,pageErrors:rt.errors};check('Source App has no page errors',rt.errors.length===0);await close();

 if(!process.argv.includes('--source-only')) {
 await setup('restored');barrier=installRealImportBarrier(rt);await command('note.create');await command('editor.insertText',{text:'独立目标原有记录保留'});await command('app.flush');const local=(await ws()).notes[0];
 await command('data.open');await rt.page.waitForSelector('.data-root');await dialog('open',join(output,'all.notesbackup'));
 await rt.page.getByRole('button',{name:'导入备份…',exact:true}).click();await idle(rt.page);await rt.page.waitForSelector('.data-root');
 let restored=await ws();await save('real-import-barrier.json',barrier.records);
 check('Production App emitted its own successful ACK then actual Rust Session committed',barrier.records.length===3&&barrier.records[0].kind==='begin'&&barrier.records[1].kind==='app-ack'&&barrier.records[1].success===true&&barrier.records[2].kind==='finish'&&barrier.records[2].phase==='commit'&&barrier.records[2].ok===true);
 check('Real App/Rust import preserves local target and merges source notes/media',restored.notes.length===2&&restored.notes.some(n=>n.id===local.id)&&restored.attachments.length===2);
 for(const a of restored.attachments){const expected=a.kind==='image'?tinyPNG:wav;check('Real App imported exact disk payload '+a.kind,Buffer.compare(await readFile(join(output,'restored/attachments',a.relativePath)),expected)===0);}
 check('Import retained management surface and refreshed real counts',await rt.page.locator('.data-root').count()===1&&(await rt.page.locator('.data-totals').innerText()).includes('备忘录 2'));
 await rt.page.getByRole('button',{name:'关闭数据管理',exact:true}).click();await command('note.select',{id:restored.notes.find(n=>n.id!==local.id).id});await rt.page.waitForSelector('.image-open img');
 const original=restored.attachments.find(a=>a.kind==='image'), originalPath=join(output,'restored/attachments',original.relativePath);const bytes=await readFile(originalPath);await unlink(originalPath);
 await dialog('save',join(output,'must-not-exist.png'));await command('image.save',{id:original.id});
 check('Real missing-file Rust error is visible on card with no output or success',await rt.page.locator('.image-export-status[role="alert"]').count()===1&&!await rt.page.locator('.image-export-status[role="status"]').count());
 await assert.rejects(stat(join(output,'must-not-exist.png')));await writeFile(originalPath,bytes);await dialog('save',join(output,'retry-original.png'));await command('image.save',{id:original.id});check('Restored original may be retried without document mutation',Buffer.compare(await readFile(join(output,'retry-original.png')),tinyPNG)===0);
 await capture('imported-real-app');details.restored={workspace:restored,calls:rt.backend.calls,pageErrors:rt.errors,barrier:barrier.records};check('Restored App has no page errors',rt.errors.length===0);barrier.restore();await close();
 await setup('restored');const reopened=await ws();check('New Rust PID and new App recover confirmed imported media and local note',reopened.notes.length===2&&reopened.attachments.length===2&&reopened.notes.some(n=>n.id===local.id));for(const a of reopened.attachments)check('New PID keeps exact original '+a.kind,Buffer.compare(await readFile(join(output,'restored/attachments',a.relativePath)),a.kind==='image'?tinyPNG:wav)===0);check('Reopened App has no page errors',rt.errors.length===0);await close();

 await setup('negative-ack');await command('note.create');await command('editor.insertText',{text:'NEGATIVE ACK BASELINE 79'});await command('app.flush');
 const baseline=await ws(), negativeRaw=rt.backend.call.bind(rt.backend);let failSave=false,failedWrites=0;
 rt.backend.call=async(c,a)=>{if(failSave&&c==='workspace_action'&&a.action?.type==='saveNote'){failedWrites++;return {ok:false,error:{code:'independent_io_failure',message:'Independent injected disk save failure'},events:[]};}return negativeRaw(c,a);};
 barrier=installRealImportBarrier(rt,{beforeBegin:async()=>{failSave=true;await api(rt.page,'editor.insertText',{text:' UNSAVED-MUST-ABORT79'});}});
 await dialog('open',join(output,'all.notesbackup'));let negativeImport;try{negativeImport=await api(rt.page,'archive.import');}catch(error){negativeImport={error:{code:error.code,message:error.message}};}
 // execute() rejects this expected barrier error; the real protocol records
 // below are the oracle rather than a transient App toast overwritten by sync.
 const unchanged=await ws();await save('negative-ack-barrier.json',barrier.records);
 check('Production App save failure generates its own false ACK and actual Rust abort',failedWrites>0&&barrier.records.some(x=>x.kind==='app-ack'&&x.success===false)&&barrier.records.some(x=>x.kind==='finish'&&x.phase==='abort'&&x.ok===false));
 check('Failed App ACK prevents import and preserves original Rust document/media',JSON.stringify(unchanged.notes)===JSON.stringify(baseline.notes)&&unchanged.attachments.length===baseline.attachments.length);
 check('Failed import reports error with no success result',negativeImport.result?.status==='error'||!!negativeImport.error&&/未确认保存|锁定未执行/.test(negativeImport.error.message));
 details.negative={baseline,unchanged,barrier:barrier.records,failedWrites,reply:negativeImport,pageErrors:rt.errors,calls:rt.backend.calls};await capture('negative-real-app');check('Negative App has no unhandled page errors',rt.errors.length===0);barrier.restore();await close();
 }
}catch(error){details.failure={message:error.message,stack:error.stack};process.exitCode=1;if(rt){try{await capture('failure');details.failure.state=await state(rt.page);details.failure.calls=rt.backend.calls;details.failure.pageErrors=rt.errors;details.failure.barrier=barrier?.records;}catch{};}}
finally{await close();const after=await sourceFingerprint(root);const result={status:process.exitCode?'FAIL':'PASS',sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceBefore:before,sourceAfter:after,sourceUnchanged:before.sha256===after.sha256,binarySha256:sha(await readFile(binary)),runnerSha256:sha(await readFile(new URL(import.meta.url))),checks,processes,details,completeWallMs:performance.now()-started,limits:['Single synthetic browser participant with actual App ACK, Rust Session/Store, file IO. Native dialog/window/device/provider behavior is simulated and not claimed.','Nonzero WAV fixture is added through normal file attachment; no real microphone is used.']};await save('result.json',result);console.log(JSON.stringify({status:result.status,checks:checks.length,processes,completeWallMs:result.completeWallMs,failure:details.failure?.message,sourceUnchanged:result.sourceUnchanged}));}
