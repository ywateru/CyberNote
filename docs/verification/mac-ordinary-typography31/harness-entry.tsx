import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SmartFolderForm} from '../../../src/SmartFolderForm';
const root=createRoot(document.getElementById('root')!);
let key=0;
(window as any).mount=(options:any={})=>{
 (window as any).events={cancels:0,saves:[]};
 document.documentElement.classList.toggle('dark',!!options.dark);
 document.getElementById('root')!.className='app '+(options.mobile?'mobile':'desktop native-toolbar')+(options.dark?' dark':'');
 flushSync(()=>root.render(<SmartFolderForm key={++key} mobile={false} catalog={['校准']} onHandle={()=>{}} {...options} onCancel={()=>{(window as any).events.cancels++}} onSave={async(draft:any)=>{(window as any).events.saves.push(structuredClone(draft));return{id:'controlled',complete:true}}} onRefresh={async()=>{throw Error('No backend')}}/>));
};
(window as any).mount();
