// Finite source-boundary test: compile exact frozen production arrow bodies.
// Explicit lifecycle fixtures backed by real headless editor documents, mocked
// storage boundary. Headless Tiptap itself reports isDestroyed=true without DOM;
// these boundary fixtures do not claim mounted Editor or React/native proof.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const work='/private/tmp/apple-notes-search-zero-01';
const require=createRequire(work+'/package.json');
const ts=require('typescript');
const {Editor}=await import(pathToFileURL(require.resolve('@tiptap/core')));
const {createEditorExtensions}=await import(pathToFileURL(work+'/artifacts/search-selection/editor-schema.mjs'));
const {shouldClearSearchAfterAccessChange}=await import(pathToFileURL(work+'/artifacts/search-selection/search-selection.mjs'));
const source=readFileSync(work+'/src/App.tsx','utf8');
const sf=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const nodes=new Map();
function visit(n){
 if(ts.isVariableDeclaration(n)&&['fileSelected','captureSearchAttachmentTarget'].includes(n.name.getText(sf)))nodes.set(n.name.getText(sf),n.initializer);
 if(ts.isBinaryExpression(n)&&['nativeAssert.current','clearSensitive.current'].includes(n.left.getText(sf)))nodes.set(n.left.getText(sf),n.right);
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(sf)==='RecordingPanel'){
  const a=n.attributes.properties.find(a=>a.name?.getText(sf)==='onDone');nodes.set('recordingOnDone',a.initializer.expression);
 }
 ts.forEachChild(n,visit);
}
visit(sf);
const extracted=[];
function bind(name,env){const n=nodes.get(name);assert(n,name);const text=n.getText(sf);extracted.push({name,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,sha256:createHash('sha256').update(text).digest('hex')});const compiled=ts.transpileModule('const extracted='+text+';return extracted;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;return new Function('env','with(env){'+compiled+'}')(env)}
const create=()=>{const documentEditor=new Editor({element:null,extensions:createEditorExtensions(),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'fixture'}]}]}});return{isDestroyed:false,isEditable:true,state:documentEditor.state,getJSON:()=>documentEditor.getJSON(),destroy(){this.isDestroyed=true;documentEditor.destroy()}}};
function fixture(){
 const a=create(),b=create(),state={query:'matchB',record:true,draw:{strokes:[]},modal:null},calls={stored:[],errors:[],insertions:[]};
 const owners=new WeakMap([[a,'A'],[b,'B']]);
 const env={desktopSearch:true,noteId:'B',nativeScope:'scopeB',editor:b,current:{id:'B',locked:false},loading:false,synchronizing:false,accessSuspended:[],modal:null,draw:null,record:true,accessGate:{stamp:id=>({noteId:id,epoch:1}),state:{notes:{A:{authorized:true},B:{authorized:true}},suspended:[]}},blockedNotes:{current:new Set()},nativeEditorOwners:{current:owners},nativeDocumentVersions:{current:new WeakMap()},nativeAttachmentTarget:{current:null},nativeAssert:{current:null},clearSensitive:{current:null},nativeToolbar:{current:{invalidate:()=>{}}},editorsRef:{current:new Map([['A',a],['B',b]])},barrierEditor:{current:null},formatTarget:{current:null},paperTarget:{current:null},shouldClearSearchAfterAccessChange,fileInput:{current:{value:''}},cameraInput:{current:{value:''}},refresh:async()=>{},fail:e=>calls.errors.push(e.message),storeAttachment:async(id,file)=>{calls.stored.push({id,name:file.name});return{id:'test-attachment',displayName:file.name,kind:'audio'}}};
 for(const field of ['Menu','Modal','ModalValue','Draw','Record','Editing','ShowFind','Find','Query','Searching','ContextNote'])env['set'+field]=v=>state[field[0].toLowerCase()+field.slice(1)]=v;
 env.nativeAssert.current=bind('nativeAssert.current',env);
 env.clearSensitive.current=bind('clearSensitive.current',env);
 const capture=bind('captureSearchAttachmentTarget',env),files=bind('fileSelected',env),recording=bind('recordingOnDone',env);
 return{a,b,env,state,calls,capture,files,recording};
}
const results=[];
{
 const f=fixture();f.capture();f.env.nativeAssert.current(f.env.nativeAttachmentTarget.current,true,true);f.env.clearSensitive.current(['A']);assert.equal(f.state.query,'matchB');assert.equal(f.state.record,true);assert(f.a.isDestroyed);assert(!f.b.isDestroyed);assert(f.env.nativeAttachmentTarget.current);assert.equal(f.env.nativeAttachmentTarget.current.editor,null);assert.equal(f.env.nativeAttachmentTarget.current.bookmark,null);
 f.env.record=false;await f.files([{name:'late.webm'}]);assert.equal(f.calls.stored.length,0);assert.deepEqual(f.calls.errors,['编辑内容或选区已改变，请重新选择后执行操作']);results.push('hidden A change preserves B projection/overlay; exact production tombstone rejects late picker before storage');
}
{
 const f=fixture();f.capture();f.env.clearSensitive.current(['B']);assert.equal(f.state.query,'');assert.equal(f.state.record,false);assert.equal(f.state.draw,null);assert.equal(f.state.modal,null);assert(f.b.isDestroyed);f.env.noteId='A';f.env.nativeScope='scopeA';f.env.current={id:'A',locked:false};f.env.editor=f.a;
 await f.recording({name:'late.webm'});assert.equal(f.calls.stored.length,0);assert.deepEqual(f.calls.errors,['备忘录或授权状态已改变，请重新执行操作']);results.push('active B invalidation closes overlays and tombstone rejects recording completion against latest A');
}
for(const kind of ['files','recording']){
 const f=fixture();f.capture();if(kind==='files')f.env.record=false;let resolveStore;f.env.storeAttachment=async(id,file)=>{f.calls.stored.push({id,name:file.name});return new Promise(resolve=>resolveStore=resolve)};
 const beforeA=f.a.getJSON(),beforeB=f.b.getJSON();const pending=f[kind](kind==='files'?[{name:'late.webm'}]:{name:'late.webm'});assert.equal(f.calls.stored[0].id,'B');f.env.noteId='A';f.env.nativeScope='scopeA';f.env.current={id:'A',locked:false};f.env.editor=f.a;resolveStore({id:'test-attachment',displayName:'late.webm',kind:'audio'});await pending;assert.deepEqual(f.calls.errors,['备忘录或授权状态已改变，请重新执行操作']);assert.deepEqual(f.a.getJSON(),beforeA);assert.deepEqual(f.b.getJSON(),beforeB);results.push(kind+': actual production await boundary rejects changed scope before document insertion; stored orphan/compensation not accepted');
}
const result={status:'PASS_FINITE_PRODUCTION_SOURCE_BOUNDARIES',candidate:'b144c6e',results,extracted,limitations:['Explicit editor lifecycle fixtures backed by real headless docs; no mounted Editor proof.','Mocked attachment store; no persistence, operation compensation or native picker lifecycle proof.','No mounted React or device run.'],harnessCorrection:'First attempt rejected because unmounted Tiptap reports isDestroyed=true; fixture lifecycle made explicit, not a product failure.'};
writeFileSync(new URL('./production-boundaries.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
