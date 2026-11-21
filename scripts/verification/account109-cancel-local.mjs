#!/usr/bin/env node
// Importing is inert. Only run() opens a fresh, explicitly named synthetic store.
import assert from 'node:assert/strict';
import {mkdir,lstat,readFile,writeFile,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp,delay} from './sync108-native-driver.mjs';
import {nativeAccount,requireHealthy,statusObserver,failureCode} from './account109-desktop-helpers.mjs';
import {hash,boundedPoll} from './account109-desktop-recovery.mjs';

export const SOURCE='72513d1296df4526a08834db65a3427957d3fb50';
export const BINARY_SHA='187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459';
const checks=['localSave','authorizing','cancelledWindow','localEdit','restartWindow'];
// UI contract f048fd15; candidate pins change only after a new reviewed build.
export function surfacePolicy({surface='browser',cancelViaWindow=false,...extra}={}){
  assert.equal(Object.keys(extra).length,0,'No authorization endpoint or extra parameters');
  assert(['embedded','browser'].includes(surface),'Fixed authorization surface required');
  assert.equal(typeof cancelViaWindow,'boolean');assert(!cancelViaWindow||surface==='embedded','Window cancellation requires embedded start');
  return {surface,cancelViaWindow};
}
export function authorizationSurface(s,{pendingSurface=false}={}){
  if(s.state==='authorizing')assert((pendingSurface&&s.authorizationSurface===undefined)||['embedded','browser'].includes(s.authorizationSurface),'Authorizing requires a finite actual surface');
  else assert.equal(s.authorizationSurface,undefined,'Authorization surface must be absent outside authorizing');
  return s.authorizationSurface;
}
export async function beginAuthorization(peer,mode,{poll=boundedPoll,now=Date.now}={}){
  const {surface}=surfacePolicy(mode);
  await peer.enterAccount();await peer.inspectAction('signIn',surface);await peer.action('signIn',{surface});
  const deadline=now()+30000;
  await poll('one SignIn authorizing',async()=>{
    // Native publishes authorizing before asynchronous window/browser opening.
    // Only this initial read permits an absent actual surface while still pending.
    const s=await peer.status({pendingSurface:true});
    if(now()>=deadline)throw Object.assign(Error('Authorization deadline expired'),{code:'CONDITION_TIMEOUT:one SignIn authorizing'});
    disconnected(s,{pendingSurface:true});const actual=s.authorizationSurface;assert(['signedOut','authorizing'].includes(s.state));
    if(s.state==='signedOut'||actual===undefined)return false;assert.equal(actual,surface,'Requested/actual authorization surface mismatch');return true;
  },30000);
  return {requestedSurface:surface,authorizationSurface:surface,uiHandler:'account.signIn',physicalInput:false};
}
export function options(argv){
  const o={};
  for(let i=0;i<argv.length;i++){const k=argv[i];assert(['--binary','--store','--output','--surface','--cancel-via-window'].includes(k)&&!Object.hasOwn(o,k),'Only fixed runner inputs allowed');if(k==='--cancel-via-window')o[k]=true;else{assert(typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'Missing fixed input value');o[k]=argv[++i];}}
  assert.equal(Object.keys(o).length,3+Number(Object.hasOwn(o,'--surface'))+Number(Object.hasOwn(o,'--cancel-via-window')));
  const mode=surfacePolicy({surface:Object.hasOwn(o,'--surface')?o['--surface']:'browser',cancelViaWindow:o['--cancel-via-window']===true});
  for(const k of ['--binary','--store','--output'])assert(isAbsolute(o[k]||'')&&resolve(o[k])===o[k],'Canonical absolute paths required');
  for(const k of ['--store','--output'])assert(dirname(o[k])==='/private/tmp'&&/^account109-cancel-local-[A-Za-z0-9_-]+$/.test(basename(o[k])),'Fresh dedicated /private/tmp names required');
  assert.notEqual(o['--store'],o['--output']);return {binary:o['--binary'],store:o['--store'],output:o['--output'],...mode};
}
export async function preflight(o){
  assert.equal(await realpath('/private/tmp'),'/private/tmp');
  for(const p of [o.store,o.output]){
    try{await lstat(p);assert.fail('Store and output must both be absent');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  assert.equal(await realpath(o.binary),o.binary);assert((await lstat(o.binary)).isFile());
  assert.equal(hash(await readFile(o.binary)),BINARY_SHA,'Only verified 72513d12 GUI binary allowed');
}
function disconnected(s,surfaceOptions){
  requireHealthy(s);authorizationSurface(s,surfaceOptions);assert.equal(s.enabled,false);assert(!s.profile);assert(Array.isArray(s.devices)&&!s.devices.some(d=>d.connected));assert.equal(s.conflictCount,0);
}
export function strictSignedOut(s){disconnected(s);assert.equal(s.state,'signedOut');return true;}
export const fixture=edited=>{
  const title='account109 cancel local',first=edited?'取消后仍可编辑 中文 😀':'登录前本地保存 中文 😀',last=edited?'修改后完整第二段':'初始完整第二段';
  return {document:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:title}]},{type:'paragraph',content:[{type:'text',text:first,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:last,marks:[{type:'italic'}]}]}]},plainText:[title,first,last].join('\n')};
};
export function assertDocument(ws,id,expected){
  assert.equal(ws.notes.length,1,'Exactly the fresh synthetic note required');assert.equal(ws.attachments.length,0);
  const n=ws.notes[0];assert.equal(n.id,id);assert.deepEqual(n.document,expected.document);assert.equal(n.plainText,expected.plainText);return n;
}
export async function stableSignedOut(peer,id,expected,{now=Date.now,sleep=delay}={}){
  const begin=now();let samples=0;
  do{strictSignedOut(await peer.status());assertDocument(await peer.workspace(),id,expected);samples++;await sleep(Math.min(500,Math.max(0,3000-(now()-begin))));}while(now()-begin<3000);
  // Include a boundary sample rather than ending on the last pre-deadline ACK.
  strictSignedOut(await peer.status());assertDocument(await peer.workspace(),id,expected);samples++;
  assert(samples>=3);return {samples,durationMs:now()-begin,documentAndPlainTextSha256:hash(JSON.stringify(expected))};
}
export function assertNatural(peer){
  const l=peer.lifecycle;assert.equal(l.naturalExit,true);assert.deepEqual(l.exit,{code:0,signal:null});assert.deepEqual(l.close,{code:0,signal:null});assert.deepEqual(l.forcedSignals,[]);assert.equal(peer.pidAbsent,true,'Owned process must be gone');
}
export function actionShown(p,kind,surface='browser'){
  assert(['signIn','cancel'].includes(kind));assert(['embedded','browser'].includes(surface));
  const labels=kind==='signIn'?['登录','创建账户']:['取消登录'];
  return p.state===(kind==='signIn'?'signedOut':'authorizing')&&p.authorizationSurface===(kind==='signIn'?undefined:surface)&&p.count===labels.length&&JSON.stringify(p.labels)===JSON.stringify(labels)&&p.label===(kind==='signIn'?'登录':'取消登录')&&p.enabled===true&&p.visible===true&&JSON.stringify(p.radioValues)===JSON.stringify(kind==='signIn'?['embedded','browser']:[])&&JSON.stringify(p.radioDisabled)===JSON.stringify(kind==='signIn'?[false,false]:[]);
}
// Fixed read-only projection of segmented choices.
export const ACTION_PROJECTION="(()=>{const p=document.querySelector('.account-settings'),bs=Array.from(p?.querySelectorAll('.account-group[aria-label=\"CyberNote 账户\"] .account-actions button')||[]),b=bs[0],rs=Array.from(p?.querySelectorAll('[aria-label=\"登录方式\"] [role=\"radio\"]')||[]);return {state:p?.dataset.accountState,authorizationSurface:p?.dataset.accountAuthorizationSurface,count:bs.length,labels:bs.map(b=>b.textContent),label:b?.textContent,enabled:!!b&&!b.disabled,visible:!!b&&b.getClientRects().length>0,radioValues:rs.map(r=>r.value),radioDisabled:rs.map(r=>r.getAttribute('aria-disabled')==='true')};})()";
export async function exercise({open,record,checkpoint,poll=boundedPoll,clock,surface='browser',cancelViaWindow=false,...extra}){
  surfacePolicy({surface,cancelViaWindow,...extra});
  const initial=fixture(false),edited=fixture(true),first=await open();
  await checkpoint('localSave');strictSignedOut(await first.status());
  const empty=await first.workspace();assert.equal(empty.notes.length,0);assert.equal(empty.attachments.length,0);
  const id=await first.create(initial.document);assert(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id));assertDocument(await first.workspace(),id,initial);
  await record('localSave',{noteId:id,documentAndPlainTextSha256:hash(JSON.stringify(initial))});
  await checkpoint('authorizing');const proof=await beginAuthorization(first,{surface},{poll,now:clock?.now??Date.now});await record('authorizing',proof);
  if(cancelViaWindow)await checkpoint('awaitingNativeWindowClose',{event:'awaiting-native-window-close',authorizationSurface:'embedded',timeoutMs:60000,readOnlyWait:true});
  else{await checkpoint('cancelledWindow');await first.inspectAction('cancel',proof.authorizationSurface);await first.action('cancel');}
  // The window deadline starts after checkpoint persistence. A status request
  // started in time must also finish before it; the shared poll checks only entry.
  const now=clock?.now??Date.now,windowDeadline=cancelViaWindow?now()+60000:undefined;
  await poll(cancelViaWindow?'native window close signedOut':'one cancel signedOut',async()=>{const s=await first.status();if(cancelViaWindow&&now()>=windowDeadline)throw Object.assign(Error('Window close deadline expired'),{code:'CONDITION_TIMEOUT:native window close signedOut'});disconnected(s);assert(['signedOut','authorizing'].includes(s.state));if(s.state==='authorizing')assert.equal(s.authorizationSurface,proof.authorizationSurface);return s.state==='signedOut';},cancelViaWindow?60000:15000);
  if(cancelViaWindow)await checkpoint('cancelledWindow');
  await record('cancelledWindow',{...(cancelViaWindow?{cancelOrigin:'native-window-close-observed'}:{uiHandler:'account.cancel',physicalInput:false}),...await stableSignedOut(first,id,initial,clock)});
  await checkpoint('localEdit');await first.leaveAccount();await first.edit(id,edited.document);strictSignedOut(await first.status());assertDocument(await first.workspace(),id,edited);
  await record('localEdit',{noteId:id,documentAndPlainTextSha256:hash(JSON.stringify(edited))});
  await first.close();assertNatural(first);
  await checkpoint('restartWindow');const restarted=await open();await restarted.requireSettingsClosed();
  await record('restartWindow',{...await stableSignedOut(restarted,id,edited,clock),sameStore:true});
  await restarted.close();assertNatural(restarted);
}
export async function finish(report,peers,save){
  const closed=await Promise.allSettled(peers.map(p=>p.close()));report.lifecycle=peers.map(p=>({...p.lifecycle,pidAbsent:p.pidAbsent===true}));
  if(closed.some(r=>r.status==='rejected')||peers.some(p=>{try{assertNatural(p);return false;}catch{return true;}}))report.cleanupFailure={code:'CLEANUP_FAILED'};
  report.status=!report.failure&&!report.cleanupFailure&&peers.length===2&&checks.every(k=>report.checks.some(c=>c.name===k&&c.status==='pass'))?'pass':'fail';
  report.finishedAt=new Date().toISOString();await save();
}
const operations=['ready','state','idle','account.status','account.signIn','account.cancel','settings.open','settings.tab','app.back','folder.select','note.create','note.select','editor.setContent','app.flush','action.inspect','close'];
export async function run(argv=process.argv.slice(2)){
  const o=options(argv);await preflight(o);await mkdir(o.output,{mode:0o700});
  const report={schema:1,kind:'account109-fresh-gui-cancel-local',status:'running',phase:'prepare',startedAt:new Date().toISOString(),surface:o.surface,cancelViaWindow:o.cancelViaWindow,binary:{sha256:BINARY_SHA,sourceRevision:SOURCE,candidateKind:'debug-e2e'},checks:[],observations:[],tools:{},limitations:[
    'Fresh synthetic store only; no original/default store, DB, grant or binding is read by the runner. Product functions use normal GUI Store/Session and the pinned native account Runtime.',
    'SignIn and automatic cancel use existing account UI handlers after checking visible enabled buttons. Window cancellation mode sends no account.cancel command. Editor commands use debug/e2e UI handlers, not physical input. No form credentials, URLs, callbacks, port changes, process-name kills, authorization retries or headless mode.',
    'Window cancellation mode records an awaitingNativeWindowClose checkpoint then only polls native account status for up to 60 seconds. cancelOrigin identifies the expected window-close observation flow; signedOut alone proves neither a physical action, a specific closing method nor hosted Logto form rendering. Those observations require separate parent CUA evidence.',
    'No browser content is inspected or saved. Authorizing alone does not prove a browser page opened or identity was validated. Bind/SignIn errors fail without changing fixed callback port 17897 or interfering with other Apps.',
    'The explicit fixed surface goes through the real UI handler, not physical radio input. Closing the embedded window is the only cancellation path there; no transaction secret or remote window content is inspected.',
    'Cancellation is sampled with full document preservation before and after natural restart. No valid old callback is submitted: late-callback rejection, QA re-login, account switching and three-peer/relay acceptance are not proved.',
    'Fresh store/output are retained on success and failure. Only parent may clean this run after finite evidence is archived and checked.'
  ]};
  const peers=[],observe=statusObserver(report,()=>report.phase);let sequence=0,interrupted=false;
  const save=()=>writeFile(resolve(o.output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const onSignal=()=>{interrupted=true;};process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
  async function step(app,operation,work){
    assert(operations.includes(operation));if(interrupted&&operation!=='close')throw Object.assign(Error('Interrupted'),{code:'RUN_INTERRUPTED'});
    report.lastOperation={sequence:++sequence,phase:report.phase,device:app.name,operation,event:'before'};await save();
    try{const result=await work();report.lastOperation.event='after';return result;}catch(e){report.lastOperation.event='failed';report.lastOperation.code=failureCode(e);await save();throw e;}
  }
  try{
    await save();await mkdir(o.store,{mode:0o700});
    for(const name of ['account109-cancel-local.mjs','sync108-native-driver.mjs','account109-desktop-helpers.mjs','account109-desktop-recovery.mjs'])report.tools[name]=hash(await readFile(new URL(name,import.meta.url)));
    async function open(){
      const env=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));
      const app=new NativeApp(o.binary,o.store,{name:'local-'+(peers.length+1),env:{...env,NOTES_SYNC_E2E_HEADLESS:'',NOTES_SYNC_E2E_SLOT:'left'}});
      const command=async(type,args={})=>{await step(app,type,()=>app.execute(type,args));await step(app,'idle',()=>app.idle());};
      const state=()=>step(app,'state',()=>app.state());
      let observedSurface;
      const peer={lifecycle:app.lifecycle,pidAbsent:false,
        status:async surfaceOptions=>{const s=await step(app,'account.status',()=>nativeAccount(app,'status'));observe(app.name,s);const actual=authorizationSurface(s,surfaceOptions);if(actual!==observedSurface){report.observations.push({kind:'authorization-surface',device:app.name,authorizationSurface:actual??null});observedSurface=actual;}await save();return s;},
        workspace:async()=>(await state()).workspace,
        enterAccount:async()=>{await command('settings.open');await command('settings.tab',{tab:'account'});},
        leaveAccount:async()=>{for(let i=0;i<3&&(await state()).preferences.open;i++)await command('app.back');assert(!(await state()).preferences.open);},
        requireSettingsClosed:async()=>assert(!(await state()).preferences.open,'Settings must be closed on restart'),
        inspectAction:async(kind,surface='browser')=>{
          assert(['signIn','cancel'].includes(kind));
          await boundedPoll('visible '+kind+' action',async()=>{
            const s=await peer.status();if(kind==='signIn')strictSignedOut(s);else{disconnected(s);assert.equal(s.state,'authorizing');assert.equal(s.authorizationSurface,surface);}
            const p=await step(app,'action.inspect',()=>app.evaluate(ACTION_PROJECTION,kind));
            return actionShown(p,kind,surface);
          },5000);
        },
        action:async(kind,args)=>{
          assert(['signIn','cancel'].includes(kind));
          if(kind==='signIn'){assert(args&&Object.keys(args).length===1&&Object.hasOwn(args,'surface'));surfacePolicy(args);await command('account.signIn',{surface:args.surface});}
          else{assert.equal(args,undefined);await command('account.'+kind);}
        },
        create:async document=>{await command('folder.select',{id:'default'});await command('note.create');await command('editor.setContent',{document});await command('app.flush');return (await state()).selection.noteId;},
        edit:async(id,document)=>{await command('note.select',{id});await command('editor.setContent',{document});await command('app.flush');},
        close:async()=>{await step(app,'close',()=>app.close());try{process.kill(app.lifecycle.pid,0);peer.pidAbsent=false;}catch(e){if(e.code!=='ESRCH')throw e;peer.pidAbsent=true;}assertNatural(peer);}
      };
      peers.push(peer);const ready=await step(app,'ready',()=>app.ready(45000));report.observations.push({kind:'ready',device:app.name,interactive:ready.interactive,startupDetached:ready.startupDetached});await save();return peer;
    }
    await exercise({open,surface:o.surface,cancelViaWindow:o.cancelViaWindow,checkpoint:async(phase,proof)=>{report.phase=phase;if(proof)report.observations.push({kind:'checkpoint',phase,at:new Date().toISOString(),...proof});await save();},record:async(name,proof)=>{assert(checks.includes(name));report.checks.push({name,status:'pass'});report.observations.push({kind:name,...proof});await save();}});
  }catch(e){report.failure={phase:report.phase,code:failureCode(e),lastOperation:report.lastOperation};}
  finally{report.phase='cleanup';try{await finish(report,peers,save);}finally{process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);}}
  console.log(JSON.stringify({status:report.status,result:resolve(o.output,'result.json')}));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().then(r=>{if(r.status!=='pass')process.exitCode=1;}).catch(e=>{console.error(JSON.stringify({status:'fail',code:failureCode(e)}));process.exitCode=1;});
