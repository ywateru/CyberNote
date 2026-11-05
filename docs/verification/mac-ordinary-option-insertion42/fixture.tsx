import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SmartFolderForm} from '../../../src/SmartFolderForm';
import '../../../src/style.css';
const w=window as any,root=createRoot(document.getElementById('root')!);
let key=0,render=0,options:any={},events:any[]=[],saves:any[]=[],cancels=0,calls:any[]=[],attempts=0;
const realExec=document.execCommand.bind(document);
const checks:any[]=[];
const check=(name:string,pass:boolean,detail?:any)=>{checks.push({name,pass,detail});if(!pass)throw Error(name)};
const trace=(message:string)=>w.webkit.messageHandlers.result.postMessage({progress:message});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const name=()=>document.querySelector<HTMLInputElement>('[aria-label="名称"]')!;
const snapshot=()=>{const el=name();return {value:el?.value,start:el?.selectionStart,end:el?.selectionEnd,direction:el?.selectionDirection,focused:document.activeElement===el,documentFocus:document.hasFocus(),error:document.querySelector('[role="alert"]')?.textContent??null,undo:document.queryCommandEnabled('undo'),redo:document.queryCommandEnabled('redo'),attempts,calls:calls.slice(),saves:structuredClone(saves),cancels}};
function paint(){flushSync(()=>root.render(<SmartFolderForm key={key} mobile={!!options.mobile} folder={options.folder} catalog={['render-'+(++render)]} onCancel={()=>{cancels++}} onHandle={h=>w.handle=h} onSave={async draft=>{saves.push(structuredClone(draft));return w.savePending?new Promise(()=>{}):{id:'controlled',complete:true}}} onRefresh={async()=>{throw Error('No backend')}}/>))}
async function mount(next:any={}){trace('mount '+JSON.stringify(next));options=next;key++;saves=[];calls=[];cancels=0;attempts=0;events=[];w.savePending=false;document.execCommand=realExec;
 Object.defineProperty(navigator,'platform',{configurable:true,value:options.platform??'MacIntel'});Object.defineProperty(navigator,'userAgent',{configurable:true,value:options.ua??'Controlled Mac WK'});
 w.isTauri=options.native!==false;w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:options.label??'main'}},invoke:(cmd:string,args:any)=>{calls.push({cmd,args});if(cmd==='plugin:notes-ui|keyboard_navigation')return Promise.resolve({enabled:false});throw Error('unexpected IPC')}};
 document.getElementById('root')!.className='app '+(options.mobile?'mobile':'desktop native-toolbar');paint();await tick();name().focus();await tick();trace('mounted '+JSON.stringify(next));}
