import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SmartFolderForm} from '../../../src/SmartFolderForm';
import '../../../src/style.css';
const w=window as any;
const root=createRoot(document.getElementById('root')!);
let key=0;
w.mount=(options:any={})=>{
 w.events={cancels:0,saves:[]};w.pending=[];w.calls=[];w.policy=false;w.delayed=false;w.failure=false;w.malformed=false;
 Object.defineProperty(navigator,'platform',{configurable:true,value:options.platform??'MacIntel'});
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:options.ua??'Controlled Mac'});
 w.isTauri=options.native!==false;
 w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:options.label??'main'}},invoke:(cmd:string,args:any)=>{
  w.calls.push({cmd,args});if(cmd!=='plugin:notes-ui|keyboard_navigation')throw Error('Unexpected command');
  if(w.delayed)return new Promise((resolve,reject)=>w.pending.push({resolve,reject}));
  if(w.failure)return Promise.reject(Error('controlled query failure'));
  return Promise.resolve(w.malformed?{enabled:0}:{enabled:w.policy});
 }};
 document.getElementById('root')!.className='app '+(options.mobile?'mobile':'desktop native-toolbar');
 flushSync(()=>root.render(<SmartFolderForm key={++key} mobile={!!options.mobile} folder={options.folder} catalog={[]} onHandle={h=>w.handle=h} onCancel={()=>{w.events.cancels++;if(options.close)flushSync(()=>root.render(null))}} onSave={async draft=>{w.events.saves.push(structuredClone(draft));if(w.saveDelayed)return new Promise(resolve=>w.finishSave=resolve);return{id:'synthetic',complete:true}}} onRefresh={async()=>{throw Error('No backend')}}/>));
};
w.unmount=()=>flushSync(()=>root.render(null));
w.ready=true;
