// Device-free fixtures execute the production debug runtime and exact fixed JS
// body. They do not claim native dispatch, WebKit, paint or App startup proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {build} from 'vite';
import {safeStartupDiagnostic} from './sync108-native-driver.mjs';

const built=await build({configFile:false,logLevel:'silent',define:{'import.meta.env.DEV':'true','import.meta.env.VITE_NOTES_DEBUG':'"1"'},build:{write:false,minify:false,lib:{entry:resolve('src/debug/runtime.ts'),name:'DebugRuntime',formats:['iife']}}});
const runtime=(Array.isArray(built)?built[0]:built).output[0].code;
const native=await readFile(new URL('../../src-tauri/src/sync_e2e.rs',import.meta.url),'utf8');
const diagnostic=native.match(/const STARTUP_DIAGNOSTIC: &str = r#"([\s\S]*?)"#;/)?.[1];
assert(diagnostic,'Exact native diagnostic body required');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function host(){
 let now=0,serial=0;
 const frames=new Map(),timers=new Map(),events=new Map();
 const sandbox={structuredClone,performance:{now:()=>now},Date:{now:()=>now},
  requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id),
  setInterval:(fn,ms)=>{const id=++serial;timers.set(id,{at:now+ms,fn,interval:ms});return id;},clearInterval:id=>timers.delete(id),
  addEventListener:(event,fn)=>{if(!events.has(event))events.set(event,new Set());events.get(event).add(fn);},removeEventListener:(event,fn)=>events.get(event)?.delete(fn),
 };
 sandbox.window=sandbox;const context=vm.createContext(sandbox);
 return {context,frames,timers,events,now:()=>now,setNow:value=>{now=value;},run:code=>vm.runInContext(code,context),
  async frame(){now+=16;const batch=[...frames];frames.clear();for(const [,fn]of batch)fn(now);await flush();},
  async advance(ms){const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [id,t]=next;now=t.at;if(t.interval)t.at+=t.interval;else timers.delete(id);t.fn();await flush();}now=end;await flush();},
  async emit(event){for(const fn of [...events.get(event)||[]])fn();await flush();},
 };
}
function idleHost(){
 const h=host();let reads=0;
 const state={busy:false,save:{pending:0,queued:0,saving:0,failed:0},error:'',failure:{serial:0,message:''}};
 h.context.adapter={handlers:{'app.state':()=>({safeFixture:true})},state:()=>{reads++;return state;}};
 h.run(runtime);h.run('window.dispose = DebugRuntime.registerDebug(() => adapter)');
 return {...h,state,reads:()=>reads,idle:ms=>h.run(`window.__NOTES_DEBUG__.waitForIdle({timeoutMs:${ms}})`),dispose:()=>h.run('window.dispose()')};
}
function track(promise){const result={settled:false};promise.then(value=>{result.settled=true;result.value=value;},error=>{result.settled=true;result.error=error;});return result;}
const gates=()=>({loading:false,workspaceLoaded:true,syncCover:false,synchronizing:false,editorSatisfied:true,nativeRequired:true,nativeInfoPresent:true,errorPresent:false,startupReady:true});
function diagnosticHost(snapshot={schema:1,gates:gates(),phase:'frame1'}){
 const h=host();let executed=0;
 const root={inert:true,hasAttribute:key=>['inert','aria-hidden','aria-busy'].includes(key)};
 h.context.document={readyState:'complete',visibilityState:'hidden',getElementById:id=>id==='root'?root:id==='startup'?{dataset:{state:'loading'}}:null};
 h.context.__NOTES_DEBUG__={execute:()=>{executed++;throw Error('must not execute');}};
 if(snapshot!==undefined)h.context.__CYBERNOTE_STARTUP_DIAGNOSTIC__=snapshot;
 return {...h,executed:()=>executed,start:()=>h.run(`(async()=>{const deadline=Date.now()+3000;${diagnostic}})()`)};
}

