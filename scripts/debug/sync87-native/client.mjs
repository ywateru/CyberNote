/** Native acceptance client. Actual DOM/Input; no debug global or document writes. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const exec = promisify(execFile), guardPath = fileURLToPath(new URL('./guard.py', import.meta.url));
export const SERIAL='emulator-5584', AVD='notes-sync87-isolated', PACKAGE='com.local.notesclone';
export const pause = ms => new Promise(r=>setTimeout(r,ms));
export async function guard(operation,args={}) {
  const argv=[guardPath,'--serial',SERIAL,'--avd',AVD,operation];
  for(const [key,value] of Object.entries(args)) argv.push('--'+key,typeof value==='string'?value:JSON.stringify(value));
  const {stdout}=await exec('python3',argv,{timeout:operation==='install'?75000:40000,maxBuffer:10*1024*1024});
  const result=JSON.parse(stdout);assert.equal(result.ok,true);return result.result;
}
export function chooseTarget(targets,port) {
  assert(Array.isArray(targets),'CDP target list required');
  const selected=targets.filter(t=>t.type==='page' && /^https?:\/\/tauri\.localhost\/?(?:\?.*)?$/.test(t.url));
  assert.equal(selected.length,1,'exactly one actual Tauri document page required');
  const target=selected[0],url=new URL(target.webSocketDebuggerUrl);
  assert.equal(url.protocol,'ws:');assert(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(+url.port,port);
  assert.equal(url.pathname,'/devtools/page/'+target.id);assert.equal(url.search,'');assert.equal(url.hash,'');
  assert(/^[A-Za-z0-9-]+$/.test(target.id));return target;
}
export function parseNodes(xml) {
  const decode=s=>s.replace(/&(amp|quot|apos|lt|gt);/g,(_,x)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[x]));
  const nodes=[],stack=[];
  for(const token of xml.matchAll(/<node\b([^>]*)>|<\/node\s*>/g)) {
    if(token[1]===undefined){assert(stack.length,'unbalanced native XML');stack.pop();continue;}
    const attrs=Object.fromEntries([...token[1].matchAll(/([a-z-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])]));
    const bounds=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attrs.bounds||'');
    if(bounds)attrs.rect={x:+bounds[1],y:+bounds[2],width:+bounds[3]-bounds[1],height:+bounds[4]-bounds[2]};
    attrs.nodeIndex=nodes.length;attrs.parentIndex=stack.at(-1)??null;nodes.push(attrs);
    if(!/\/\s*$/.test(token[1]))stack.push(attrs.nodeIndex);
  }
  assert.equal(stack.length,0,'unbalanced native XML');return nodes;
}
export function nativeWebViewRect(nodes) {
  const views=nodes.filter(n=>n.class==='android.webkit.WebView');
  assert(views.length>0,'app WebView rectangle absent');
  for(const view of views){assert.equal(view.package,PACKAGE,'foreign WebView host');assert(view.rect?.width>0&&view.rect.height>0,'invalid WebView rectangle');}
  const first=views[0];
  for(let i=1;i<views.length;i++){
    assert.equal(views[i].parentIndex,views[i-1].nodeIndex,'different WebView hosts');
    assert.deepEqual(views[i].rect,first.rect,'different WebView rectangles');
  }
  return first.rect;
}
export async function nativeNode(match,{hold=false,timeout=12000}={}) {
  const end=Date.now()+timeout;
  while(Date.now()<end){
    const nodes=parseNodes(await guard('uia'));
    const found=nodes.filter(n=>n.rect?.width>0&&n.rect.height>0&&match(n));
    if(found.length===1){const n=found[0];await guard(hold?'hold':'tap',{x:Math.round(n.rect.x+n.rect.width/2),y:Math.round(n.rect.y+n.rect.height/2)});return n;}
    if(found.length>1)throw Error('ambiguous native node');await pause(200);
  }throw Error('native node not found before deadline');
}
export async function connect({receipt,port=19400}) {
  assert(Number.isInteger(port)&&port>=19400&&port<=19419);
  await guard('installed',{receipt});const identity=await guard('identity');
  await guard('forward',{port,'app-identity':identity});
  let socket,closed=false,seq=0;const jobs=new Map(),errors=[];
  const cleanup=async()=>{if(closed)return;closed=true;socket?.close();for(const j of jobs.values()){clearTimeout(j.timer);j.reject(Error('CDP disconnected'));}jobs.clear();await guard('unforward',{port,'app-identity':identity});};
  try{
    const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(10000)});assert(response.ok);
    const target=chooseTarget(await response.json(),port);
    await guard('verify-app',{'app-identity':identity});
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('CDP connect timeout')),10000);socket.onopen=()=>{clearTimeout(timer);r();};socket.onerror=()=>{clearTimeout(timer);j(Error('CDP socket failed'));};});
    socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const j=jobs.get(m.id);if(!j)return;jobs.delete(m.id);clearTimeout(j.timer);m.error?j.reject(Error('CDP '+m.error.code)):j.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push({event:'Runtime.exceptionThrown'});};
    const send=async(method,params={})=>{
      await guard('verify-app',{'app-identity':identity});
      return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout '+method));},15000);jobs.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    };
    const read=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('read-only page evaluation failed');return r.result.value;};
    await send('Runtime.enable');await send('Page.enable');
    assert.equal(await read('location.origin'),'http://tauri.localhost');
    assert.equal(await read('typeof window.__NOTES_DEBUG__'),'undefined','production debug object must be absent');
    assert.equal(await read('localStorage.getItem("notes-browser-preview")'),null,'native app must not be preview fixture');
    const wait=async(predicate,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await read(predicate);if(value)return value;await pause(150);}throw Error('Timed out: '+label);};
    const point=async(selector,text)=>read(`(()=>{const found=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.disabled&&(${JSON.stringify(text===undefined?null:text)}===null||e.textContent.trim()===${JSON.stringify(text===undefined?null:text)})});if(found.length!==1)throw Error('Expected one visible enabled target');found[0].scrollIntoView({block:'nearest',inline:'nearest'});const r=found[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const tap=async(selector,text)=>{const p=await point(selector,text);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
    const nativeTap=async(selector,text)=>{
      const p=await point(selector,text);let xml;
      for(let attempt=0;attempt<2;attempt++){
        try{xml=await guard('uia');break;}
        catch(error){let result;try{result=JSON.parse(error.stdout);}catch{}if(attempt!==0||result?.error!=='Refused'||result.message!=='bounded subprocess failed 137: ')throw error;errors.push({event:'UIA_DUMP_EXIT_137',retry:1});await pause(250);}
      }
      const nodes=parseNodes(xml);const rect=nativeWebViewRect(nodes);
      const viewport=await read('({width:innerWidth,height:innerHeight})');
      await guard('tap',{x:Math.round(rect.x+p.x*rect.width/viewport.width),y:Math.round(rect.y+p.y*rect.height/viewport.height)});
    };
    const insert=async text=>{assert(typeof text==='string'&&text.length<=16384);await send('Input.insertText',{text});};
    const fill=async(selector,text)=>{await tap(selector);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await insert(text);};
    const workspace=()=>read('window.__TAURI_INTERNALS__.invoke("load_workspace")'); // observation only
    const readAttachment=async id=>{
      assert(typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id));
      const w=await workspace(),attachment=w.attachments.find(x=>x.id===id);assert(attachment,'actual attachment missing');
      const access=w.access,noteAccess=access?.notes[attachment.noteId];assert(noteAccess?.authorized,'attachment owner is not authorized');
      const args={id,expected:{sessionId:access.sessionId,epoch:access.epoch,noteEpoch:noteAccess.epoch}};
      return read(`window.__TAURI_INTERNALS__.invoke('read_attachment',${JSON.stringify(args)})`);
    };
    const snapshot=async(directory,name)=>{
      assert(/^[a-z0-9-]+$/.test(name));
      // Refuse screenshots while any invitation field has a value. DOM is cloned and scrubbed separately.
      assert.equal(await read('[...document.querySelectorAll("[data-sensitive]")].some(e=>e.value)'),false,'close pairing UI before evidence');
      const state=await read(`(()=>{const e=document.querySelector('.tiptap'),rect=x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const clone=document.documentElement.cloneNode(true);clone.querySelectorAll('input,textarea,[data-sensitive]').forEach(x=>{x.removeAttribute('value');x.textContent='[redacted]'});return{url:location.href,app:document.querySelector('.app')?.className,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},focused:e===document.activeElement,editor:e?{text:e.innerText,rect:rect(e),html:e.innerHTML}:null,images:[...document.querySelectorAll('.tiptap img')].map(x=>({loaded:x.complete&&x.naturalWidth>0,width:x.naturalWidth,height:x.naturalHeight})),buttons:[...document.querySelectorAll('button')].filter(x=>x.getBoundingClientRect().width>0).map(x=>({label:x.getAttribute('aria-label'),text:x.textContent,rect:rect(x)})),html:clone.outerHTML}})()`);
      const image=await send('Page.captureScreenshot',{format:'png'});
      await writeFile(resolve(directory,name+'.json'),JSON.stringify({...state,identity,serial:SERIAL,avd:AVD,errors},null,2)+'\n');
      await writeFile(resolve(directory,name+'.png'),Buffer.from(image.data,'base64'));return state;
    };
    return {identity,target:{id:target.id,url:target.url},send,read,wait,tap:nativeTap,nativeTap,insert,fill,workspace,readAttachment,snapshot,errors,close:cleanup};
  }catch(error){await cleanup();throw error;}
}
