// Isolated static debug bundle: generated HTML evidence cannot trigger HMR.
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openRuntime, saveJSON} from './debug/runtime.mjs';
import {runGroups} from './debug/scenarios.mjs';
const mobile=process.argv.includes('--mobile');
const groups=process.argv.filter(x=>!x.startsWith('--')).slice(2);
const output=process.env.PREFERENCES_OUTPUT ? resolve(process.env.PREFERENCES_OUTPUT) : resolve('artifacts/preferences-redesign',groups.length?`${mobile?'mobile':'desktop'}-${groups.join('-')}`:mobile?'mobile-final':'desktop-final');
await mkdir(output,{recursive:true});
const runtime=await openRuntime({bundleDebug:true,mobile});
runtime.page.on("pageerror",error=>console.error(error.stack));
try{
  const result=await runGroups(runtime,groups.length?groups:mobile?['preferences','sync-settings']:['preferences','sync-settings','data-management','storage-overview'],output);
  await saveJSON(resolve(output,'result.json'),{passed:true,...result,pageErrors:runtime.errors,scope:runtime.metadata});
  console.log(JSON.stringify({passed:true,groups:result.groups.map(x=>x.group),checks:result.groups.map(x=>({group:x.group,count:x.checks.length})),output},null,2));
}catch(error){
  await runtime.page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  await saveJSON(resolve(output,'result.json'),{passed:false,error:error.message,results:error.results,pageErrors:runtime.errors,scope:runtime.metadata});
  throw error;
}finally{await runtime.cleanup();}