const keydown=(flags:any={})=>{const e=new KeyboardEvent('keydown',{key:'Tab',altKey:true,bubbles:true,cancelable:true,...flags});if(flags.prevented)e.preventDefault();(flags.outside?document.getElementById('search')!:name()).dispatchEvent(e);return e.defaultPrevented};
const type=(value:string)=>{check('setup real browser typing',realExec('insertText',false,value));};
const assertEvents=(from:number,inputType:string)=>{const found=events.slice(from);check('real '+inputType+' beforeinput/input',found.some(e=>e.kind==='beforeinput'&&e.inputType===inputType&&e.isTrusted)&&found.some(e=>e.kind==='input'&&e.inputType===inputType&&e.isTrusted),found)};
const assertStateAfterRender=(expected:string)=>{paint();const now=snapshot();check('production controlled draft survives unrelated React render',now.value===expected,now);return now};
for(const kind of ['beforeinput','input'])document.addEventListener(kind,(event:Event)=>{if(event.target===name()){const e=event as InputEvent;const el=name();events.push({kind,inputType:e.inputType,data:e.data,isTrusted:e.isTrusted,value:el.value,start:el.selectionStart,end:el.selectionEnd})}},true);
w.runProbe=async()=>{const scenario=new URLSearchParams(location.search).get('scenario')!;const rows:any[]=[];try{
 const exclusionOptions:any={'exclude-preview':{native:false},'exclude-window':{label:'note-test'},'exclude-mobile':{mobile:true},'exclude-android':{mobile:true,platform:'Linux armv8l',ua:'Android'},'exclude-iphone':{platform:'MacIntel',ua:'iPhone'},'exclude-edit':{folder:{id:'edit',kind:'normal',name:'编辑名称',sortOrder:0,createdAt:0,parentId:null}}};
 await mount(exclusionOptions[scenario]??{});const initial=snapshot();check('fresh native history process starts without undo',!initial.undo&&!initial.redo,initial);
 if(['select-all','caret-middle','replace-CD41','shift-end','sequence43'].includes(scenario)){
  if(scenario!=='select-all'){type(scenario==='sequence43'?'QA-OPT43-ABCD':scenario==='replace-CD41'?'QA-OPT41-ABCD':'QA-OPT40-ABCD');await tick()}
  if(scenario==='caret-middle')name().setSelectionRange(3,3);
  if(scenario==='replace-CD41')name().setSelectionRange(11,13);
  if(scenario==='shift-end')name().setSelectionRange(13,13);
  if(scenario==='sequence43'){name().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await tick();check('sequence typing ends at right caret',name().selectionStart===13&&name().selectionEnd===13,snapshot())}
  const before=snapshot(),mark=events.length;const prevented=keydown({shiftKey:scenario==='shift-end'});await tick();const after=snapshot();
  const expected=before.value.slice(0,before.start!)+'\t'+before.value.slice(before.end!);
  check('production keydown handled exactly once',prevented,after);check('single U+0009 replaces current selection',after.value===expected&&after.start===before.start!+1&&after.end===before.start!+1&&after.focused&&!after.error,after);assertEvents(mark,'insertText');assertStateAfterRender(expected);
  let second:any=null;if(scenario==='sequence43'){const mark=events.length;keydown();await tick();second=snapshot();check('second production OptionTab appends one U+0009',second.value==='QA-OPT43-ABCD\t\t'&&second.start===15&&second.end===15&&second.focused&&!second.error,second);assertEvents(mark,'insertText');assertStateAfterRender(second.value)}
  const undoMark=events.length,undoReturn=realExec('undo');await tick();const undo=snapshot();check('real native undo succeeds',undoReturn,undo);assertEvents(undoMark,'historyUndo');assertStateAfterRender(undo.value);
  if(scenario==='replace-CD41')check('41 undo restores full name AND CD selection',undo.value==='QA-OPT41-ABCD'&&undo.start===11&&undo.end===13&&undo.focused,undo);
  if(scenario==='sequence43'||scenario==='select-all')check('43/full replacement undo restores default name selected',undo.value==='新建文件夹'&&undo.start===0&&undo.end===5&&undo.focused,undo);
  const redoMark=events.length,redoReturn=realExec('redo');await tick();const redo=snapshot();check('real native redo restores edited text/focus',redoReturn&&redo.value===(second?.value??expected)&&redo.focused,redo);assertEvents(redoMark,'historyRedo');assertStateAfterRender(redo.value);
  if(scenario!=='select-all'){document.querySelector<HTMLFormElement>('form')!.requestSubmit();await tick();check('existing onChange/update/draft reaches production onSave',saves[0]?.name===redo.value,{saves,redo})}
  rows.push({scenario,before,after,second,undoReturn,undo,redoReturn,redo,events});
 }else if(scenario==='anomaly-dom-only'){
  type('QA-OPT41-ABCD');await tick();name().setSelectionRange(11,13);const before=snapshot();let inside:any;
  document.execCommand=(()=>{attempts++;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name(),'QA-OPT41-ABP');name().setSelectionRange(12,12);inside=snapshot();return false}) as any;
  const mark=events.length;const prevented=keydown();await tick();const after=snapshot();
  check('DOM-only anomaly consumed once and errors',prevented&&attempts===1&&after.error?.includes('无法完成输入')===true,{before,inside,after});
  check('DOM-only anomaly has no real browser input',events.length===mark,events.slice(mark));
  check('injected setter changed DOM inside command',inside.value==='QA-OPT41-ABP'&&inside.start===12&&inside.end===12,inside);
  check('controlled React restores last real draft without product fallback',after.value===before.value,after);
  assertStateAfterRender(before.value);document.execCommand=realExec;const undoReturn=realExec('undo');await tick();const undo=snapshot();const redoReturn=realExec('redo');await tick();const redo=snapshot();
  check('DOM-only anomaly records observed undo/redo endpoint, without transactional guarantee',undoReturn&&redoReturn&&undo.value===before.value&&redo.value===before.value,{undoReturn,undo,redoReturn,redo});
  rows.push({scenario,before,inside,after,undoReturn,undo,redoReturn,redo,events,limitation:'No input means no React draft update. setError naturally restores last real controlled draft; visible injected DOM, selection and native history cannot be transactionally preserved without forbidden fallback. Observed user undo and redo both emit trusted history events but retain last real draft at caret13.'});
 }else if(scenario.startsWith('failure-')){
  type('QA-OPT41-ABCD');await tick();name().setSelectionRange(11,13);const before=snapshot();const mode=scenario.slice(8);
  if(mode==='missing')document.execCommand=undefined as any;
  else if(mode==='readonly')name().readOnly=true;
  else document.execCommand=((command:string,show?:boolean,value?:string)=>{attempts++;if(mode==='partial-false'||mode==='partial-throw'||mode==='wrong-success')realExec(command,show,'P');if(mode==='throw'||mode==='partial-throw')throw Error('controlled failure');return mode==='wrong-success'||mode==='noevent-success';}) as any;
  const mark=events.length;const prevented=keydown();await tick();const after=snapshot();const partial=mode.startsWith('partial')||mode==='wrong-success';
  check('failure consumes only scoped gesture',prevented,after);check('failure displays existing accessible generic error',after.error?.includes('无法完成输入')===true,after);check('never retries browser edit command',attempts===((mode==='missing'||mode==='readonly')?0:1),after);
  if(partial){check('partial failure preserves actual visible edit and caret',after.value==='QA-OPT41-ABP'&&after.start===12&&after.end===12&&after.focused,after);assertEvents(mark,'insertText')}
  else check('unchanged failure preserves original snapshot and selection',after.value===before.value&&after.start===before.start&&after.end===before.end&&after.focused,{before,after});
  assertStateAfterRender(after.value);check('failure stays visible after React render',snapshot().error===after.error,snapshot());document.execCommand=realExec;if(partial){const mark=events.length;check('manual user undo remains available after partial failure',realExec('undo'));await tick();const undo=snapshot();check('partial edit history restores original CD selection',undo.value===before.value&&undo.start===before.start&&undo.end===before.end,undo);assertEvents(mark,'historyUndo');check('manual user redo remains available after partial failure',realExec('redo'));await tick();check('partial redo restores visible failed edit',snapshot().value===after.value,snapshot());assertStateAfterRender(after.value)}
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();await tick();check('failure retains true production draft onSave',saves[0]?.name===after.value,{saves,after});rows.push({scenario,before,after,events});
 }else if(scenario.startsWith('exclude-')){
  const flags:any={'exclude-ctrl':{ctrlKey:true},'exclude-meta':{metaKey:true},'exclude-composing':{isComposing:true},'exclude-229':{keyCode:229},'exclude-prevented':{prevented:true},'exclude-nontab':{key:'a'}};
  if(scenario==='exclude-smart'||scenario==='exclude-warning'){
   document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();await tick();
   if(scenario==='exclude-warning'){document.querySelector<HTMLFormElement>('form')!.requestSubmit();await tick();check('warning precondition reached',!!document.querySelector('[role=alertdialog]'));document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();await tick();name().focus()}
  }
  if(scenario==='exclude-busy'){w.savePending=true;document.querySelector<HTMLFormElement>('form')!.requestSubmit();await tick();check('busy precondition reached',!!document.querySelector('button[type=submit]:disabled'))}
  if(scenario==='exclude-outside')document.getElementById('search')!.focus();
  document.execCommand=(()=>{attempts++;return false}) as any;const before=snapshot();const gesture=flags[scenario]??(scenario==='exclude-outside'?{outside:true}:{});const prevented=keydown(gesture);await tick();const after=snapshot();
  check('excluded gesture does not run edit command',attempts===0,{scenario,before,after,prevented});
  check('excluded gesture preserves value and no error',after.value===before.value&&!after.error,{scenario,before,after});
  check('excluded gesture keeps default prevention',prevented===!!gesture.prevented,{scenario,prevented});rows.push({scenario,before,after,prevented});
 }else throw Error('unknown scenario '+scenario);
 w.webkit.messageHandlers.result.postMessage({status:'PASS',scenario,checks,rows,scope:'Actual production SmartFolderForm keydown -> real WebKit beforeinput/input -> existing onChange controlled draft; synthetic DOM key routing and native editing commands, no OS keyboard or visible window.'});
 }catch(error){let last:any;try{last=snapshot()}catch(snapshotError){last={error:String(snapshotError)}}w.webkit.messageHandlers.result.postMessage({status:'FAIL',scenario,error:String(error),checks,rows,events,snapshot:last})}};
