import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='/private/tmp/apple-notes-sync87-native',file='scripts/debug/sync87-native/native-ui.mjs';
const src=await readFile(root+'/'+file,'utf8');const base=execFileSync('git',['show','0b1d9790:'+file],{cwd:root,encoding:'utf8'});
const a=src.indexOf('export async function pairViaUI'),b=src.indexOf('export async function eventually');
assert.equal(src.slice(0,a),base.slice(0,base.indexOf('export async function pairViaUI')));assert.equal(src.slice(b),base.slice(base.indexOf('export async function eventually')));
const functionSource=src.slice(a,b).replace('export async function','async function');
const secret='SYNTHETIC_SECRET_INPUT';
const checks=[];
for(const shown of [false,true]){
 const events=[];const context=vm.createContext({assert,goHome:async()=>events.push(['home']),guard:async(op)=>{events.push(['guard',op]);return 'mInputShown='+shown;},pause:async(ms)=>events.push(['pause',ms])});vm.runInContext(functionSource+';globalThis.pair=pairViaUI;',context);
 const client={tap:async(...x)=>events.push(['tap',...x]),fill:async(...x)=>events.push(['fill',...x]),wait:async(...x)=>events.push(['wait',...x])};const steps=[];
 await context.pair(client,secret,{step:async(label,op)=>{steps.push(label);return op();}});
 assert.equal(events.filter(x=>x[0]==='guard'&&x[1]==='ime').length,2);assert.equal(events.filter(x=>x[0]==='guard'&&x[1]==='back').length,shown?2:0);assert.equal(events.filter(x=>x[0]==='pause'&&x[1]===250).length,shown?2:0);
 assert.equal(events.filter(x=>x[0]==='tap'&&x[2]==='加入同步').length,1);assert.equal(events.filter(x=>x[0]==='tap'&&x[2]==='连接并加入').length,1);
 const join=events.findIndex(x=>x[0]==='tap'&&x[2]==='加入同步'),panel=events.findIndex(x=>x[0]==='wait'&&x[2]==='actual join panel'),invite=events.findIndex(x=>x[0]==='fill'&&x[2]===secret);assert(join<panel&&panel<invite);
 assert(!JSON.stringify(steps).includes(secret));checks.push({imeShown:shown,backCalls:shown?2:0,joinTapCalls:1,submitTapCalls:1,actualPanelWaitBeforeInvitation:true});
}
const events=[];const context=vm.createContext({assert,goHome:async()=>{},guard:async(op)=>{events.push(op);return 'mInputShown=true';},pause:async()=>{}});vm.runInContext(functionSource+';globalThis.pair=pairViaUI;',context);
const steps=[];await assert.rejects(context.pair({tap:async(_s,text)=>events.push(text),fill:async(_s,text)=>events.push(text),wait:async(_p,label)=>{if(label==='actual join panel')throw Error(secret);} },secret,{step:async(label,op)=>{steps.push(label);return op();}}));assert.equal(steps.at(-1),'pair-open-join');assert(!steps.includes('pair-invitation'));assert.equal(events.filter(x=>x==='加入同步').length,1);assert(!events.includes(secret));checks.push({joinPanelTimeoutStopsBeforeInvitation:true,joinTapCalls:1});
console.log(JSON.stringify({ok:true,sourceCommit:'25c5e65c5000a466c84b281bf61dd6e2e64ecad3',sha256:createHash('sha256').update(src).digest('hex'),scope:'actual pairing function with fake client/guard; no real device operations',checks},null,2));
