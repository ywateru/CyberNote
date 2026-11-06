import { resolve } from 'node:path';
import {openRuntime,state,saveJSON,snapshot} from '../../../scripts/debug/runtime.mjs';
import {sourceFingerprint} from '../../../scripts/debug/source-identity.mjs';
const runtime=await openRuntime({mobile:true});
try {
 const before=await sourceFingerprint(process.cwd());
 await runtime.page.setViewportSize({width:1280,height:844});
 await runtime.reset();
 const actual=await runtime.page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},mobile:document.querySelector('.app').classList.contains('mobile'),mobileSettings:document.querySelectorAll('.mobile-home-settings').length}));
 const s=await state(runtime.page);
 if(actual.mobile||actual.viewport.width!==1280||actual.mobileSettings!==0||s.selection.page!=='folders')throw Error('Expected viewport pollution not reproduced');
 await saveJSON(resolve('docs/verification/quick-home83-viewport-followup/baseline-pollution.json'),{before,declaredMobile:runtime.mobile,declaredViewport:runtime.viewport,actual,selection:s.selection,pageErrors:runtime.errors,reproduced:true,scope:'Collects actual 1280 -> reset state; does not claim old mobile suites passed'});
 await saveJSON(resolve('docs/verification/quick-home83-viewport-followup/baseline-pollution.snapshot.json'),await snapshot(runtime.page,{selector:'.app',maxChars:12000,maxNodes:30}));
}finally{await runtime.cleanup();}
