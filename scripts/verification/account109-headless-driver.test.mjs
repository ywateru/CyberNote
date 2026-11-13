// Owned Node protocol fixtures only; never evidence of native account/data behavior.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {HeadlessApp,FrameDecoder,PREFIX,TRANSPORT,PARTICIPANT,MAX_REQUEST,MAX_REPLY,NATIVE_CODES,OPS,encodeRequest} from './account109-headless-driver.mjs';

if(process.argv.includes('--node-protocol-fixture')){
  const mode=process.env.ACCOUNT109_FIXTURE_MODE;
  const send=value=>process.stdout.write(PREFIX+JSON.stringify(value)+'\n');
  if(mode!=='noHello'){process.stdout.write('not retained provider diagnostic\n');send({type:'hello',protocol:1,pid:process.pid,transport:mode==='badHello'?'native-webview-eval-event':TRANSPORT,participant:PARTICIPANT});}
  const lines=createInterface({input:process.stdin});let active=0,maximum=0,completed=0,last=0;
  lines.on('line',async line=>{
    const {id,action,...extra}=JSON.parse(line);assert.equal(Object.keys(extra).length,0);assert(id>last);last=id;assert(Buffer.byteLength(line+'\n')<=MAX_REQUEST);assert(OPS.includes(action.op));active++;maximum=Math.max(maximum,active);
    if(action.op==='workspace'){
      if(mode==='hang')return;
      if(mode==='invalidResponse'){send({type:'response',id,ok:true});return;}
      if(['nativeError','rawError','nullInputError'].includes(mode)){send({type:'response',id:mode==='nullInputError'?null:id,ok:false,error:{code:mode==='nativeError'?'sync_deferred':mode==='nullInputError'?'input_error':'private_arbitrary_secret'}});return;}
    }
    await new Promise(done=>setTimeout(done,action.op==='createPlainNote'?15:1));
    const value=action.op==='ready'?{protocol:1,participant:PARTICIPANT,transport:TRANSPORT,windows:mode==='badReady'?1:0}:action.op==='shutdown'?{requested:true}:{completed:++completed,maximum,synthetic:'完整中文 🧪',switches:process.env.NOTES_SYNC_E2E==='1'&&process.env.NOTES_SYNC_E2E_HEADLESS==='1',...(action.op==='workspace'&&mode!=='badWorkspace'?{notes:[],attachments:[],access:{},metadata:{}}:{}),...(action.op==='createPlainNote'?{id:randomUUID(),document:{type:'doc'},plainText:'fixture',access:{},metadata:{}}:{})};
    active--;send({type:'response',id:mode==='wrongId'&&action.op==='workspace'?id+1:id,ok:true,value});
    if(action.op==='shutdown'){if(mode==='truncated')process.stdout.write(PREFIX+'{"type":"response"');if(mode!=='forced')lines.close();}
  });
  if(mode==='forced')setInterval(()=>{},1000);
}else{
  const {test}=await import('node:test');
  const fixture=(mode='ok',closeTimeoutMs=1000)=>new HeadlessApp(process.execPath,'/unit-not-a-store',{name:'node-protocol-fixture',commandArgs:[fileURLToPath(import.meta.url),'--node-protocol-fixture'],env:{ACCOUNT109_FIXTURE_MODE:mode},closeTimeoutMs});
  const clean=async app=>{await app.close().catch(()=>{});assert(app.lifecycle.exit,'Exact owned fixture exited');};
  test('wire is exact native v1: fixed ops, increasing safe IDs, no timeout/eval/action injection and bounded synthetic text',()=>{
    const valid=[...['ready','workspace','conflicts','accountStatus','signOut','shutdown'].map(op=>({op})),{op:'keepAll',kind:'note',entityId:'11111111-1111-4111-8111-111111111111',digest:'a'.repeat(64),keepAll:true},{op:'readAttachment',id:'11111111-1111-4111-8111-111111111111'},{op:'createPlainNote',title:'account109-标题',text:'account109-正文 😀'}];
    valid.forEach((action,i)=>assert.deepEqual(JSON.parse(encodeRequest(i+1,action)),{id:i+1,action}));
    for(const action of [{op:'eval',expression:'x'},{op:'execute',command:'signIn'},{op:'workspace',token:'private'},{op:'ready',timeoutMs:5},{...valid[6],keepAll:false},{...valid[6],digest:'invented'},{...valid[6],expected:{sessionId:'x'}},{...valid[7],id:'not-uuid'},{op:'createPlainNote',title:'real user data',text:'account109-ok'},{op:'createPlainNote',title:'account109-ok',text:'account109-\0bad'},{op:'createPlainNote',title:'account109-'+('中'.repeat(100)),text:'account109-ok'},{op:'createPlainNote',title:'account109-ok',text:'account109-'+('x'.repeat(16000))}])assert.throws(()=>encodeRequest(1,action));
    for(const id of [0,-1,1.2,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>encodeRequest(id,{op:'workspace'}));
    assert.throws(()=>encodeRequest(1,{...valid[6],digest:['a'.repeat(64)]}));assert.throws(()=>encodeRequest(1,{op:'createPlainNote',title:'account109-escape',text:'account109-'+('\u0001'.repeat(15000))}));
    assert.equal(typeof HeadlessApp.prototype.evaluate,'undefined');assert.equal(typeof HeadlessApp.prototype.execute,'undefined');assert.equal(typeof HeadlessApp.prototype.account,'undefined');
  });
  test('framing matches 16 MB native budget, UTF-8 byte splitting, discarded noise and malformed/truncated replies',()=>{
    assert.equal(MAX_REPLY,16000000+Buffer.byteLength(PREFIX)+1);const rows=[],decoder=new FrameDecoder(v=>rows.push(v)),data={type:'response',value:'完整中文 😀'};
    for(const byte of Buffer.from('unrecorded\n'+PREFIX+JSON.stringify(data)+'\n'))decoder.push(Buffer.from([byte]));decoder.end();assert.deepEqual(rows,[data]);assert.equal(decoder.noiseBytes,Buffer.byteLength('unrecorded\n'));
    assert.throws(()=>new FrameDecoder(()=>{}).push(Buffer.alloc(MAX_REPLY+1,65)),{code:'STDOUT_LINE_TOO_LARGE'});
    assert.throws(()=>new FrameDecoder(()=>{}).push(Buffer.from(PREFIX+'{\n')),{code:'INVALID_FRAME'});
    const tail=new FrameDecoder(()=>{});tail.push(Buffer.from(PREFIX+'{"type":"response"'));assert.throws(()=>tail.end(),{code:'TRUNCATED_FRAME'});
  });
  test('fixed requests serialize and require both environment switches; natural shutdown waits for child exit',async()=>{
    const app=fixture();try{assert.equal((await app.ready()).windows,0);const results=await Promise.all([1,2,3].map(i=>app.createPlainNote('account109-'+i,'account109-完整正文')));assert.deepEqual(results.map(v=>v.completed),[1,2,3]);assert(results.every(v=>v.maximum===1&&v.switches));await app.close();assert.equal(app.lifecycle.naturalExit,true);assert.equal(app.lifecycle.exit.code,0);assert(app.lifecycle.stdoutNoiseBytes>0);await assert.rejects(app.workspace(),{code:'APP_CLOSING'});}finally{await clean(app);}
  });
  test('clean stdin EOF uses exact owned normal exit',async()=>{const app=fixture();try{await app.ready();await app.close({eof:true});assert(app.lifecycle.naturalExit);}finally{await clean(app);}});
  for(const [mode,code] of [['badHello','INVALID_HELLO'],['badReady','NOT_HEADLESS_NATIVE_APP']])test(mode+' cannot become headless-ready',async()=>{const app=fixture(mode);try{await assert.rejects(app.ready(1000),{code});await assert.rejects(app.workspace(),{code});}finally{await clean(app);}});
  for(const [mode,code] of [['wrongId','UNEXPECTED_RESPONSE'],['invalidResponse','INVALID_RESPONSE'],['badWorkspace','INVALID_RESPONSE'],['rawError','INVALID_RESPONSE'],['nativeError','NATIVE_OPERATION_FAILED'],['nullInputError','NATIVE_OPERATION_FAILED']])test(mode+' fails closed without raw error strings or another operation',async()=>{
    const app=fixture(mode);try{await app.ready();await assert.rejects(app.workspace(),{code});const sent=app.lifecycle.commands;await assert.rejects(app.conflicts(),{code});assert.equal(app.lifecycle.commands,sent);if(mode==='nativeError')assert.equal(app.lifecycle.nativeErrorCode,'sync_deferred');assert(!JSON.stringify(app.lifecycle).includes('private_arbitrary_secret'));await assert.rejects(app.close(),{code});}finally{await clean(app);}
  });
  test('local timeout is not sent on wire, fails closed, and exact owned fixture is joined',async()=>{const app=fixture('hang');try{await app.ready();await assert.rejects(app.request({op:'workspace'},5),{code:'DRIVER_TIMEOUT'});await assert.rejects(app.conflicts(),{code:'DRIVER_TIMEOUT'});}finally{await clean(app);assert.equal(app.lifecycle.naturalExit,false);}});
  test('missing hello is bounded and cannot send business operations',async()=>{const app=fixture('noHello');try{await assert.rejects(app.ready(100),{code:'HELLO_TIMEOUT'});assert.equal(app.lifecycle.commands,0);}finally{await clean(app);}});
  test('shutdown ACK cannot mask a truncated stream tail or required signal',async()=>{
    for(const mode of ['truncated','forced']){const app=fixture(mode,100);try{await app.ready();await assert.rejects(app.close());assert.equal(app.lifecycle.naturalExit,false);if(mode==='forced')assert.deepEqual(app.lifecycle.forcedSignals,['SIGTERM']);else assert.equal(app.lifecycle.failureCode,'TRUNCATED_FRAME');}finally{await clean(app);}}
  });
  test('native diagnostic code allowlist is exactly the agreed finite set',()=>assert.deepEqual(NATIVE_CODES,['invalid_request','invalid_id','input_error','access_changed','not_found','sync_deferred','sync_disabled','sync_busy','sync_invalid','conflict_changed','operation_failed']));
}
