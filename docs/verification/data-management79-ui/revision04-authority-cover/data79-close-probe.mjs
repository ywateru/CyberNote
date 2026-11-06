import {openRuntime} from '/private/tmp/data79-runtime-probe.mjs';
const runtime=await openRuntime({root:'/private/tmp/apple-notes-data79-ui'});
console.log('OPENED');
await runtime.cleanup();
console.log('CLOSED');
