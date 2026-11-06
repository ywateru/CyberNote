// Run once from the merged main root after its regression/build gates finish.
// All output is written outside Vite until the runtime has been cleaned up.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),destination=resolve(root,'docs/verification/mobile-home8283/screenshots');
const {openRuntime,idle,api,snapshot}=await import(pathToFileURL(resolve(root,'scripts/debug/runtime.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(resolve(root,'scripts/debug/source-identity.mjs')));
const output=await mkdtemp('/private/tmp/notes-mobile-home8283-screenshots-');
const started=performance.now(),before=await sourceFingerprint(root),captures=[];let runtime;
try {
 runtime=await openRuntime({root,mobile:true});const {page,backend}=runtime;
 const samples=[['记下一个想法','今天把零散想法整理在这里。\n快速打开，随手记录，之后再慢慢完善。'],['周末计划','散步、读书，整理书桌。'],['本地附件检查','照片、文件和录音都由现有保存流程管理。\n这条笔记仅展示文字长短不同的卡片。'],['读书摘记','用自己的话复述刚刚读到的内容。'],['一份很长的合成笔记标题用于验证手机两列卡片不会发生横向溢出','标题应当适当截断；正文独立显示，日期只出现一次。\n页面保持阅读顺序。'],['简短记录','下午三点见。'],['下一步','先完成草稿，再回来补充细节。'],['最后一张卡片','可以滚动到添加按钮上方，内容和操作都能到达。']];
 const prototype=backend.workspace.notes[0];
 backend.workspace.notes=samples.map(([title,text],i)=>({...structuredClone(prototype),id:'combined8283-'+i,title,plainText:title+'\n'+text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:title}]},...text.split('\n').map(text=>({type:'paragraph',content:[{type:'text',text}]}))]},updatedAt:1793923200000-i*86400000,pinned:i===0}));
 const capture=async(name,selector)=>{await page.locator('.app').evaluate(n=>n.getAnimations({subtree:true}).forEach(a=>{try{a.finish();}catch{}}));await page.screenshot({path:resolve(output,name+'.png'),animations:'disabled'});await writeFile(resolve(output,name+'.html.txt'),await page.locator(selector).evaluate(n=>n.outerHTML));await writeFile(resolve(output,name+'.snapshot.json'),JSON.stringify(await snapshot(page,{selector,maxChars:30000}),null,2)+'\n');captures.push({name,selector,viewport:page.viewportSize()});};
 for(const theme of ['light','dark']){
  backend.workspace.settings.theme=theme;await page.reload();await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(page);
  await capture('home-390-'+theme,'.notes-pane');await api(page,'note.select',{id:'combined8283-0'});await idle(page);await capture('editor-390-'+theme,'.editor-pane');
 }
 assert.equal(backend.workspace.attachments.length,0);assert.equal(backend.calls.filter(c=>c.command==='read_attachment').length,0);assert.deepEqual(runtime.errors,[]);
 const scope=runtime.metadata;await runtime.cleanup();runtime=null;const after=await sourceFingerprint(root);assert.equal(before.sha256,after.sha256);
 await writeFile(resolve(output,'result.json'),JSON.stringify({status:'PASS-COMBINED-SYNTHETIC-SCREENSHOTS',captures,sourceBefore:before,sourceAfter:after,wallSeconds:(performance.now()-started)/1000,scope,limits:['Eight synthetic Chinese text-only notes, no media payload or private data.','Browser DOM/CSS presentation reference; not native Android IME/provider or original full-window pixel acceptance.']},null,2)+'\n');
 await mkdir(destination,{recursive:true});await cp(output,destination,{recursive:true});console.log(JSON.stringify({status:'PASS',output,destination,captures:captures.length}));
}catch(error){await runtime?.cleanup();await writeFile(resolve(output,'failure.json'),JSON.stringify({error:error.message,stack:error.stack},null,2)+'\n');console.error(JSON.stringify({output,error:error.message}));process.exitCode=1;}
