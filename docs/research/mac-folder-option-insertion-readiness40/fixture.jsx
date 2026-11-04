import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';

const root=createRoot(document.getElementById('root'));
let setDraft, forceRender, events=[], currentDraft;
function Fixture(){
 const [draft,set]=useState({name:'QA-OPT40-ABCD'});
 const [renderCount,bump]=useState(0);
 setDraft=set;forceRender=()=>bump(v=>v+1);currentDraft=draft.name;
 const update=change=>set(d=>({...d,...change}));
 return <><input aria-label="名称" value={draft.name} onChange={e=>{
   events.push({kind:'react-onChange',value:e.target.value,inputType:e.nativeEvent.inputType,isTrusted:e.nativeEvent.isTrusted});
   update({name:e.target.value});
 }}/><output>{draft.name}</output><small>{renderCount}</small></>;
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const snapshot=()=>{
 const el=document.querySelector('input');
 return {value:el.value,state:currentDraft,output:document.querySelector('output').textContent,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,focused:document.activeElement===el,undoEnabled:document.queryCommandEnabled('undo'),redoEnabled:document.queryCommandEnabled('redo')};
};
window.runProbe=async()=>{
 const rows=[];
 try{
  for(const scenario of [{name:'caret-middle',start:3,end:3},{name:'replace-CD',start:11,end:13},{name:'append',start:13,end:13},{name:'setRangeText-control',start:11,end:13,method:'setRangeText'},{name:'setDraft-control',start:11,end:13,method:'setDraft'}].filter(s=>s.name===new URLSearchParams(location.search).get('scenario'))){
   flushSync(()=>root.render(<Fixture key={scenario.name}/>));
   const el=document.querySelector('input');events=[];
   for(const kind of ['beforeinput','input','change'])el.addEventListener(kind,e=>events.push({kind,value:el.value,inputType:e.inputType??null,data:e.data??null,isTrusted:e.isTrusted,start:el.selectionStart,end:el.selectionEnd}));
   el.focus();el.setSelectionRange(scenario.start,scenario.end);
   const before=snapshot();
   let insertReturn;
   if(scenario.method==='setRangeText'){el.setRangeText('\t',scenario.start,scenario.end,'end');insertReturn='void';}
   else if(scenario.method==='setDraft'){flushSync(()=>setDraft(d=>({...d,name:d.name.slice(0,scenario.start)+'\t'+d.name.slice(scenario.end)})));insertReturn='state-update';}
   else insertReturn=document.execCommand('insertText',false,'\t');
   await tick();
   const after=snapshot(),insertEvents=events.slice();events=[];
   flushSync(()=>forceRender());const afterUnrelatedRender=snapshot();
   const undoReturn=document.execCommand('undo');await tick();const undo=snapshot(),undoEvents=events.slice();events=[];
   const redoReturn=document.execCommand('redo');await tick();const redo=snapshot(),redoEvents=events.slice();events=[];
   rows.push({scenario,before,insertReturn,after,insertEvents,afterUnrelatedRender,undoReturn,undo,undoEvents,redoReturn,redo,redoEvents});
  }
  window.webkit.messageHandlers.result.postMessage({status:'COMPLETE',userAgent:navigator.userAgent,rows,scope:'Own invisible WKWebView, controlled React19 input, document editing commands only; no OS keyboard or user app'});
 }catch(error){window.webkit.messageHandlers.result.postMessage({status:'FAIL',error:String(error),rows});}
};
