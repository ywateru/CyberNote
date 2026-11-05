import {openRuntime,saveJSON} from '/private/tmp/apple-notes-mac-feedback77/scripts/debug/runtime.mjs';
import {runGroups,groupNames} from '/private/tmp/apple-notes-mac-feedback77/scripts/debug/scenarios.mjs';
import {sourceFingerprint} from '/private/tmp/apple-notes-mac-feedback77/scripts/debug/source-identity.mjs';
const output=process.argv[2], root='/private/tmp/apple-notes-mac-feedback77';
const before=await sourceFingerprint(root), started=performance.now();let runtime;
try{runtime=await openRuntime({root});const result=await runGroups(runtime,groupNames.filter(name=>name!=='contract'),output);await saveJSON(output+'/summary.json',{sourceHead:'806d34322abfb4cc3f55e25cef4c760748d7c842',sourceInputs:before,sourceInputsAtEnd:await sourceFingerprint(root),elapsedMs:Math.round(performance.now()-started),result,pageErrors:runtime.errors});console.log(JSON.stringify({passedChecks:result.passedChecks,pageErrors:runtime.errors}));}
catch(error){console.error(error);process.exitCode=1;}finally{await runtime?.cleanup();}
