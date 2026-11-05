import assert from 'node:assert/strict';
import {openRuntime,api,idle,state,saveJSON} from '../../../../scripts/debug/runtime.mjs';
import {compareSnapshots} from '../../../../scripts/debug/compare.mjs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
const sourceHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();let runtime;
try{
 runtime=await openRuntime({tmp:'/private/tmp'});const page=runtime.page;
 await page.addInitScript(()=>{
  const urls=new Set();window.__reviewUrls=urls;
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=(blob)=>{const url=create(blob);urls.add(url);return url};URL.revokeObjectURL=(url)=>{urls.delete(url);return revoke(url)};
 });
 const mountHTML=(await readFile('docs/verification/app-debug-automation70/independent/mount.html','utf8')).replace('src="./mount.tsx"','src="/docs/verification/app-debug-automation70/independent/mount.tsx"');
 await page.route(runtime.origin+'/review-mount',route=>route.fulfill({contentType:'text/html',body:mountHTML}));
 await page.goto(runtime.origin+'/review-mount');
 await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(page);
 const comparisons=[];const sample={html:'<p>Original</p>',normalizedHTML:'<p>Original</p>',text:'Original',editorJSON:{type:'doc'},nodes:[{tag:'p',text:'Original',rect:{x:1,y:2,width:100,height:20},computed:{color:'rgb(0,0,0)'}},{tag:'b',text:'Second',rect:{x:1,y:22,width:90,height:20},computed:{color:'rgb(0,0,0)'}}]};
 assert(compareSnapshots(sample,structuredClone(sample)).equal);comparisons.push('identical-positive');
 for(const kind of ['text','order','style','rect']){const changed=structuredClone(sample);if(kind==='text')changed.nodes[0].text='Changed';if(kind==='order')changed.nodes.reverse();if(kind==='style')changed.nodes[0].computed.color='rgb(255,0,0)';if(kind==='rect')changed.nodes[0].rect.width+=2;assert(!compareSnapshots(sample,changed).equal);comparisons.push(kind+'-negative');}
 await api(page,'recording.open');await page.waitForFunction(async()=>(await window.__NOTES_DEBUG__.execute('app.state')).result.recording.state?.canToggle);await api(page,'recording.action',{action:'toggle'});await page.waitForSelector('[data-recording-state="recording"]');
 await page.evaluate(()=>window.__DEBUG_PLATFORM__.advance(2000));await api(page,'recording.action',{action:'toggle'});await idle(page);
 const before=await page.evaluate(()=>({tracks:window.__DEBUG_PLATFORM__.trackStops,urls:window.__reviewUrls.size,state:window.__NOTES_DEBUG__.snapshot({selector:'.recording-dock',maxNodes:5,maxChars:1000}).nodes.length}));
 const result=await page.evaluate(async()=>{
  const held=window.__NOTES_DEBUG__;window.__reviewUnmount();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const errors=[];for(const run of [()=>held.list(),()=>held.execute('app.state'),()=>held.snapshot(),()=>held.waitForIdle()]){try{await run();errors.push(null)}catch(e){errors.push(e.code)}}
  return{globalAbsent:!('__NOTES_DEBUG__'in window),errors,tracksStopped:window.__DEBUG_PLATFORM__.trackStops,urlsRemaining:window.__reviewUrls.size,rootChildren:document.querySelector('#root').childElementCount};
 });
 assert(result.globalAbsent&&result.errors.every(x=>x==='UNAVAILABLE')&&result.tracksStopped>0&&result.urlsRemaining===0&&result.rootChildren===0);
 await saveJSON(resolve('docs/verification/app-debug-automation70/independent/cleanup-probe-attempt04.json'),{sourceHead,metadata:runtime.metadata,mount:'Independent entry mounts unchanged actual App in StrictMode and holds only React root to call real unmount; no App source transforms or state injection.',comparisons,before,result});
 console.log(JSON.stringify({sourceHead,comparisons,before,result}));
}finally{await runtime?.cleanup();}
