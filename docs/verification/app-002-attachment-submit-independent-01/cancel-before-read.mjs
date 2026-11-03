import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import ts from "typescript";
import {Schema} from "@tiptap/pm/model";
import {EditorState} from "@tiptap/pm/state";
const hashes = {};
const modules = new Map();
async function production(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const source = await readFile(`src/${name}.ts`, "utf8");
  hashes[name] = createHash("sha256").update(source).digest("hex");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  if (name === "bridge" || name === "proof-access") {
    for (const dependency of [
      "access-client",
      "secure-id",
      "proof-access",
      "types",
    ]) {
      if (!output.includes(`"./${dependency}"`)) continue;
      await production(dependency);
      output = output.replaceAll(
        `"./${dependency}"`,
        JSON.stringify(modules.get(dependency).url),
      );
    }
    output = output.replaceAll(
      "import.meta.env.VITE_ACCESS_BOUNDARY_PROOF",
      '"0"',
    );
    const core = `export const isTauri = () => true; export const invoke = (...args) => globalThis.__attachmentBridgeBoundary.invoke(...args);`;
    const event = `export const listen = async () => () => {};`;
    for (const [specifier, code] of [
      ["@tauri-apps/api/core", core],
      ["@tauri-apps/api/event", event],
    ])
      output = output.replaceAll(
        JSON.stringify(specifier),
        JSON.stringify(
          `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`,
        ),
      );
  }
  if (name === "attachment-target") {
    await production("document-equality");
    output = output.replace(
      '"./document-equality"',
      JSON.stringify(modules.get("document-equality").url),
    );
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  const exports = await import(url);
  modules.set(name, { url, exports });
  return exports;
}

const {AttachmentSubmission,documentReferencesAttachment}=await production("attachment-submission");
const {TrustedSynchronization}=await production("trusted-synchronization");
const {rebindAttachmentTarget}=await production("attachment-target");
const bridge=await production("bridge");
const source=await readFile("src/App.tsx","utf8");
const ast=ts.createSourceFile("App.tsx",source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
function actualClosure(name,dependencies){let expression;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)expression=node.initializer.getText(ast);ts.forEachChild(node,visit)}visit(ast);assert.ok(expression,name);const js=ts.transpileModule("const actual = "+expression+";",{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return new Function(...Object.keys(dependencies),js+"return actual;")(...Object.values(dependencies));}
const state={sessionId:"review-session",epoch:4,notes:{"note-a":{epoch:7,authorized:true}},suspended:[],operationId:null};bridge.accessGate.state=state;
const schema=new Schema({nodes:{doc:{content:"paragraph+"},paragraph:{content:"text*"},text:{}}});
const document={type:"doc",content:[{type:"paragraph"}]};
const pm=EditorState.create({schema,doc:schema.nodeFromJSON(document)});
const editor={isDestroyed:false,isEditable:true,state:pm,getJSON:()=>document};
const nativeEditorOwners={current:new WeakMap([[editor,"note-a"]])};
const nativeDocumentVersions={current:new WeakMap([[editor,0]])};
const target={noteId:"note-a",scope:"scope-a",stamp:bridge.accessGate.stamp("note-a"),editor,owner:"note-a",bookmark:pm.selection.getBookmark(),documentVersion:0,externalVersion:0,document,trustedDocument:document,invalidated:false};
const synchronization=new TrustedSynchronization();
const ws={notes:[{id:"note-a",document,locked:false,deletedAt:null}]};
const runtime={current:{noteId:"note-a",scope:"scope-a",editor,available:true}};
const deps={flush:async()=>{},synchronizeRef:{current:()=>synchronization.request(()=>bridge.invalidateAccessRequests(),async()=>ws,()=>{},e=>{throw e})},pickerRuntime:runtime,wsRef:{current:ws},rebindAttachmentTarget,accessGate:bridge.accessGate,nativeEditorOwners,nativeDocumentVersions,externalVersions:{current:new Map()},synchronization,blockedNotes:{current:new Set()}};
const validatePickerTarget=actualClosure("validatePickerTarget",deps);
const batch={target,operationIds:["4b462c24-3a75-47fe-8b9f-259214cfd720"],files:[{name:"a.pdf",type:"application/pdf"}]};
const attachmentSubmissions={current:new Map()},attachmentBatches={current:new Set([batch])};
const calls=[],journal=new Map();let reader;globalThis.FileReader=class{readAsDataURL(file){this.file=file;reader=this}complete(){this.result="data:application/pdf;base64,JVBERg==";this.onload()}};
globalThis.__attachmentBridgeBoundary={invoke:async(command,params)=>{calls.push({command,operationId:params.operationId});if(command==="cancel_attachment_operation")return{operationId:params.operationId,noteId:params.noteId,status:"notPersisted",access:state};if(command==="store_attachment_operation"){const attachment={id:"review-attachment",noteId:params.noteId,kind:"file",displayName:params.name,mime:params.mime,size:4,relativePath:"controlled"};const result={operationId:params.operationId,noteId:params.noteId,status:"stored",attachment,access:state};journal.set(params.operationId,result);return result}throw Error(command)}};
const common={attachmentBatches,attachmentSubmissions,validatePickerTarget,AttachmentSubmission,native:true,storeAttachmentOperation:bridge.storeAttachmentOperation,queryAttachmentOperation:bridge.queryAttachmentOperation,cancelAttachmentOperation:bridge.cancelAttachmentOperation,documentReferencesAttachment,nativeDocumentVersions,queues:{current:new Map()},pendingDocs:{current:new Map()},saveDoc:async()=>{throw Error("unexpected save")},refresh:async()=>{},setMenu:()=>{},setError:()=>{}};
const submit=actualClosure("submitAttachmentBatch",common),cancel=actualClosure("discardUninsertedAttachments",common);
const pending=submit(batch);const result=pending.then(()=>({success:true}),error=>({success:false,message:error.message}));
for(let i=0;i<30&&!reader;i++)await Promise.resolve();assert.ok(reader,"actual bridge waiting on FileReader");
assert.equal(attachmentSubmissions.current.values().next().value.storageAttempted,true);assert.equal(calls.length,0);
await cancel();
assert.equal(attachmentBatches.current.size,0);assert.equal(attachmentSubmissions.current.size,0);assert.equal(calls[0].command,"cancel_attachment_operation");
reader.complete();const completed=await result;
assert.equal(completed.success,false);assert.equal(calls[1].command,"store_attachment_operation");assert.equal(journal.size,1);assert.equal(attachmentSubmissions.current.size,0);assert.equal(attachmentBatches.current.size,0);
const output={candidate:"607950a57b1a1f01eb59b2e4db5738b66e890c40",status:"REPRODUCED",execution:"AST-extracted unchanged production App validate/submit/cancel closures + production AttachmentSubmission/TrustedSynchronization/bridge/AccessGate + real PM bookmark; controlled FileReader and invoke; backend states follow existing Store semantics; no actual Rust DB or device",calls,completed,final:{backendStoredOperations:journal.size,frontendBatches:attachmentBatches.current.size,frontendSubmissions:attachmentSubmissions.current.size,targetInvalidated:target.invalidated},sourceSha256:{App:createHash("sha256").update(source).digest("hex"),...hashes}};
console.log(JSON.stringify(output,null,2));
