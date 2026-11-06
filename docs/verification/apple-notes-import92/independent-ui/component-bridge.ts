export type AppleImportSnapshot = any;
const base={id:'review-job',phase:'preview',completed:0,total:1,items:[{key:'opaque-key',title:'合成笔记',folder:'合成目录',status:'ok',reason:''}],results:[],error:'',truncated:false,commit:null};
let polls=0;
export const appleImportTerminal=(s:AppleImportSnapshot)=>['complete','cancelled','error'].includes(s.phase);
export const scanAppleNotes=async()=>({...base});
export const startAppleNotesImport=async()=>({...base,phase:'importing'});
export const cancelAppleNotesImport=async()=>({...base,phase:'cancelling'});
export const readAppleNotesImport=async()=>({...base,phase:++polls>=3?'cancelled':'cancelling'});
(window as any).sourcePolls=()=>polls;
