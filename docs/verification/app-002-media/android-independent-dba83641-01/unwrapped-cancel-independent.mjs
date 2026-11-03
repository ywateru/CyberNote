import assert from 'node:assert/strict';
import {connect,tap,snapshot,store,pause,save} from './runtime-probe.mjs';
const c=await connect();
try {
  const baseline=await store(c,'04-before-independent-cancel-rust');
  const entry=await tap(c,'button.menu-row','录音','05-independent-unwrapped-entry');
  assert.equal(entry.observerPresent,false);
  const found=await c.call('Runtime.evaluate',{expression:`(()=>{const el=document.querySelector('.recording-sheet');if(!el)throw Error('No recording sheet');const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));let f=el[key];for(let i=0;f&&i<40;i++,f=f.return){let h=f.memoizedState;for(let j=0;h&&j<40;j++,h=h.next){const s=h.memoizedState?.current;if(s&&typeof s==='object'&&'recorder'in s&&typeof s.start==='function'&&typeof s.dispose==='function'&&typeof s.stop==='function')return {session:s,recorder:s.recorder,context:s.context,tracks:[...(s.tracks||[])]};}}throw Error('Actual session ref absent')})()`,objectGroup:'independent-media-paper',returnByValue:false});
  if(found.exceptionDetails)throw Error(JSON.stringify(found.exceptionDetails));
  const objectId=found.result.objectId;
  const readHeld=async()=>{const r=await c.call('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:`function(){const s=this.session;return {at:performance.now(),observerPresent:!!window.__mediaBaseline,panelPresent:!!document.querySelector('.recording-sheet'),session:{live:s.live,started:s.started,failed:s.failed,finished:s.finished,stopping:s.stopping,timer:s.timer,recorderIsNull:s.recorder===null,contextIsNull:s.context===null,trackCount:s.tracks?.length},heldRecorder:this.recorder&&{state:this.recorder.state,mimeType:this.recorder.mimeType},heldContext:this.context&&{state:this.context.state},heldTracks:this.tracks.map(t=>({kind:t.kind,readyState:t.readyState,enabled:t.enabled,muted:t.muted}))}}`});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  const before=await readHeld();
  await pause(12000);
  const twelveSecond=await readHeld();await snapshot(c,'06-independent-recording-12s');
  const returned=await tap(c,'.recording-sheet button','取消','07-independent-after-cancel');
  await pause(500);const after=await readHeld();
  const stored=await store(c,'08-after-independent-cancel-rust');
  const result={observation:'actual unwrapped already-authorized entry; native Android recording/cancel; read-only real React ref/CDP handle; no platform API or app/ref writes',before,twelveSecond,after,unchangedEntireFilteredRust:JSON.stringify(baseline)===JSON.stringify(stored),pidSame:entry.pid===returned.pid};
  save('09-independent-cancel-session-result',result);
  assert.equal(before.heldRecorder?.state,'recording');assert.equal(twelveSecond.heldRecorder?.state,'recording');assert.equal(after.heldRecorder?.state,'inactive');assert.equal(after.heldContext?.state,'closed');assert(after.heldTracks.every(t=>t.readyState==='ended'));assert.equal(after.panelPresent,false);assert.equal(after.session.timer,null);assert.equal(after.session.recorderIsNull,true);assert.equal(after.session.contextIsNull,true);assert.equal(result.unchangedEntireFilteredRust,true);assert.equal(result.pidSame,true);
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  save('independent-cancel-failure',{message:error.message,stack:error.stack});
  await snapshot(c,'independent-cancel-failure-state').catch(()=>{});
  throw error;
} finally {await c.close()}
