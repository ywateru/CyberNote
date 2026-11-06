import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),output=await mkdtemp('/private/tmp/notes-storage-return-independent-');
const {openRuntime,api,idle}=await import(pathToFileURL(resolve(root,'scripts/debug/runtime.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(resolve(root,'scripts/debug/source-identity.mjs')));
const source=await readFile(resolve(root,'scripts/debug/storage-overview.mjs'),'utf8');
const start=source.indexOf('  const back = async () => {'),end=source.indexOf('  const category = async',start);
assert(start>0&&end>start);const helper=source.slice(start,end);
assert(helper.includes('document.activeElement?.getAttribute("data-storage-category") === source'));
assert(!helper.includes('setTimeout')&&!helper.includes('waitForTimeout'));
const save=(name,value)=>writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n');
const checks=[],started=performance.now(),before=await sourceFingerprint(root);let runtime;
await save('source-before.json',before);await writeFile(resolve(output,'actual-back-helper.txt'),helper);
const check=(label,value)=>{checks.push({label,pass:!!value});assert(value,label);};
try {
 assert.equal(before.sha256,'c04c48d484961b22efa6828ca27e5b4fc183ee5d00b0a8a36c5ba4528aa5029b');
 runtime=await openRuntime({root,mobile:true});const {page}=runtime;
 await page.setViewportSize({width:1280,height:844});await api(page,'data.open');await idle(page);
 // Invoke the exact committed helper without copying its implementation or
 // running the full storage group. The browser scheduler remains unmodified.
 const back=new Function('page',helper+'\nreturn back;')(page);
 await page.evaluate(()=>{window.__independentFocus=[];const original=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(...args){window.__independentFocus.push({t:performance.now(),target:this.outerHTML.slice(0,200),stack:new Error().stack});return original.apply(this,args);};});
 for(const [i,category] of ['all','other','all'].entries()){
  await page.locator(`[data-storage-category="${category}"]`).click();
  await page.waitForSelector(`.data-management[data-storage-view="${category}"]`);
  await back();
  check(`Return ${i+1} helper completes only after exact ${category} source has focus`,await page.evaluate(category=>document.activeElement?.getAttribute('data-storage-category')===category,category));
  const close=page.getByRole('button',{name:'关闭设置',exact:true});await close.focus();await page.keyboard.press('Shift+Tab');
  check(`Return ${i+1} original reverse Tab wraps to visible last summary`,await page.locator('.data-storage-details summary').evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Tab');check(`Return ${i+1} original forward Tab wraps to shared header close`,await close.evaluate(n=>n===document.activeElement));
 }
 check('No uncaught page errors during minimal natural-scheduler verification',runtime.errors.length===0);
 await save('focus-trace.json',await page.evaluate(()=>window.__independentFocus));await writeFile(resolve(output,'preferences.html.txt'),await page.locator('.preferences').evaluate(n=>n.outerHTML));
 const scope=runtime.metadata;await runtime.cleanup();runtime=null;const after=await sourceFingerprint(root);await save('source-after.json',after);
 check('All 126 tracked input bytes remain identical across minimal run',before.sha256===after.sha256);
 await save('result.json',{status:'PASS-FOCUSED-STORAGE-RETURN-ORDER',checks,sourceFingerprint:before.sha256,helperSha256:createHash('sha256').update(helper).digest('hex'),runnerSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),wallSeconds:(performance.now()-started)/1000,scope,limits:['Three exact-helper return/keyboard sequences only; no full storage or attachment suite repetition.','Synthetic browser IPC/storage, unchanged product DOM and natural browser scheduler; no native device or original pixel proof.']});
 console.log(JSON.stringify({output,status:'PASS',checks:checks.length,wallSeconds:(performance.now()-started)/1000}));
}catch(error){await save('failure.json',{message:error.message,stack:error.stack,checks,sourceBefore:before,sourceAfter:await sourceFingerprint(root)});await runtime?.cleanup();console.error(JSON.stringify({output,error:error.message}));process.exitCode=1;}
