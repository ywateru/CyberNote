import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import{flushSync}from'react-dom';
import{SmartFolderForm}from'../../../src/SmartFolderForm';
import'../../../src/style.css';
const w=window as any;const root=createRoot(document.getElementById('root')!);let key=0;
Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Independent Mac controlled transport'});
w.isTauri=true;w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'}},invoke:(command:string,args:any)=>{w.calls.push({command,args});return new Promise((resolve,reject)=>w.pending.push({resolve,reject}));}};
function Owner(){const[open,setOpen]=useState(true);return open?<SmartFolderForm mobile={false} catalog={[]} onHandle={h=>w.handle=h} onCancel={()=>{w.cancelled++;setOpen(false)}} onSave={async d=>{w.saves.push(d);return{complete:true}}} onRefresh={async()=>{throw Error('no backend')}}/>:<p id="closed">closed by normal React parent state</p>}
w.mount=()=>{w.calls=[];w.pending=[];w.cancelled=0;w.saves=[];flushSync(()=>root.render(<Owner key={++key}/>));};w.ready=true;
