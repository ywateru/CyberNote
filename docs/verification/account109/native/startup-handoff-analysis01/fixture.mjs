// Device-free execution of the current App effect and independent splash script.
// A fake clock/frame queue demonstrates source behavior, not WebKit scheduling.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(process.argv[2]);
const app=readFileSync(resolve(root,'src/App.tsx'),'utf8');
const splash=readFileSync(resolve(root,'public/startup.js'),'utf8');
const begin=app.indexOf('  const startupReady = ');
const endMarker='  }, [startupReady, loading, workspaceLoaded, syncError, error]);';
const end=app.indexOf(endMarker,begin)+endMarker.length;
assert(begin>0 && end>begin);
const effect=app.slice(begin,end);
assert(effect.includes('second = requestAnimationFrame(() => startup.ready());'));

function harness(patch={},reduced=false) {
  let next=0,now=0,cleanup;
  const frames=new Map(),timers=new Map();
  function element(attrs={}) {
    return {dataset:{},attrs:{...attrs},inert:'inert' in attrs,removed:false,hidden:true,textContent:'',
      addEventListener(){},removeEventListener(){},
      setAttribute(k,v){this.attrs[k]=v;},
      removeAttribute(k){delete this.attrs[k];if(k==='inert')this.inert=false;},
      remove(){this.removed=true;}};
  }
  const nodes={startup:element({'aria-busy':'true'}),root:element({inert:'','aria-hidden':'true','aria-busy':'true'}),
    'startup-message':element(),'startup-retry':element()};
  nodes.startup.dataset.state='loading';
  const context=vm.createContext({
    loading:false,workspaceLoaded:true,syncCover:false,synchronizing:false,
    current:null,editor:null,unlocked:new Set(),native:true,macNative:true,mobile:false,
    nativeInfo:{},error:'',syncError:'',...patch,
    window:{addEventListener(){},removeEventListener(){}},
    document:{visibilityState:patch.visibility??'visible',documentElement:{dataset:{}},getElementById:id=>nodes[id]},
    localStorage:{getItem:()=>null,setItem(){}},location:{reload(){}},ErrorEvent:class {},
    matchMedia:()=>({matches:reduced}),
    setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>{const id=++next;frames.set(id,fn);return id;},
    cancelAnimationFrame:id=>frames.delete(id),
    useEffect:fn=>{cleanup=fn();},
  });
  vm.runInContext(splash,context,{timeout:1000});
  context.startup=context.window.__CYBERNOTE_STARTUP__;
  vm.runInContext(effect,context,{timeout:1000});
  const frame=()=>{const work=[...frames];frames.clear();for(const [,fn] of work)fn();};
  const advance=ms=>{
    const until=now+ms;let remaining=20;
    for(;;){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
      if(!entry||entry[1].at>until)break;
      assert(remaining-->0);now=entry[1].at;timers.delete(entry[0]);entry[1].fn();
    }now=until;
  };
  const snapshot=()=>({startup:nodes.startup.removed?'detached':nodes.startup.dataset.state,
    rootInert:nodes.root.inert,rootHidden:nodes.root.attrs['aria-hidden']??null,
    retryShown:!nodes['startup-retry'].hidden,pendingFrames:frames.size});
  return {frame,advance,snapshot,cancel:()=>cleanup?.()};
}

const cases=[];
const record=(name,h)=>cases.push({name,...h.snapshot()});
{
  const h=harness();h.frame();assert.equal(h.snapshot().startup,'loading');
  h.frame();assert.equal(h.snapshot().startup,'leaving');h.advance(240);
  assert.equal(h.snapshot().startup,'detached');assert.equal(h.snapshot().rootInert,false);
  record('ready gates true: two frames plus actual splash timer releases root',h);
}
{
  const h=harness({visibility:'hidden'});h.advance(45000);
  assert.deepEqual(h.snapshot(),{startup:'loading',rootInert:true,rootHidden:'true',retryShown:true,pendingFrames:1});
  record('ready gates true but no delivered frames: slow timer alone never releases root',h);
}
for(const [name,patch] of [
  ['workspace not loaded',{workspaceLoaded:false}],
  ['native binding pending',{nativeInfo:null}],
  ['initial load pending',{loading:true,workspaceLoaded:false}],
  ['synchronization cover retained',{syncCover:true,synchronizing:true}],
]) {
  const h=harness(patch);h.frame();h.frame();h.advance(45000);
  assert.equal(h.snapshot().startup,'loading');assert.equal(h.snapshot().rootInert,true);
  assert.equal(h.snapshot().pendingFrames,0);record(name+': same loading/inert DOM without handoff scheduling',h);
}
{
  const h=harness({workspaceLoaded:false,syncError:'synthetic failure'});
  assert.equal(h.snapshot().startup,'error');assert.equal(h.snapshot().rootInert,true);
  record('settled initial workspace failure keeps content gated and exposes error',h);
}
{
  const h=harness();h.frame();h.cancel();h.frame();h.advance(45000);
  assert.equal(h.snapshot().startup,'loading');assert.equal(h.snapshot().pendingFrames,0);
  record('effect cleanup cancels already scheduled second frame',h);
}
{
  const h=harness({visibility:'hidden'},true);h.advance(45000);
  assert.equal(h.snapshot().startup,'loading');assert.equal(h.snapshot().pendingFrames,1);
  record('reduced motion still waits for App frames before public ready can finish',h);
}
{
  const h=harness({nativeInfo:null,error:'synthetic binding failure'});h.frame();h.frame();h.advance(240);
  assert.equal(h.snapshot().startup,'detached');
  record('existing explicit error permits native-info fallback after workspace readiness',h);
}
console.log(JSON.stringify({kind:'device-free-source-fixture',passed:true,checks:cases.length,
  appEffectSha256:createHash('sha256').update(effect).digest('hex'),
  splashSha256:createHash('sha256').update(splash).digest('hex'),cases,
  limitations:['Synthetic DOM and manually delivered frame/timer queues, no React renderer, WebKit, Tauri or OS execution.',
    'Withholding frames is an injected condition; it does not establish the failed run experienced that condition.',
    'Cases execute current product source but do not test a proposed fix or explain real pending IPC.']},null,2));