test('timer-only idle requires three fresh actual samples and cleans both scheduling channels',async()=>{
 const h=idleHost(),pending=h.idle(1000),result=track(pending);assert.equal(h.reads(),1);
 await h.advance(50);assert.equal(h.reads(),2);assert(!result.settled);
 await h.advance(50);assert.equal((await pending).idle,true);assert.equal(h.reads(),3);
 assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);h.dispose();
});
test('normal frames win without timer delay; a queued losing timer cannot double-sample',async()=>{
 const h=idleHost(),pending=h.idle(1000),result=track(pending),lateTimer=[...h.timers.values()][0].fn;
 await h.frame();assert.equal(h.reads(),2);lateTimer();await flush();assert.equal(h.reads(),2);assert(!result.settled);
 await h.frame();assert.equal((await pending).idle,true);assert.equal(h.reads(),3);assert.equal(h.now(),32);
 assert.equal(h.frames.size+h.timers.size,0);h.dispose();
});
test('busy, pending and saving remain non-idle until the actual timer-driven timeout',async()=>{
 for(const field of ['busy','pending','saving']){
  const h=idleHost();if(field==='busy')h.state.busy=true;else h.state.save[field]=1;
  const pending=h.idle(125);track(pending);await h.advance(125);
  await assert.rejects(pending,{code:'TIMEOUT'});assert.equal(h.now(),125);assert.equal(h.reads(),3);
  assert.equal(h.frames.size+h.timers.size,0);h.dispose();
 }
});
test('intermediate pending resets three-sample stability and settled failures remain errors',async()=>{
 const h=idleHost(),pending=h.idle(500),result=track(pending);
 h.state.save.pending=1;await h.advance(50);h.state.save.pending=0;
 await h.advance(100);assert(!result.settled);await h.advance(50);assert.equal((await pending).idle,true);assert.equal(h.reads(),5);h.dispose();
 for(const field of ['failed','error']){
  const h=idleHost(),p=h.idle(500);track(p);
  if(field==='failed')h.state.save.failed=1;else h.state.error='fixture retained error';
  await h.advance(50);await assert.rejects(p,{code:'APP_ERROR'});assert.equal(h.frames.size+h.timers.size,0);h.dispose();
 }
 const busy=idleHost();busy.state.busy=true;busy.state.save.failed=1;
 const retry=busy.idle(500);track(retry);await busy.advance(50);busy.state.busy=false;
 await busy.advance(50);await assert.rejects(retry,{code:'APP_ERROR'});busy.dispose();
});
test('dispose rejects and clears each pending idle call; late callbacks cannot revive them',async()=>{
 const h=idleHost(),a=h.idle(500),b=h.idle(500);track(a);track(b);
 const late=[...h.frames.values(),...[...h.timers.values()].map(t=>t.fn)];
 h.dispose();await assert.rejects(a,{code:'UNAVAILABLE'});await assert.rejects(b,{code:'UNAVAILABLE'});
 const reads=h.reads();for(const fn of late)fn();await flush();assert.equal(h.reads(),reads);assert.equal(h.frames.size+h.timers.size,0);
});
test('execute retains both real frame barriers; timer-only idle times out while execute is active',async()=>{
 const h=idleHost(),command=h.run('window.__NOTES_DEBUG__.execute("app.state")'),completed=track(command);await flush();
 const pending=h.idle(200);track(pending);await h.advance(200);await assert.rejects(pending,{code:'TIMEOUT'});assert(!completed.settled);
 await h.frame();assert(!completed.settled);await h.frame();await command;
 const idle=h.idle(500);await h.advance(100);assert.equal((await idle).idle,true);h.dispose();
});
test('a sample read crossing the deadline cannot count as late idle success',async()=>{
 const h=idleHost();let reads=0;h.context.adapter.state=()=>{if(++reads===3)h.setNow(1001);return h.state;};
 const pending=h.idle(1000);track(pending);await h.frame();await h.frame();await assert.rejects(pending,{code:'TIMEOUT'});h.dispose();
});

