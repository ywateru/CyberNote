import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {connect,tap,snapshot,store,pause,save,run,log,out} from './runtime-probe.mjs';
const c=await connect();
const mode=process.argv[2]||'prepare';
const back=async name=>{log({op:'native-back',name});run('shell','input','keyevent','4');await pause(500);return snapshot(c,name)};
const text=async value=>{log({op:'native-text',value});run('shell','input','text',value.replaceAll(' ','%s'));await pause(400)};
try {
 if(mode==='prepare'){
  await tap(c,'button[aria-label="新建备忘录"]',undefined,'10-paper-new');
  await text('QA-PAPER-INDEPENDENT-20261103C');
  log({op:'native-ime-enter',point:[991,2077]});run('shell','input','tap','991','2077');await pause(400);
  await text('Alpha Beta Gamma');
  const input=await snapshot(c,'11-paper-native-input');
  assert(input.document.content.some(n=>n.type==='paragraph'&&n.content?.some(n=>n.text==='Alpha Beta Gamma')));
  const p=await c.read(`(()=>{const p=[...document.querySelectorAll('.tiptap p')].find(p=>p.textContent==='Alpha Beta Gamma');const r=document.createRange();r.setStart(p.firstChild,6);r.setEnd(p.firstChild,10);const b=r.getBoundingClientRect();return [(b.x+b.width/2)*devicePixelRatio,(b.y+b.height/2)*devicePixelRatio+83]})()`);
  log({op:'native-long-press',point:p});run('shell','input','swipe',...p.map(Math.round).map(String),...p.map(Math.round).map(String),'650');await pause(500);
  const selected=await snapshot(c,'12-paper-native-selection');assert.equal(selected.domSelection,'Beta');
  await tap(c,'button[aria-label="格式"]',undefined,'13-paper-format');
  const bold=await tap(c,'.mobile-format-panel button[aria-label="粗体"]',undefined,'14-paper-bold');
  assert(JSON.stringify(bold.document).includes('"bold"'));assert.deepEqual(bold.selection,selected.selection);
  await tap(c,'button[aria-label="关闭格式"]',undefined,'15-paper-format-close');
  const baseline=await back('16-paper-keyboard-back');
  assert.equal(baseline.imeShown,false);assert.deepEqual(baseline.selection,selected.selection);
  await store(c,'17-paper-baseline-rust');
  console.log(JSON.stringify(baseline,null,2));
 }else if(mode==='normal'){
  const baseline=JSON.parse(readFileSync(path.join(out,'16-paper-keyboard-back.json'),'utf8'));
  const held=await c.call('Runtime.evaluate',{expression:`(()=>{const dom=document.querySelector('.tiptap'),editor=dom.editor;return {editor,view:editor.view,dom}})()`,objectGroup:'independent-media-paper',returnByValue:false});
  const identities=[];
  const check=async(s,panel)=>{
   assert.deepEqual(s.document,baseline.document);assert.deepEqual(s.selection,baseline.selection);assert.deepEqual(s.keyed,baseline.keyed);assert.equal(s.editable,!panel);assert.equal(s.imeShown,false);assert.equal(s.focused,false);assert.equal(!!s.sheet,panel);
   const id=await c.call('Runtime.callFunctionOn',{objectId:held.result.objectId,returnByValue:true,functionDeclaration:`function(){const dom=document.querySelector('.tiptap');return {editor:this.editor===dom?.editor,view:this.view===dom?.editor?.view,dom:this.dom===dom}}`});
   assert.deepEqual(id.result.value,{editor:true,view:true,dom:true});identities.push(id.result.value);
   if(panel){assert.deepEqual(s.paper.map(p=>p.style),['plain','lines-small','grid-small','lines-medium','grid-medium','lines-large','grid-large']);assert.equal(s.paper.filter(p=>p.selected).length,1)}
  };
  const open=async name=>{await tap(c,'button[aria-label="更多"]',undefined,name+'-more');const s=await tap(c,'button.menu-row','横线与网格',name+'-picker');await check(s,true);return s};
  await check(await snapshot(c,'20-paper-open-identity'),true);
  await check(await tap(c,'.modal-paper .sheet-top button','取消','21-paper-cancel'),false);
  const results=[];
  for(const [i,style] of ['grid-large','lines-small','grid-small','lines-medium','grid-medium','lines-large','plain'].entries()){
   const prefix='22-paper-'+i+'-'+style;
   const opened=await open(prefix);
   const chosen=await tap(c,`.modal-paper [data-paper-style="${style}"]`,undefined,prefix+'-chosen');await check(chosen,false);
   await pause(900);const rust=await store(c,prefix+'-rust');const note=rust.notes.find(n=>n.title==='QA-PAPER-INDEPENDENT-20261103C');assert.equal(note.paperStyle,style);assert.deepEqual(note.document,baseline.document);
   const reopened=await open(prefix+'-reopened');assert(reopened.paper.find(p=>p.style===style).selected);
   await check(await back(prefix+'-back'),false);
   results.push({style,revision:note.revision,selectedAfterReopen:true});
  }
  save('23-paper-normal-result',{results,identities,fullDocumentSelectionKeyUnchanged:true,realInputOnly:true,allSevenStatesPersistedAndReopened:true});
  console.log(JSON.stringify(results,null,2));
 }else if(mode==='short'){
  const original={size:run('shell','wm','size'),density:run('shell','wm','density')};save('24-short-original-device',original);assert(!original.size.includes('Override'));
  try{
   log({op:'temporary-wm-size',value:'1080x1600'});run('shell','wm','size','1080x1600');await pause(1000);
   await tap(c,'button[aria-label="更多"]',undefined,'25-short-more');
   const initial=await tap(c,'button.menu-row','横线与网格','26-short-initial');assert(initial.viewport[0]<700);assert(initial.sheet.scrollHeight>initial.sheet.clientHeight);assert(initial.paper.find(p=>p.style==='grid-large').rect.y+initial.paper.find(p=>p.style==='grid-large').rect.h>initial.viewport[1]);
   const x=Math.round(initial.viewport[0]*.5*initial.viewport[2]),y1=Math.round(initial.viewport[1]*.83*initial.viewport[2]+83),y2=Math.round(initial.viewport[1]*.28*initial.viewport[2]+83);
   log({op:'native-short-swipe',from:[x,y1],to:[x,y2],duration:600});run('shell','input','swipe',String(x),String(y1),String(x),String(y2),'600');await pause(700);
   const scrolled=await snapshot(c,'27-short-scrolled');const last=scrolled.paper.find(p=>p.style==='grid-large');assert(scrolled.sheet.scrollTop>0);assert(last.rect.y>=0);assert(last.rect.y+last.rect.h<=scrolled.viewport[1]);
   await tap(c,'.modal-paper [data-paper-style="grid-large"]',undefined,'28-short-selected-last');await pause(900);
   const rust=await store(c,'29-short-selected-rust');assert.equal(rust.notes.find(n=>n.title==='QA-PAPER-INDEPENDENT-20261103C').paperStyle,'grid-large');
   save('30-short-result',{original,viewport:initial.viewport,initialScroll:initial.sheet,scrolled:scrolled.sheet,lastCard:last,selectedAndSaved:true,nonzeroIosSafeAreaVerified:false});
  }finally{log({op:'restore-wm-size',value:'reset'});run('shell','wm','size','reset');await pause(1000);save('31-restored-device',{size:run('shell','wm','size'),density:run('shell','wm','density')});await snapshot(c,'32-restored-screen')}
 }else throw Error('Unknown finite mode');
}catch(error){save('paper-'+mode+'-failure',{message:error.message,stack:error.stack});await snapshot(c,'paper-'+mode+'-failure-state').catch(()=>{});throw error}
finally{await c.close()}
