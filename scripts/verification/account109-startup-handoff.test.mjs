import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

// Use Vite's own compiler dependency; no additional install or package change.
const require=createRequire(import.meta.url);
const {transformSync}=createRequire(require.resolve('vite'))('esbuild');

// A hook-only real React root needs a host container but no browser, app, IPC or
// workspace. Mutation-free components below return null; effects commit for real.
class HostElement {
  constructor() { this.nodeType=1; this.tagName='DIV'; this.namespaceURI='http://www.w3.org/1999/xhtml'; this.style={}; this.ownerDocument=hostDocument; }
  addEventListener() {} removeEventListener() {} setAttribute() {} removeAttribute() {}
}
const hostDocument={nodeType:9,addEventListener(){},removeEventListener(){},createElement:()=>new HostElement(),activeElement:null};
const hostWindow={document:hostDocument,HTMLElement:HostElement,HTMLIFrameElement:class {},addEventListener(){},removeEventListener(){}};
globalThis.window=hostWindow; globalThis.document=hostDocument;
hostDocument.defaultView=hostWindow; hostDocument.body=new HostElement();
const React=await import('react');
const {createRoot}=await import('react-dom/client');
const {flushSync}=await import('react-dom');

const source=readFileSync(new URL('../../src/startup.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
const splash=readFileSync(new URL('../../public/startup.js',import.meta.url),'utf8');
const start=app.indexOf('  const startupReady = ');
const marker='  }, [startupReady, loading, workspaceLoaded, syncError, error]);';
const end=app.indexOf(marker,start)+marker.length;
assert(start>0 && end>start);
const appEffects=app.slice(start,end);
const defaults={loading:false,workspaceLoaded:true,syncCover:false,synchronizing:false,current:null,
  unlocked:new Set(),editor:null,native:true,macNative:true,mobile:false,nativeInfo:{},error:'',syncError:''};

function setup(t,options={}) {
  const {dev=true,strict=false,reduced=false,passiveCounterexample=false}=options;
  const debug=Object.hasOwn(options,'debug')?options.debug:'1';
  let sequence=0,now=0,readyCalls=0,failCalls=0,unmounted=false;
  const frames=new Map(),timers=new Map(),publications=[];
  const element=(attrs={})=>({attrs:{...attrs},dataset:{},inert:'inert' in attrs,hidden:true,removed:false,
    addEventListener(){},removeEventListener(){},setAttribute(k,v){this.attrs[k]=v;},
    removeAttribute(k){delete this.attrs[k];if(k==='inert')this.inert=false;},remove(){this.removed=true;}});
  const nodes={startup:element({'aria-busy':'true'}),root:element({inert:'','aria-hidden':'true','aria-busy':'true'}),
    'startup-message':element(),'startup-retry':element()};
  nodes.startup.dataset.state='loading';
  const page=new Proxy({addEventListener(){},removeEventListener(){}},{set(target,key,value){
    if(key==='__CYBERNOTE_STARTUP_DIAGNOSTIC__')publications.push(value);
    target[key]=value;return true;
  }});
  const context=vm.createContext({module:{exports:{}},window:page,
    document:{documentElement:{dataset:{}},getElementById:id=>nodes[id]},
    localStorage:{getItem:()=>null,setItem(){}},location:{reload(){}},ErrorEvent:class {},matchMedia:()=>({matches:reduced}),
    requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,{fn,cancelled:false,ran:false});return id;},
    cancelAnimationFrame:id=>{const item=frames.get(id);if(item)item.cancelled=true;},
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms,at:now+ms,cancelled:false,ran:false});return id;},
    clearTimeout:id=>{const item=timers.get(id);if(item)item.cancelled=true;},
    useLayoutEffect:React.useLayoutEffect,useEffect:React.useEffect,
  });
  vm.runInContext(splash,context,{timeout:1000});
  const originalReady=page.__CYBERNOTE_STARTUP__.ready,originalFail=page.__CYBERNOTE_STARTUP__.fail;
  page.__CYBERNOTE_STARTUP__.ready=()=>{readyCalls++;originalReady();};
  page.__CYBERNOTE_STARTUP__.fail=()=>{failCalls++;originalFail();};
  const compiled=transformSync(source,{loader:'ts',format:'cjs',minify:true,define:{
    'import.meta.env.DEV':JSON.stringify(dev),'import.meta.env.VITE_NOTES_DEBUG':debug===undefined?'undefined':JSON.stringify(debug),
  }}).code;
  vm.runInContext(compiled,context,{timeout:1000});
  context.startup=context.module.exports.startup;
  const effects=passiveCounterexample
    ? appEffects.replace('useLayoutEffect(() => {\n    if (!loading','useEffect(() => {\n    if (!loading')
    : appEffects;
  if(passiveCounterexample)assert.notEqual(effects,appEffects);
  const Component=vm.runInContext(`(function StartupCommit(props) {
    const {loading,workspaceLoaded,syncCover,synchronizing,current,unlocked,editor,native,macNative,mobile,nativeInfo,error,syncError}=props;
    ${effects}
    useLayoutEffect(()=>{props.duringLayout?.();},[props.duringLayout]);
    return null;
  })`,context,{timeout:1000});
  const reactRoot=createRoot(new HostElement());
  const unmount=()=>{if(!unmounted){flushSync(()=>reactRoot.unmount());unmounted=true;}};
  t.after(unmount);
  return {
    render(patch={}) {flushSync(()=>reactRoot.render(strict
      ? React.createElement(React.StrictMode,null,React.createElement(Component,{...defaults,...patch}))
      : React.createElement(Component,{...defaults,...patch})));},
    unmount,frames,timers,page,publications,compiled,startup:context.startup,
    readyCalls:()=>readyCalls,failCalls:()=>failCalls,
    frame(){const work=[...frames.values()].filter(x=>!x.cancelled&&!x.ran);for(const x of work){x.ran=true;x.fn();}},
    advance(ms){const until=now+ms;let budget=100;for(;;){
      const item=[...timers.values()].filter(x=>!x.cancelled&&!x.ran&&x.at<=until).sort((a,b)=>a.at-b.at)[0];
      if(!item)break;assert(budget-->0);now=item.at;item.ran=true;item.fn();
    }now=until;},
    snapshot:()=>({state:nodes.startup.removed?'detached':nodes.startup.dataset.state,inert:nodes.root.inert,ariaHidden:nodes.root.attrs['aria-hidden']}),
    paintTimers:()=>[...timers.values()].filter(x=>x.ms===250),
  };
}

