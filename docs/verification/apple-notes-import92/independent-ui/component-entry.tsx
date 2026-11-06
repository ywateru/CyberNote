import React from 'react';
import {createRoot} from 'react-dom/client';
import AppleNotesImport from '../../../../src/AppleNotesImport';
(window as any).finishes=[];
const props={active:true,blocked:false,accessKey:'review-access',onPrepare:async()=>{},onFinish:async(changed:boolean)=>{(window as any).finishes.push(changed)},onHandle:(handle:unknown)=>{(window as any).handle=handle}};
createRoot(document.getElementById('root')!).render(<AppleNotesImport {...props}/>);
