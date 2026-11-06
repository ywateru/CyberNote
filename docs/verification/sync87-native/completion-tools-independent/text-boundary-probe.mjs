import {roundtrip} from '/private/tmp/apple-notes-sync87-native/scripts/debug/sync87-native/scenarios.mjs';
const owner={id:'11111111-1111-4111-8111-111111111111',marker:'EXPECTED-MOBILE-TEXT'};
const state={notes:[owner],files:[{name:'sync87-a1b2c3d4e5.png'},{name:'sync87-a1b2c3d4e5.wav'}],desktopFiles:[],runId:'a1b2c3d4e5'};
const workspace={notes:[{id:owner.id,plainText:'',document:{type:'doc',content:[]}}],attachments:state.files.map((f,i)=>({id:'attachment-'+i,noteId:owner.id,displayName:f.name}))};
let enteredCreate=false,error;
try{await roundtrip({client:{},peer:{workspace:async()=>workspace,verifyOriginal:async()=>({syntheticStub:true}),create:async()=>{enteredCreate=true;throw Error('REVIEW_STOP_BEFORE_ANY_NATIVE_ACTION')}},state,output:'/private/tmp/notes-sync87-native-completion-independent-01',saveState:async()=>{}});}catch(e){error=e.message;}
console.log(JSON.stringify({scope:'host-only adversarial explicit stubs; no file bytes/network/native proof',desktopReceivedMobileBody:'empty',expectedMobileMarker:owner.marker,acceptedMobileTextBoundary:enteredCreate,error}));
if(!enteredCreate||error!=='REVIEW_STOP_BEFORE_ANY_NATIVE_ACTION')process.exitCode=1;
