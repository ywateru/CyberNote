// Independent MODULES98 adversarial lifecycle probes. Real production modules,
// deterministic dependency ports; browser event/IPC shell only is controlled.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime } from '../../../scripts/debug/runtime.mjs';
const out=resolve('artifacts/modules98-independent');
await mkdir(out,{recursive:true});
const runtime=await openRuntime({mobile:true});
try {
  const checks=await runtime.page.evaluate(async()=>{
    const check=(name,value)=>{if(!value)throw Error(name); checks.push(name);};
    const checks=[];
    const {Navigation}=await import('/src/navigation/use-navigation.ts');
    const {NativePlatform}=await import('/src/platform/native-platform.ts');
    const {AttachmentPresentation}=await import('/src/attachment-operations/presentation.ts');
    const {accessGate}=await import('/src/bridge.ts');
    const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
    const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
    const doc={type:'doc',content:[{type:'attachment',attrs:{id:'attachment-a',kind:'image'}}]};
    const notes=['a','b'].map(id=>({id,folderId:'default',title:id,document:doc,plainText:id,pinned:false,locked:false,deletedAt:null,revision:1,createdAt:1,updatedAt:1,paperStyle:'plain'}));
    const ws={notes,folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1}],attachments:[{id:'attachment-a',noteId:'a',kind:'image',displayName:'a.svg',mime:'image/svg+xml',size:100,relativePath:'x'}],settings:{}};
    const actions=[],failures=[];
    const generation={value:0}; let frozen=true,cancel=deferred();
    const session={get generation(){return generation.value;},invalidate:()=>generation.value++,requestCreatedFocus:()=>actions.push('focus')};
    const nav=new Navigation(true);
    const ports={workspace:()=>ws,blocked:()=>[],noteId:'a',mobile:true,contentSearch:false,view:'list',sort:'title',separate:false,sync:{frozen:()=>frozen,cancel:()=>cancel.promise},session,clearComposition:()=>{},clearJump:()=>{},clearSwipe:()=>{},clearFind:()=>{},closeModal:()=>{},parkSmart:()=>{},settings:v=>actions.push(v),flush:async()=>{},closeWindow:()=>{},fail:e=>failures.push(String(e))};
    nav.configure(ports);
    nav.chooseNote(notes[0]);nav.chooseNote(notes[1]);frozen=false;cancel.resolve();await settle();
    check('deferred navigation publishes latest intent only',nav.snapshot().baseNoteId==='b'&&actions.length===1);
    frozen=true;cancel=deferred();nav.chooseNote(notes[0]);session.invalidate();cancel.resolve();await settle();
    check('new session generation rejects pending navigation',nav.snapshot().baseNoteId==='b'&&actions.length===1);
    cancel=deferred();nav.chooseNote(notes[0]);nav.dispose();cancel.resolve();await settle();
    check('disposed navigation rejects pending completion',nav.snapshot().baseNoteId==='b'&&actions.length===1);
    nav.mount();cancel=deferred();nav.chooseNote(notes[0]);cancel.reject(Error('sync refused'));await settle();
    check('failed cancellation reports without changing selection',nav.snapshot().baseNoteId==='b'&&failures.some(v=>v.includes('sync refused')));
    frozen=false;ws.notes=ws.notes.filter(n=>n.id!=='a');nav.chooseNote(notes[0]);
    check('execution rejects removed target without settings write',nav.snapshot().baseNoteId==='b'&&actions.length===1&&failures.some(v=>v.includes('不存在')));
    ws.notes=notes;
    const before=actions.length;
    check('stale create receipt cannot request focus',nav.adoptCreated(notes[0],{source:'all',folderId:'default',generation:generation.value-1})===false&&actions.length===before);
    // Late native intent retains its original scope after sync cancellation.
    let nativeCancel=deferred(),nativeFrozen=true,nativeActions=0;const nativeFailures=[];
    const platform=new NativePlatform();
    const target={noteId:'a',scope:'scope-a',current:notes[0],editor:null,loading:false,synchronizing:false,accessSuspended:[],modal:null,folderForm:false,draw:false,record:false,ocr:false,quitPending:false,quitting:()=>false,blocked:()=>false};
    const projection={folderId:'default',view:'list',galleryEditor:false,attachmentBrowser:false,separate:null,page:'editor',sidebar:true,settings:{},listTitle:'all',count:2,query:'',contentOverlay:false};
    const nativePorts={target,projection,actions:{networkSync:{frozen:()=>nativeFrozen,cancel:()=>nativeCancel.promise},changeSearch:async()=>{nativeActions++},setContextFolder:()=>{nativeActions++},openModal:()=>{nativeActions++},fail:e=>nativeFailures.push(String(e))}};
    platform.configure(nativePorts);
    const context={noteId:'a',scope:'scope-a',stamp:accessGate.stamp('a'),editor:null,bookmark:null,documentVersion:0};
    platform.handle({kind:'action',action:'newFolder'},context,1);
    platform.configure({...nativePorts,target:{...target,noteId:'b',scope:'scope-b',current:notes[1]}});nativeFrozen=false;nativeCancel.resolve();await settle();
    check('deferred native command never rebinds to new note',nativeActions===0&&nativeFailures.length===1);
    platform.configure(nativePorts);nativeFrozen=true;nativeCancel=deferred();platform.handle({kind:'action',action:'newFolder'},context,2);platform.dispose();nativeFrozen=false;nativeCancel.resolve();await settle();
    check('disposed native platform suppresses pending intent',nativeActions===0&&nativeFailures.length===1);
    // Preview remains bound to its original owner while main navigation changes.
    const presentation=new AttachmentPresentation();let authority='epoch-1',retains=0,blocked=false;
    const element=document.createElement('button');element.textContent='probe';document.body.append(element);
    const source={disposed:false,retain(){retains++;return this;},dispose(){}};
    const presentationPorts={workspace:()=>ws,editor:()=>undefined,pending:()=>undefined,authority:()=>authority,authorized:()=>true,galleryBlocked:()=>blocked,menuBlocked:()=>false,ownedRecording:()=>false,previewBlocked:()=>false,visibilityBlocked:()=>blocked,covered:()=>false,noteId:'a',currentEditor:{isDestroyed:false,getJSON:()=>doc},browser:false,mobile:false,page:'editor',surface:()=>null,afterQuiet:async fn=>fn(),fail:e=>{throw e;},notice:()=>{},openBrowser:()=>{},reveal:()=>{}};
    presentation.configure(presentationPorts);presentation.openImagePreview({id:'attachment-a',source,trigger:element,name:'a.svg'});
    presentation.configure({...presentationPorts,noteId:'b'});
    check('nonmodal preview keeps original owner across main selection',presentation.previewOpen&&presentation.snapshot().imagePreview.owner==='a'&&retains===1);
    authority='epoch-2';presentation.reconcilePreview();
    check('owner authority change removes preview request',presentation.snapshot().imagePreview===null);
    authority='epoch-1';presentation.configure({...presentationPorts,browser:true});const entries=presentation.projectGallery(notes,true,'');
    blocked=true;check('gallery target is checked again at execution',entries.length===1&&!presentation.validGalleryEntry(entries[0]));
    element.remove();presentation.dispose();
    // Mount the real hook separately, delay true listener registration receipts,
    // unmount, emit events during delay, then release receipts and require unlisten.
    const mainSource=await fetch('/src/main.tsx').then(r=>r.text());const reactUrl=mainSource.match(/from ["']([^"']*\/react\.js[^"']*)/)[1];const reactModule=await import(reactUrl);const React=reactModule.default||reactModule;
    const domUrl=mainSource.match(/from ["']([^"']*\/react-dom_client\.js[^"']*)/)[1];const domModule=await import(domUrl);const {createRoot}=domModule.default||domModule;
    const {useSystemEvents}=await import('/src/platform/system-events.ts');
    const original=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
    const pending=[],registeredIds=[],removedIds=[];let routes=0,detached=0;
    window.__TAURI_INTERNALS__.invoke=async(command,args)=>{
      const value=await original(command,args);
      if(command==='plugin:event|listen'){registeredIds.push(value);return new Promise(resolve=>pending.push(()=>resolve(value)));}
      if(command==='plugin:event|unlisten')removedIds.push(args.eventId);
      return value;
    };
    const hit=()=>routes++;
    const keys={quitting:false,folderForm:false,ocr:false,mobile:true,page:'notes',attachmentBrowser:false,modal:false,menu:false,format:false,drawing:false,find:false,searching:false,searchDraft:false,create:hit,globalSearch:hit,findInNote:hit,cancelOcr:hit,closeModal:hit,closeMenu:hit,closeFormat:hit,closeDrawing:hit,closeFind:hit,clearSearch:hit,back:hit};
    const p={keys,androidBack:hit,nativeMenu:hit,legacyMenu:{create:hit,newFolder:hit,toggleSidebar:hit,toggleGallery:hit,search:hit,find:hit,attachmentBrowser:false,archive:hit},refreshMetadata:hit,saveHidden:hit,closeRequested:async()=>hit(),detachOwners:()=>detached++,fail:e=>{throw e;},drawing:hit};
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    function Probe(){useSystemEvents(p);return null;}
    root.render(React.createElement(Probe));
    for(let i=0;i<100&&pending.length<3;i++)await new Promise(r=>setTimeout(r,10));
    check('system hook registered actual three initial native listeners',pending.length===3);
    root.unmount();
    await window.__DEBUG_PLATFORM__.emit('menu-action','new_note');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',metaKey:true}));
    window.dispatchEvent(new CustomEvent('edit-drawing',{detail:{strokes:[]}}));
    const after=routes;for(let i=0;i<10;i++){for(const release of pending.splice(0))release();await settle();}
    check('unmounted hook suppresses late native and DOM events',after===0&&routes===0&&detached===1);
    check('late registration receipts immediately unlisten',registeredIds.length===4&&registeredIds.every(id=>removedIds.includes(id)));
    window.__TAURI_INTERNALS__.invoke=original;host.remove();
    return checks;
  });
  assert.equal(runtime.errors.length,0,JSON.stringify(runtime.errors));
  await writeFile(resolve(out,'probe.json'),JSON.stringify({checks,scope:'Actual production modules in Chrome; dependency ports and Tauri event shell controlled. No OS/native build claims.'},null,2)+'\n');
  console.log(JSON.stringify({checks},null,2));
} catch(error) {console.error(JSON.stringify({browserErrors:runtime.errors}));throw error;} finally {await runtime.cleanup();}
