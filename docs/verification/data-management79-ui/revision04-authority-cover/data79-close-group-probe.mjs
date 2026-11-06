import {openRuntime} from '/private/tmp/data79-runtime-probe.mjs';
import {runGroups} from '/private/tmp/apple-notes-data79-ui/scripts/debug/scenarios.mjs';
const runtime=await openRuntime({root:'/private/tmp/apple-notes-data79-ui'});
try{console.log('OPENED');const result=await runGroups(runtime,['data-management'],'/private/tmp/apple-notes-data79-ui/docs/verification/data-management79-ui/revision04-authority-cover/cleanup-probe');console.log('GROUP DONE',result.passedChecks);}finally{await runtime.cleanup();console.log('CLOSED');}
