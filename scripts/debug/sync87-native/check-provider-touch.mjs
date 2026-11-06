import assert from 'node:assert/strict';
import {openOwnedProvider,openOwnedProviderMouse} from './provider-touch.mjs';
const point={x:20,y:30,width:360,height:568};
function fake({menu=false,value=point,failAt=0}={}) {
  const calls=[];let n=0;
  return {calls,read:async expression=>{calls.push(['read',expression]);return expression.startsWith('!!')?menu:value;},wait:async(...args)=>{calls.push(['wait',...args]);},send:async(...args)=>{calls.push(['send',...args]);if(++n===failAt)throw Error('SECRET_IPC_ERROR');}};
}
for(const menu of [false,true]){
  const c=fake({menu});assert.deepEqual(await openOwnedProvider(c),{normalTouch:true});
  const sent=c.calls.filter(c=>c[0]==='send');assert.equal(sent.length,menu?2:4);
  assert(sent.every(c=>c[1]==='Input.dispatchTouchEvent'));
  for(let i=0;i<sent.length;i+=2){assert.deepEqual(sent[i][2],{type:'touchStart',touchPoints:[{x:20,y:30}]});assert.deepEqual(sent[i+1][2],{type:'touchEnd',touchPoints:[]});}
}
for(const value of [{...point,x:360},{...point,width:721},{...point,y:NaN},{...point,SECRET_KEY:1},Object.defineProperty({...point},'x',{get(){throw Error('SECRET_GETTER');}})]){
  const c=fake({value});await assert.rejects(openOwnedProvider(c),e=>e.message==='owned provider touch refused'&&!e.cause&&!Object.hasOwn(e,'actual'));assert.equal(c.calls.filter(c=>c[0]==='send').length,0);
}
const failed=fake({failAt:1});await assert.rejects(openOwnedProvider(failed),{message:'owned provider touch refused'});assert.equal(failed.calls.filter(c=>c[0]==='send').length,1);
await assert.rejects(openOwnedProvider(fake({failAt:1})),e=>e.stage==='attachment-start'&&e.message==='owned provider touch refused'&&!e.cause);
const waiting=fake();waiting.wait=async()=>{throw Error('SECRET_WAIT');};await assert.rejects(openOwnedProvider(waiting),e=>e.stage==='menu-wait'&&e.message==='owned provider touch refused'&&!e.cause);assert.equal(waiting.calls.filter(c=>c[0]==='send').length,2);
const mouse=fake();assert.deepEqual(await openOwnedProviderMouse(mouse),{normalMouse:true});
assert.deepEqual(mouse.calls.filter(c=>c[0]==='send'),[...Array(2)].flatMap(()=>[['send','Input.dispatchMouseEvent',{type:'mousePressed',x:20,y:30,button:'left',clickCount:1}],['send','Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:30,button:'left',clickCount:1}]]));
const mouseFail=fake({failAt:1});await assert.rejects(openOwnedProviderMouse(mouseFail),e=>e.stage==='attachment-start'&&e.message==='owned provider touch refused');assert.equal(mouseFail.calls.filter(c=>c[0]==='send').length,1);
console.log(JSON.stringify({ok:true,checks:12}));
