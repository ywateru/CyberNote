import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.dirname(new URL(import.meta.url).pathname);
const preflight = JSON.parse(await readFile(path.join(out, 'device-preflight.json'), 'utf8'));
if (!preflight.exact07) throw Error('Exact already-running07 identity required');
const adb = '/Users/water/Library/Android/sdk/platform-tools/adb';
const serial = 'emulator-5580';
const commands = [];
const record = { at: new Date().toISOString(), argv: process.argv, commands,
  scope: 'One read-only DOM geometry collection on existing07 folders page; no input, DOM/style write, bridge, DB, install, start or restart', ready: false };
function run(args) {
  const stdout = execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 15000 });
  commands.push({ argv: [adb, '-s', serial, ...args], exitCode: 0, stdout });
  return stdout;
}
const expression = String.raw`(() => {
  const app = document.querySelector('.app.mobile.page-folders');
  const footer = app?.querySelector('.folder-footer');
  const button = footer?.querySelector('button[aria-label="新建备忘录"]');
  const svg = button?.querySelector('svg');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom }; };
  const visible = (el) => { const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; };
  const overlays = [...document.querySelectorAll('[role="dialog"],[role="menu"],.modal-backdrop,.smart-form-backdrop,.context-menu,.popover')].filter(visible).map(el=>({tag:el.tagName,className:el.className}));
  const folderScroll = app?.querySelector('.folder-list');
  const gate = {url:location.href,readyState:document.readyState,fontsStatus:document.fonts?.status,appClass:app?.className??null,footerVisible:!!footer&&visible(footer),buttonVisible:!!button&&visible(button),svgVisible:!!svg&&visible(svg),visibleOverlays:overlays,documentScrollTop:document.scrollingElement?.scrollTop,folderScrollTop:folderScroll?.scrollTop??null};
  const stable = !!app&&!!svg&&gate.readyState==='complete'&&gate.fontsStatus==='loaded'&&gate.footerVisible&&gate.buttonVisible&&gate.svgVisible&&!overlays.length&&gate.documentScrollTop===0&&(gate.folderScrollTop===null||gate.folderScrollTop===0);
  if (!stable) return {gate,stable:false,reason:'Current page not verified stable folders; no navigation attempted'};
  const props=['display','position','width','height','min-width','max-width','padding-left','padding-right','padding-top','padding-bottom','margin-left','margin-right','border-left-width','border-right-width','box-sizing','align-items','justify-content','gap','flex','flex-shrink','transform','translate','overflow','color','stroke','stroke-width'];
  const node=(el)=>({tag:el.tagName,className:el.getAttribute('class'),rect:rect(el),computed:Object.fromEntries(props.map(k=>[k,getComputedStyle(el).getPropertyValue(k)]))});
  const bbox=(el)=>{const b=el.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height,centerX:b.x+b.width/2,centerY:b.y+b.height/2};};
  const ctm=svg.getScreenCTM();
  return {stable:true,gate,viewport:{innerWidth,innerHeight,devicePixelRatio,visualViewport:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop}:null,screen:{width:screen.width,height:screen.height}},app:node(app),footer:node(footer),button:node(button),svg:{...node(svg),viewBox:svg.getAttribute('viewBox'),bbox:bbox(svg),screenCTM:{a:ctm.a,b:ctm.b,c:ctm.c,d:ctm.d,e:ctm.e,f:ctm.f},paths:[...svg.querySelectorAll('path')].map(p=>({d:p.getAttribute('d'),bbox:bbox(p),rect:rect(p)}))}};
})()`;
let port, ws;
try {
  const pid = run(['shell', 'pidof', 'com.local.notesclone']).trim();
  if (pid !== preflight.pid) throw Error('PID changed; do not attach');
  const socket = 'localabstract:webview_devtools_remote_' + pid;
  port = run(['forward', 'tcp:0', socket]).trim();
  if (!/^\d+$/.test(port)) throw Error('Invalid allocated local forward port');
  const listUrl = 'http://127.0.0.1:' + port + '/json/list';
  const targets = await (await fetch(listUrl, { signal: AbortSignal.timeout(10000) })).json();
  record.targetListRequest = {method:'GET',url:listUrl};
  record.targets = targets;
  const matches = targets.filter(t => t.type==='page' && t.url.startsWith('http://tauri.localhost'));
  if (matches.length !== 1) throw Error('Exact one existing Tauri page required');
  ws = new WebSocket(matches[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;setTimeout(()=>reject(Error('Socket open timeout')),10000).unref();});
  const request = {id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:false,userGesture:false}};
  record.cdpRequest = request;
  const response = await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Read-only CDP timeout')),10000);ws.onmessage=(event)=>{const r=JSON.parse(event.data);if(r.id===1){clearTimeout(timer);resolve(r);}};ws.send(JSON.stringify(request));});
  record.cdpResponse = response;
  if (response.error || response.result?.exceptionDetails) throw Error('Read-only geometry evaluation failed');
  record.geometry = response.result?.result?.value;
  record.ready = record.geometry?.stable === true;
} catch (error) {
  record.error = String(error);
} finally {
  ws?.close();
  if (port) {
    const forwards = run(['forward','--list']);
    const own = forwards.split('\n').find(line=>line.trim()===`${serial} tcp:${port} localabstract:webview_devtools_remote_${preflight.pid}`);
    if (own) {run(['forward','--remove','tcp:'+port]);record.ownedForwardRemoved=true;}
    else record.forwardCleanupBoundary='Allocated forward identity did not match; left untouched';
  }
  record.pidAfter = run(['shell','pidof','com.local.notesclone']).trim();
  record.apkHashAfter = run(['shell','sha256sum',preflight.apkPath]).split(/\s+/)[0];
  record.identityUnchanged = record.pidAfter===preflight.pid && record.apkHashAfter==='e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6';
  record.endedAt = new Date().toISOString();
  await writeFile(path.join(out,'read-only-cdp-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({ready:record.ready,identityUnchanged:record.identityUnchanged,ownedForwardRemoved:record.ownedForwardRemoved,error:record.error,geometry:record.geometry},null,2));
