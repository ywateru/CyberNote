import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {openRuntime,api,idle,saveJSON,waitForState} from '../../../scripts/debug/runtime.mjs';
import {sourceFingerprint} from '../../../scripts/debug/source-identity.mjs';
const out=resolve(process.argv[2]);const runtime=await openRuntime({tmp:'/private/tmp'}),p=runtime.page;
const command=async(c,a={})=>{await api(p,c,a);await idle(p);};
const rects=()=>p.locator('.note-row[data-note-id="note-a"] .snippet-text').evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),chars=[];while(walker.nextNode()){const n=walker.currentNode;for(let i=0;i<n.length;i++){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);const b=r.getBoundingClientRect();chars.push({char:n.textContent[i],x:b.x,y:b.y,width:b.width,right:b.right});}}return {text:el.textContent,display:getComputedStyle(el).display,gap:getComputedStyle(el).gap,rect:el.getBoundingClientRect().toJSON(),chars};});
const start=performance.now();let result={input:await sourceFingerprint(process.cwd())};
try{
 await command('editor.setContent',{document:{type:'doc',content:['连续字形','甲乙搜索丙丁'].map(text=>({type:'paragraph',content:[{type:'text',text}]}))}});await command('app.flush');result.before=await rects();
 await command('search.set',{query:'搜索'});result.after=await rects();await p.screenshot({path:resolve(out,'continuity.png')});
 await command('search.set',{query:''});await command('editor.setContent',{document:{type:'doc',content:['远处中文','上下文'.repeat(100)+'搜索结尾'].map(text=>({type:'paragraph',content:[{type:'text',text}]}))}});await command('app.flush');await command('settings.update',{settings:{listWidth:220}});await command('search.set',{query:'搜索'});result.narrow=await rects();await p.screenshot({path:resolve(out,'narrow.png')});
 result.stateTimes=[];for(let i=0;i<8;i++){let began=performance.now(),calls=0,error;try{await waitForState(p,async()=>{calls++;return false;},{timeoutMs:100});}catch(e){error={code:e.code,lastStatePresent:!!e.lastState?.workspace};}result.stateTimes.push({elapsedMs:performance.now()-began,calls,error});}
 let began=performance.now(),calls=0;try{await waitForState({evaluate:()=>new Promise(r=>setTimeout(()=>r({ok:true,value:{result:{workspace:{}}}}),140))},()=>{calls++;return false;},{timeoutMs:100});}catch(e){result.slowFirstTransport={elapsedMs:performance.now()-began,calls,code:e.code,lastStatePresent:!!e.lastState?.workspace};}
}catch(e){result.error={message:e.message,stack:e.stack};process.exitCode=1;}
finally{result.pageErrors=runtime.errors;await runtime.cleanup();result.completeWallMs=performance.now()-start;await saveJSON(resolve(out,'layout-timing.json'),result);console.log(JSON.stringify(result));}