test('fixed diagnostic reads committed gates directly with no command or readiness mutation and cleans no-frame sampling',async()=>{
 const h=diagnosticHost(),before=structuredClone(h.context.__CYBERNOTE_STARTUP_DIAGNOSTIC__),pending=h.start();
 await h.advance(350);const value=await pending;
 assert.equal(value.renderClock.raf,0);assert.equal(value.renderClock.timer,14);assert.equal(value.renderClock.elapsedMs,350);
 assert.equal(value.startupSnapshot.phase,'frame1');assert.equal(value.startupSnapshot.gates.startupReady,true);
 assert.equal(value.root.inert,true);assert.equal(value.startup,'loading');assert.equal(h.executed(),0);
 assert.deepEqual(h.context.__CYBERNOTE_STARTUP_DIAGNOSTIC__,before);assert.equal(h.frames.size+h.timers.size,0);assert.equal(h.events.get('pagehide').size,0);
 const safe=safeStartupDiagnostic({...JSON.parse(JSON.stringify(value)),nativeWindow:{visible:true,minimized:false,focused:null}});assert.equal(safe.nativeWindow.focused,null);
});
test('missing or malformed committed snapshot remains null and arbitrary DOM/provider text cannot escape',async()=>{
 for(const snapshot of [null,{}, {schema:2,gates:gates(),phase:'ready'}, {schema:1,gates:{...gates(),startupReady:'true'},phase:'ready'}, {schema:1,gates:gates(),phase:'private-sentinel'}, {schema:1,gates:{...gates(),body:'private-sentinel'},phase:'ready'}]){
  const h=diagnosticHost(snapshot);h.context.document.getElementById=id=>id==='startup'?{dataset:{state:'private-sentinel'}}:null;
  const pending=h.start();await h.advance(350);const value=await pending;
  assert.equal(value.startupSnapshot,null);assert.equal(value.startup,'present');assert(!JSON.stringify(value).includes('private-sentinel'));assert.equal(h.executed(),0);
 }
 const missing=diagnosticHost();delete missing.context.__CYBERNOTE_STARTUP_DIAGNOSTIC__;
 const pending=missing.start();await missing.advance(350);assert.equal((await pending).startupSnapshot,null);
});
test('fixed diagnostic cancels timer/frame/listener on pagehide and ignores queued late callbacks',async()=>{
 const h=diagnosticHost(),pending=h.start(),lateFrame=[...h.frames.values()][0];
 await h.frame();await h.advance(50);await h.emit('pagehide');const value=await pending;
 const raf=value.renderClock.raf;lateFrame();await h.advance(1000);
 assert.equal(value.cancelled,true);assert.equal(value.startupSnapshot,null);assert.equal(value.renderClock.raf,raf);
 assert.equal(h.frames.size+h.timers.size,0);assert.equal(h.events.get('pagehide').size,0);
});
test('driver refuses malformed finite diagnostic schemas without retaining raw text',async()=>{
 const h=diagnosticHost(),pending=h.start();await h.advance(350);const value={...JSON.parse(JSON.stringify(await pending)),nativeWindow:{visible:true,minimized:false,focused:false}};
 assert.doesNotThrow(()=>safeStartupDiagnostic(value));
 for(const change of [v=>v.url='private-sentinel',v=>v.readyState='private-sentinel',v=>v.renderClock.timer=-1,v=>v.root.ariaHidden='private-sentinel',v=>v.nativeWindow.visible='private-sentinel',v=>v.startupSnapshot.gates.loading='private-sentinel']){
  const invalid=structuredClone(value);change(invalid);assert.throws(()=>safeStartupDiagnostic(invalid),{code:'INVALID_DIAGNOSTIC'});
 }
});
