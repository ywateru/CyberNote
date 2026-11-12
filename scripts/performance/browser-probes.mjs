// Runs before application code. Native shell APIs are simulated; original
// media playback/decoding, fetch and Rust responses remain real and unchanged.
export function installPerformancePlatform(mapping) {
 const p=window.__MEDIA_PERF__={phase:'startup-cold',firstVisibleImage:null,readyAt:null,frames:[],longTasks:[],mediaEvents:[],calls:[],blobCreated:0,blobRevoked:0,blobs:{}};
 const callbacks=new Map(),listeners=new Map();let next=0;
 Object.defineProperty(navigator,'platform',{value:'Linux'});
 window.isTauri=true;
 const emit=(name,payload)=>{for(const id of listeners.get(name)||[])callbacks.get(id)?.({event:name,payload,id});};
 window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
 const visibility=id=>{
  const direct=[...document.querySelectorAll(`[data-attachment-id="${CSS.escape(id)}"]`)];
  const note=mapping[id];const rows=note?[...document.querySelectorAll(`.note-row[data-note-id="${CSS.escape(note)}"] .note-thumbnail`)]:[];
  const nodes=direct.length?direct:rows;
  const regions=nodes.map(el=>{const r=el.getBoundingClientRect();const scroll=el.closest('.attachment-gallery-scroll,.notes-scroll,.editor-scroll');const sr=scroll?.getBoundingClientRect();const top=Math.max(0,sr?.top??0),bottom=Math.min(innerHeight,sr?.bottom??innerHeight);return {visible:r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>top&&r.top<bottom,prefetch:r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>top-120&&r.top<bottom+120};});
  return {domNodes:nodes.length,visible:regions.some(x=>x.visible),within120px:regions.some(x=>x.prefetch)};
 };
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback(fn){const id=++next;callbacks.set(id,fn);return id;},unregisterCallback(id){callbacks.delete(id);},convertFileSrc:p=>p,async invoke(command,args={}){
  if(command==='plugin:event|listen'){const ids=listeners.get(args.event)||[];ids.push(args.handler);listeners.set(args.event,ids);return args.handler;}
  if(command==='plugin:event|unlisten'){for(const[n,ids]of listeners)listeners.set(n,ids.filter(id=>id!==args.eventId));return;}
  if(command==='plugin:event|emit'||command==='plugin:event|emit_to'){emit(args.event,args.payload);return;}
  if(command.startsWith('plugin:window|')||command.startsWith('plugin:webview|')||command.startsWith('plugin:webview-window|'))return command.endsWith('|is_focused')?true:null;
  const observation={phase:p.phase,browserTime:performance.now(),visibility:command==='read_attachment'?visibility(args.id):undefined};
  p.calls.push({command,at:performance.now(),phase:p.phase});
  const response=await fetch('/__debug_ipc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,args,observation})}).then(r=>r.json());
  for(const event of response.events||[])emit(event.name,event.payload);
  if(!response.ok)throw response.error;return response.value;
 }};
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
 URL.createObjectURL=blob=>{const url=create(blob);p.blobCreated++;p.blobs[url]={bytes:blob.size,mime:blob.type};return url;};
 URL.revokeObjectURL=url=>{if(p.blobs[url]){p.blobRevoked++;delete p.blobs[url];}return revoke(url);};
 try{new PerformanceObserver(list=>{for(const e of list.getEntries())p.longTasks.push({phase:p.phase,start:e.startTime,duration:e.duration});}).observe({entryTypes:['longtask']});}catch(error){p.longTaskUnsupported=String(error);}
 let previous;
 const frame=t=>{if(previous!==undefined)p.frames.push({phase:p.phase,at:t,delta:t-previous});previous=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
 const inspect=()=>{
  if(p.readyAt===null&&document.querySelector('.app')&&!document.getElementById('startup')&&document.querySelector('.note-row'))p.readyAt=performance.now();
  if(p.firstVisibleImage===null)for(const img of document.querySelectorAll('.note-thumbnail img,.attachment-gallery-card img,.image-attachment img')){const r=img.getBoundingClientRect();if(img.complete&&img.naturalWidth>0&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth){p.firstVisibleImage={at:performance.now(),phase:p.phase,width:img.naturalWidth,height:img.naturalHeight};break;}}
 };
 document.addEventListener('load',inspect,true);new MutationObserver(inspect).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','class']});
 for(const name of ['loadedmetadata','loadeddata','playing','seeked','error','stalled'])document.addEventListener(name,event=>{if(event.target instanceof HTMLMediaElement)p.mediaEvents.push({phase:p.phase,name,at:performance.now(),tag:event.target.tagName,currentTime:event.target.currentTime,duration:Number.isFinite(event.target.duration)?event.target.duration:null,error:event.target.error?.code});},true);
}
export function pageSnapshot(){const p=window.__MEDIA_PERF__;const images=[...document.images];return {phase:p.phase,at:performance.now(),readyAt:p.readyAt,firstVisibleImage:p.firstVisibleImage,blobCreated:p.blobCreated,blobRevoked:p.blobRevoked,liveBlobCount:Object.keys(p.blobs).length,liveBlobBytes:Object.values(p.blobs).reduce((n,x)=>n+x.bytes,0),images:{nodes:images.length,loaded:images.filter(x=>x.complete&&x.naturalWidth>0).length,visibleLoaded:images.filter(x=>{const r=x.getBoundingClientRect();return x.complete&&x.naturalWidth>0&&r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0;}).length},frames:p.frames,longTasks:p.longTasks,mediaEvents:p.mediaEvents};}