test('two frames win immediately; cancelled timer and duplicate callbacks cannot release twice',t=>{
  const h=setup(t);h.render();assert.equal(h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__.phase,'frame1');
  h.frame();assert.equal(h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__.phase,'frame2');assert.equal(h.readyCalls(),0);
  h.frame();assert.equal(h.readyCalls(),1);assert.equal(h.snapshot().state,'leaving');
  assert(h.paintTimers()[0].cancelled);for(const item of [...h.frames.values(),...h.paintTimers()])item.fn();
  h.advance(1000);h.render({error:'synthetic later error'});assert.equal(h.readyCalls(),1);assert.equal(h.snapshot().state,'detached');
});
test('zero frames: only after 250ms paint budget, actual splash finishes its existing fade',t=>{
  const h=setup(t);h.render();h.advance(249);assert.equal(h.readyCalls(),0);assert.equal(h.snapshot().inert,true);
  h.advance(1);assert.equal(h.readyCalls(),1);assert.equal(h.snapshot().state,'leaving');
  assert(h.publications.some(s=>s.phase==='fallback'));h.advance(239);assert.equal(h.snapshot().inert,true);
  h.advance(1);assert.deepEqual(h.snapshot(),{state:'detached',inert:false,ariaHidden:undefined});
});
test('one frame: fallback cancels the second frame; its already queued callback is harmless',t=>{
  const h=setup(t);h.render();h.frame();const second=[...h.frames.values()].at(-1);
  h.advance(250);assert(second.cancelled);second.fn();assert.equal(h.readyCalls(),1);
});
test('both race orders produce exactly one ready',t=>{
  for(const timerFirst of [false,true]){
    const h=setup(t);h.render();h.frame();const second=[...h.frames.values()].at(-1),timer=h.paintTimers()[0];
    for(const callback of timerFirst?[timer,second]:[second,timer])callback.fn();
    assert.equal(h.readyCalls(),1);
  }
});
test('false gate cancels synchronously inside actual React commit, before a later layout callback',t=>{
  const h=setup(t);h.render();const timer=h.paintTimers()[0],frame=[...h.frames.values()][0];let observed;
  h.render({workspaceLoaded:false,duringLayout:()=>{timer.fn();frame.fn();observed=h.readyCalls();}});
  assert.equal(observed,0);assert(timer.cancelled);assert.equal(h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__.gates.workspaceLoaded,false);
  assert.equal(h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__.phase,'cancelled');h.advance(45000);assert.equal(h.readyCalls(),0);
});
test('commit regression fixture detects the unsafe passive-cleanup variant',t=>{
  const h=setup(t,{passiveCounterexample:true});h.render();const timer=h.paintTimers()[0];let observed;
  h.render({workspaceLoaded:false,duringLayout:()=>{timer.fn();observed=h.readyCalls();}});
  assert.equal(observed,1,'the test must distinguish passive cleanup from the product layout cleanup');
});
test('gate recovery starts a new budget; callbacks from the cancelled committed attempt stay stale',t=>{
  const h=setup(t);h.render();h.frame();h.advance(200);
  const oldTimer=h.paintTimers()[0],oldSecond=[...h.frames.values()].at(-1);
  h.render({synchronizing:true});h.advance(1000);assert.equal(h.readyCalls(),0);
  h.render();oldTimer.fn();oldSecond.fn();h.advance(249);assert.equal(h.readyCalls(),0);
  h.advance(1);assert.equal(h.readyCalls(),1);assert.equal(h.paintTimers().length,2);
});
test('unmount cancels first/second frame and timer, including forced late delivery',t=>{
  for(const afterFirst of [false,true]){
    const h=setup(t);h.render();if(afterFirst)h.frame();h.unmount();
    for(const item of [...h.frames.values(),...h.paintTimers()])item.fn();
    h.advance(45000);assert.equal(h.readyCalls(),0);assert.equal(h.snapshot().inert,true);
  }
});
test('real React StrictMode replays setup/cleanup; old generation cannot complete the new one',t=>{
  const h=setup(t,{strict:true});h.render();const attempts=h.paintTimers();
  assert.equal(attempts.length,2);assert(attempts[0].cancelled);attempts[0].fn();assert.equal(h.readyCalls(),0);
  for(const frame of h.frames.values())if(frame.cancelled)frame.fn();assert.equal(h.readyCalls(),0);
  attempts[1].fn();attempts[0].fn();assert.equal(h.readyCalls(),1);
});
test('superseded owner and its old cancel function cannot release/cancel the current owner',t=>{
  const h=setup(t);h.render();const original=h.paintTimers()[0];
  const oldCancel=h.startup.scheduleReady(),old=h.paintTimers().at(-1);
  h.startup.scheduleReady();const current=h.paintTimers().at(-1);
  oldCancel();original.fn();old.fn();assert.equal(h.readyCalls(),0);
  assert.equal(current.cancelled,false);current.fn();assert.equal(h.readyCalls(),1);
});
test('all original workspace/editor/native gates still prevent scheduling',t=>{
  for(const patch of [{loading:true},{workspaceLoaded:false},{syncCover:true},{synchronizing:true},
    {current:{id:'synthetic',locked:false},editor:null},{current:{id:'synthetic'},editor:{isDestroyed:true}},
    {current:{id:'synthetic',locked:true},unlocked:new Set(['synthetic'])},{nativeInfo:null}]){
    const h=setup(t);h.render(patch);h.frame();h.advance(45000);
    assert.equal(h.paintTimers().length,0);assert.equal(h.readyCalls(),0);assert.equal(h.snapshot().inert,true);
  }
});
test('empty/deleted/locked and non-native/mobile/native-error cases retain their original admission',t=>{
  for(const patch of [{current:null},{current:{deletedAt:1}},{current:{id:'synthetic',locked:true}},
    {current:{id:'synthetic'},editor:{isDestroyed:false}},
    {native:false,nativeInfo:null},{macNative:false,nativeInfo:null},{mobile:true,nativeInfo:null},
    {nativeInfo:null,error:'synthetic binding rejection'}]){
    const h=setup(t);h.render(patch);h.advance(250);assert.equal(h.readyCalls(),1);
  }
});
test('initial load error exposes the independent splash error and never schedules fallback',t=>{
  const h=setup(t);h.render({workspaceLoaded:false,syncError:'synthetic failure'});
  assert.equal(h.failCalls(),1);h.advance(45000);assert.equal(h.readyCalls(),0);assert.equal(h.snapshot().state,'error');
});
test('reduced-motion splash still honors ready gates, then finishes without fade delay',t=>{
  const h=setup(t,{reduced:true});h.render();h.advance(249);assert.equal(h.snapshot().inert,true);
  h.advance(1);assert.equal(h.snapshot().state,'detached');assert.equal(h.readyCalls(),1);
});
test('diagnostic is unknown before commit, finite/frozen after commit, refreshed without restarting paint wait',t=>{
  const h=setup(t);assert(!Object.hasOwn(h.page,'__CYBERNOTE_STARTUP_DIAGNOSTIC__'));h.render();
  const d=h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__;
  assert.deepEqual(Object.keys(d).sort(),['gates','phase','schema']);assert.equal(d.schema,1);
  assert.deepEqual(Object.keys(d.gates).sort(),['loading','workspaceLoaded','syncCover','synchronizing','editorSatisfied','nativeRequired','nativeInfoPresent','errorPresent','startupReady'].sort());
  assert(Object.values(d.gates).every(v=>typeof v==='boolean'));assert(Object.isFrozen(d));assert(Object.isFrozen(d.gates));
  h.render({mobile:true});assert.equal(h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__.gates.nativeRequired,false);
  assert.equal(h.paintTimers().length,1);
  h.page.__CYBERNOTE_STARTUP_DIAGNOSTIC__={schema:1,gates:{startupReady:false},phase:'cancelled'};
  h.advance(250);assert.equal(h.readyCalls(),1,'an externally replaced observation is never authority');
});
test('ordinary production, flag-off and absent-flag builds never publish the diagnostic',t=>{
  for(const options of [{dev:false,debug:'1'},{dev:true,debug:'0'},{dev:true,debug:undefined}]){
    const h=setup(t,options);h.render();h.advance(250);h.unmount();
    assert(!Object.hasOwn(h.page,'__CYBERNOTE_STARTUP_DIAGNOSTIC__'));
    assert(!h.compiled.includes('__CYBERNOTE_STARTUP_DIAGNOSTIC__'));
    assert.equal(h.readyCalls(),1);
  }
});
