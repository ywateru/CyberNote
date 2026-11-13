// Device-free policies and fixed-effect fixtures only. No ADB, App or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loginRadioPolicy,loginControls,nativeLoginProjection,nativeLoginControls,loginForeground,PACKAGE} from './account109-android.mjs';
import {KNOWN_BODIES,APK_SHA,options,cleanSignedOut,snapshot,validateBaseline,bounded,exercise,run} from './account109-android-login-surfaces.mjs';
import {hash} from './account109-desktop-recovery.mjs';
const out=()=>({state:'signedOut',enabled:false,devices:[],conflictCount:0});
const pending=surface=>({...out(),state:'authorizing',authorizationSurface:surface});
function clock(){let t=0;return {now:()=>t,sleep:async ms=>{t+=ms;}};}
const radios=()=>['embedded','browser'].map((value,i)=>({value,label:['应用内登录','系统浏览器'][i],disabled:false,visible:true}));

test('signIn uses real radio selection before login; legacy no-radio accepts only omitted browser',async()=>{
  for(const surface of ['embedded','browser',undefined])for(const legacy of [false,true]){
    const events=[];const c=loginControls({open:async()=>events.push('open'),radios:async()=>legacy?[]:radios(),select:async s=>events.push('select '+s),clickLogin:async()=>events.push('login'),status:async()=>pending(surface??'browser'),wait:async predicate=>predicate()});
    if(legacy&&surface!==undefined){await assert.rejects(()=>c.signIn(surface),{code:'ANDROID_LOGIN_RADIOS_REQUIRED'});assert.deepEqual(events,['open']);}
    else{await (surface===undefined?c.signIn():c.signIn(surface));assert.deepEqual(events,['open',...(!legacy?['select '+(surface??'browser')]:[]),'login']);}
    const before=events.length;for(const args of [[{surface:'embedded'}],['unknown'],['embedded','url'],[null]])await assert.rejects(()=>c.signIn(...args),{code:'ANDROID_LOGIN_SURFACE_INVALID'});assert.equal(events.length,before);
  }
});
test('missing, duplicate, hidden, disabled, mislabeled or reordered radios fail before selecting/login',()=>{
  for(const change of [r=>r.pop(),r=>r.push(r[0]),r=>r.reverse(),r=>{r[0].visible=false;},r=>{r[1].disabled=true;},r=>{r[0].label='wrong';},r=>{r[1].value='https://invalid.test';}]){const r=radios();change(r);assert.throws(()=>loginRadioPolicy(r,'embedded',true));}
});
function xml({inside=false,duplicate=false,form=true,foreign=false,hidden=false}={}){
  const node=(attrs,body='')=>`<node package="${foreign?'com.personal.app':PACKAGE}" bounds="[0,0][100,100]" enabled="true" ${attrs}>${body}</node>`;
  const continuing=node('class="android.widget.Button" text="在浏览器中继续" clickable="true"');
  const cancel=node('class="android.widget.Button" text="取消登录" clickable="true"');
  const web=node(`class="android.webkit.WebView" visible-to-user="${!hidden}"`,(inside?continuing+cancel:'')+(form?node('class="android.widget.EditText" text="PRIVATE INPUT VALUE"')+node('class="android.widget.Button" text="Continue" clickable="true"'):''));
  return '<?xml version="1.0"?><hierarchy>'+node('class="android.widget.FrameLayout"',(inside?'':continuing+cancel)+(duplicate?continuing:'')+web)+'</hierarchy>';
}
test('RAM-only native projection exposes booleans and rejects web content posing as native toolbar',()=>{
  assert.deepEqual(nativeLoginProjection(xml()),{dialog:true,webView:true,hostedForm:true});assert(!JSON.stringify(nativeLoginProjection(xml())).includes('PRIVATE'));
  for(const config of [{inside:true},{duplicate:true},{foreign:true},{hidden:true},{form:false}])assert(Object.values(nativeLoginProjection(xml(config))).some(x=>x===false));
  for(const raw of ['', 'UI hierarchy dumped to: /dev/tty', '<!DOCTYPE x><hierarchy/>','<hierarchy><node class="x">','x'.repeat(2_000_001)])assert.throws(()=>nativeLoginProjection(raw),{code:'ANDROID_NATIVE_XML_INVALID'});
});
test('form evidence cannot be borrowed from a foreign or second WebView or foreign child nodes',async()=>{
  const node=(pkg,cls,attrs='',body='')=>`<node package="${pkg}" class="${cls}" bounds="[0,0][100,100]" enabled="true" ${attrs}>${body}</node>`;
  const form=pkg=>node(pkg,'android.widget.EditText')+node(pkg,'android.widget.Button','text="Continue" clickable="true"');
  const addedWeb=pkg=>node(pkg,'android.webkit.WebView','',form(pkg));
  const mixed=pkg=>xml({form:false}).replace('</node></hierarchy>',addedWeb(pkg)+'</node></hierarchy>');
  const foreignChildren=xml({form:false}).replace('<node package="'+PACKAGE+'" bounds="[0,0][100,100]" enabled="true" class="android.webkit.WebView" visible-to-user="true"></node>',node(PACKAGE,'android.webkit.WebView','',form('com.personal.app')));
  assert(foreignChildren.includes('com.personal.app'));
  for(const raw of [mixed('com.personal.app'),mixed(PACKAGE),foreignChildren]){
    assert.equal(nativeLoginProjection(raw).hostedForm,false);const effects=[];const c=nativeLoginControls({capture:async()=>raw,guard:async()=>{},back:async()=>effects.push('back'),tap:async()=>effects.push('tap')});await assert.rejects(()=>c.closeNativeLogin());await assert.rejects(()=>c.continueNativeLogin());assert.deepEqual(effects,[]);
  }
});
test('nested form belongs to the unique owned visible WebView root; foreign, hidden or independent paths fail closed',async()=>{
  const node=(cls,body='',{pkg=PACKAGE,shown=true,attrs=''}={})=>`<node package="${pkg}" class="${cls}" bounds="[0,0][100,100]" visible-to-user="${shown}" enabled="true" ${attrs}>${body}</node>`;
  const field=()=>node('android.widget.EditText');
  const action=()=>node('android.widget.Button','',{attrs:'text="登录" clickable="true"'});
  const form=field()+field()+action();
  const web=(body,opts)=>node('android.webkit.WebView',body,opts);
  const toolbar=node('android.widget.Button','',{attrs:'text="在浏览器中继续" clickable="true"'})+node('android.widget.Button','',{attrs:'text="取消登录" clickable="true"'});
  const tree=body=>'<hierarchy>'+node('android.widget.FrameLayout',toolbar+body)+'</hierarchy>';
  const valid=tree(web(web(form)));
  assert.deepEqual(nativeLoginProjection(valid),{dialog:true,webView:true,hostedForm:true});
  const invalid=[
    tree(web(web(form,{pkg:'com.personal.app'}))),
    tree(web(node('android.widget.FrameLayout',web(form),{pkg:'com.personal.app'}))),
    tree(web(web(web(form),{pkg:'com.personal.app'}))),
    tree(web(web(form,{shown:false}))),
    tree(web(web(node('android.widget.FrameLayout',form,{shown:false})))),
    tree(web(web(form))+web(web(form))),
    tree(web('')+web(form,{pkg:'com.personal.app'})),
    tree(web(web(field()+node('android.widget.Button','',{shown:false,attrs:'text="登录" clickable="true"'})))),
  ];
  for(const method of ['closeNativeLogin','continueNativeLogin']){
    const effects=[];const controls=raw=>nativeLoginControls({capture:async()=>raw,guard:async()=>{},back:async()=>effects.push('back'),tap:async()=>effects.push('tap')});
    await controls(valid)[method]();assert.deepEqual(effects,[method==='closeNativeLogin'?'back':'tap']);effects.length=0;
    for(const raw of invalid){assert.equal(nativeLoginProjection(raw).hostedForm,false);await assert.rejects(()=>controls(raw)[method](),{code:'ANDROID_NATIVE_LOGIN_FORM_REQUIRED'});assert.deepEqual(effects,[]);}
  }
});
test('only owned visible form permits fixed native Back/tap; guard loss or ambiguity causes no input',async()=>{
  for(const action of ['closeNativeLogin','continueNativeLogin']){
    const events=[];const c=nativeLoginControls({capture:async()=>xml(),guard:async()=>events.push('guard'),back:async()=>events.push('back'),tap:async(x,y)=>events.push(['tap',x,y])});await c[action]();assert.deepEqual(events.at(-1),action==='closeNativeLogin'?'back':['tap',50,50]);
    for(const config of [{inside:true},{duplicate:true},{foreign:true},{form:false}]){const effects=[];const bad=nativeLoginControls({capture:async()=>xml(config),guard:async()=>{},back:async()=>effects.push('back'),tap:async()=>effects.push('tap')});await assert.rejects(()=>bad[action]());assert.deepEqual(effects,[]);}
    let valid=true;const lost=nativeLoginControls({capture:async()=>{valid=false;return xml();},guard:async()=>{assert(valid);},back:async()=>assert.fail(),tap:async()=>assert.fail()});await assert.rejects(()=>lost[action]());
  }
  const c=nativeLoginControls({capture:async()=>xml({form:false}),guard:async()=>{},back:async()=>assert.fail(),tap:async()=>assert.fail()});assert.equal((await c.nativeLoginPresentation()).hostedForm,false);
});
test('external browser observation accepts exact known package only, never personal or prefix package',()=>{
  const dump=p=>`mResumedActivity: ActivityRecord{abcd u0 ${p}/.MainActivity t1}`;
  assert.deepEqual(loginForeground(dump(PACKAGE)),{owned:true,browser:false});assert.deepEqual(loginForeground(dump('com.android.chrome')),{owned:false,browser:true});
  for(const pkg of ['com.personal.app',PACKAGE+'.evil','com.android.chrome.evil'])assert.deepEqual(loginForeground(dump(pkg)),{owned:false,browser:false});
});
test('strict signedOut never admits profile, error, surface, enabled, connected or conflicted samples',()=>{
  assert(cleanSignedOut(out()));for(const change of [{profile:{}},{error:{code:'account_network'}},{authorizationSurface:'embedded'},{enabled:true},{devices:[{connected:true}]},{devices:null},{conflictCount:1},{state:'authorizing'}])assert.throws(()=>cleanSignedOut({...out(),...change}));
});
function workspaceFixture(){
  const ws={notes:KNOWN_BODIES.map(([id],i)=>({id,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'synthetic '+i,marks:[{type:'bold'}]}]}]},plainText:'synthetic '+i,title:'test '+i,pinned:false})),attachments:[]};
  const known=ws.notes.map(n=>[n.id,hash(JSON.stringify(n.document)),hash(n.plainText)]),bytes=Buffer.from('synthetic attachment');
  const id='11111111-1111-4111-8111-111111111111',owner=ws.notes[0];owner.document.content.push({type:'attachment',attrs:{id}});known[0][1]=hash(JSON.stringify(owner.document));ws.attachments.push({id,noteId:owner.id,displayName:'test.bin',kind:'file',mime:'application/octet-stream',size:bytes.length,relativePath:'fixture.bin'});
  const peer={readWorkspace:async()=>structuredClone(ws),readAttachment:async()=>({data:bytes.toString('base64'),sha256:hash(bytes)})};return {peer,ws,known,bytes};
}
test('baseline kernel preserves full body/metadata/reference ownership and original bytes; unknown data fails',async()=>{
  const f=workspaceFixture(),before=await snapshot(f.peer,f.known);assert.equal(before.notes.length,4);assert.equal(before.attachments.length,1);assert(!JSON.stringify(before).includes('synthetic'));
  for(const mutate of [w=>{w.notes[0].pinned=true;},w=>{w.attachments[0].displayName='other.bin';}]){const saved=structuredClone(f.ws);mutate(f.ws);assert.notDeepEqual(await snapshot(f.peer,f.known),before);Object.assign(f.ws,saved);}
  for(const mutate of [w=>{w.notes.pop();},w=>{w.notes[0].document.content[0].content[0].marks=[];},w=>{w.notes[0].plainText+='lost';},w=>{w.attachments[0].noteId=w.notes[1].id;},w=>{w.attachments[0].size++;},w=>{w.notes.push(w.notes[0]);}]){const saved=structuredClone(f.ws);mutate(f.ws);await assert.rejects(()=>snapshot(f.peer,f.known));Object.assign(f.ws,saved);}
  await assert.rejects(()=>snapshot(f.peer)); // CLI's fixed history gate, no fixture override.
  const wrong={...f.peer,readAttachment:async()=>({data:Buffer.from('changed').toString('base64'),sha256:hash(f.bytes)})};await assert.rejects(()=>snapshot(wrong,f.known));
});
test('history hashes match committed original four-note evidence and baseline import rejects unsafe extra fields',async()=>{
  const archived=JSON.parse(await readFile(new URL('../../docs/verification/account109/android/9263-signin01/result.json',import.meta.url),'utf8'));
  assert.deepEqual(KNOWN_BODIES,archived.originalNotes.map(n=>[n.id,n.documentSha256,n.plainTextSha256]));
  const b={schema:1,kind:'account109-android-login-baseline',serial:'98895a3147304c3132',package:PACKAGE,apkSha256:'a'.repeat(64),data:{notes:KNOWN_BODIES.map(([id,documentSha256,plainTextSha256])=>({id,documentSha256,plainTextSha256,branchSha256:'b'.repeat(64)})),attachments:[]}};validateBaseline(b);
  for(const mutate of [b=>{b.secret='private';},b=>{b.data.notes[0].documentSha256='c'.repeat(64);},b=>{b.data.notes[0].body='private';},b=>{b.data.notes.pop();},b=>{b.package='com.personal.app';}]){const bad=structuredClone(b);mutate(bad);assert.throws(()=>validateBaseline(bad));}
});
function smoke({form=true,transfer=true,error=false,loss=false,forced=false,locked=false}={}){
  const c=clock(),events=[],records=[],baseline={syntheticHash:'a'},peers=[];let state=out(),surface;
  const peer={accountStatus:async()=>error&&surface?{...state,error:{code:'account_network'}}:state,signIn:async s=>{events.push('signIn '+s);surface=s;state=pending(s);return state;},nativeLoginPresentation:async()=>({dialog:true,webView:true,hostedForm:form}),closeNativeLogin:async()=>{if(locked)throw Error('locked');events.push('Back');state=out();},continueNativeLogin:async()=>{events.push('continue');if(transfer)state=pending('browser');},externalLoginActivity:async()=>({owned:false,browser:true}),returnFromLoginBrowser:async()=>events.push('return owned'),cancelLogin:async()=>{events.push('cancel');state=out();},closeSettings:async()=>events.push('close settings'),reclaimSignedOut:async()=>{events.push('reclaim');return {oldPid:1,forceStop:forced};},close:async()=>events.push('close')};
  peers.push(peer);const restarted={accountStatus:async()=>out()};return {c,events,records,baseline,args:{peer,baseline,clock:c,capture:async p=>loss&&p===restarted?{lost:true}:baseline,reopen:async()=>{events.push('reopen');return restarted;},record:async(name,proof)=>records.push({name,...proof})}};
}
test('two embedded cases and optional browser preserve full baseline through owned-only restart',async()=>{
  for(const scenario of ['embedded-back','embedded-browser','browser']){
    const f=smoke();await exercise({...f.args,scenario});assert.equal(f.events.filter(e=>e.startsWith('signIn')).length,1);assert.equal(f.events.includes('Back'),scenario==='embedded-back');assert.equal(f.events.includes('continue'),scenario==='embedded-browser');assert.equal(f.events.includes('cancel'),scenario!=='embedded-back');assert.equal(f.c.now(),9000);assert.equal(f.records.at(-1).name,'restarted-preserved');assert.equal(f.records.at(-1).samples,7);
  }
});
test('preexisting profile/error/unknown state stops before any login, note write or reclaim',async()=>{
  for(const s of [{...out(),profile:{subject:'synthetic'}},{...out(),state:'error',error:{code:'account_network'}},{...out(),state:'ready'},{...out(),enabled:true}]){
    const f=smoke();f.args.peer.accountStatus=async()=>s;await assert.rejects(()=>exercise(f.args));assert.deepEqual(f.events,[]);assert.deepEqual(f.records,[]);
  }
});
test('form not loaded, transfer not confirmed, terminal error/lock/body loss/forced reclaim cannot pass',async()=>{
  for(const [config,scenario] of [[{form:false},'embedded-back'],[{transfer:false},'embedded-browser'],[{error:true},'embedded-back'],[{locked:true},'embedded-back'],[{loss:true},'embedded-back'],[{forced:true},'embedded-back']]){
    const f=smoke(config);await assert.rejects(()=>exercise({...f.args,scenario}));assert(!f.records.some(r=>r.name==='restarted-preserved'));assert.equal(f.events.filter(e=>e.startsWith('signIn')).length,1);if(config.form===false){assert.equal(f.c.now(),63000);assert(!f.events.includes('Back'));}if(config.transfer===false){assert.equal(f.c.now(),33000);assert(!f.events.includes('cancel'));}
  }
});
test('fixed wait rejects status that only arrives at deadline',async()=>{const c=clock();await assert.rejects(()=>bounded('late',async()=>{await c.sleep(1000);return true;},1000,c));});
test('CLI separates read-only export from smoke; reviewed APK pin and baseline are required before device access',async()=>{
  const output='/private/tmp/account109-android-login-surfaces-unit-no-run';assert(options(['--output',output,'--export-baseline']).exportBaseline);
  assert.equal(options(['--output',output,'--baseline','/private/tmp/baseline.json','--case','embedded-back']).scenario,'embedded-back');
  for(const args of [['--output',output,'--export-baseline','--case','browser'],['--output',output,'--baseline','/private/tmp/baseline.json','--case','unknown'],['--output',output,'--token','private'],['--output','/Users/personal/output','--export-baseline']])assert.throws(()=>options(args));
  assert.equal(APK_SHA,'654ab2a820de70588edcceb5231818b3580e425cdf7de1db395b585066091268');await assert.rejects(()=>run(['--output',output,'--baseline',`/private/tmp/account109-android-login-surfaces-missing-${process.pid}.json`,'--case','embedded-back']),{code:'ENOENT'});
});
