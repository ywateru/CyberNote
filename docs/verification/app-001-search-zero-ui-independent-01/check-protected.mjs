import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const baseline = "7ef7975c26021051dd1041b40eb8af570b88bd84";
const digest = text => createHash("sha256").update(text).digest("hex");
function declarations(source) {
  const ast = ts.createSourceFile("App.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const nodes = [];
  function visit(node) {nodes.push(node);ts.forEachChild(node,visit);}
  visit(ast);
  const result = new Map();
  for (const name of ["listed","desktopSearch","noteId","restoreEditor","saveDoc","validatePickerTarget","submitAttachmentBatch","retryAttachments","discardUninsertedAttachments","capturePickerTarget","openAttachmentPicker","captureSearchAttachmentTarget"]) {
    const matches=nodes.filter(node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)===name);
    assert.equal(matches.length,1,name);
    result.set(name,matches[0].getText(ast));
  }
  for (const name of ["RecordingPanel","SearchEditorHost"]) {
    const matches=nodes.filter(node=>ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)===name);
    assert.equal(matches.length,1,name);
    result.set(name,matches[0].getText(ast));
  }
  return result;
}
const actual=declarations(await readFile("src/App.tsx","utf8"));
const old=declarations(execFileSync("git",["show",`${baseline}:src/App.tsx`],{encoding:"utf8"}));
const results=[];
for (const [name,text] of actual) {
  assert.equal(text,old.get(name),name);
  results.push({name,bytes:Buffer.byteLength(text),sha256:digest(text),sameAsBaseline:true});
}
const path="plugins/tauri-plugin-notes-ui/macos/toolbar.m";
const native=await readFile(path,"utf8");
const oldNative=execFileSync("git",["show",`${baseline}:${path}`],{encoding:"utf8"});
for (const [name,start,end] of [["native first responder body","- (NSDictionary *)focusSearch {","- (void)send:"],["native focus C entry","char *notes_ui_focus_search(","void notes_ui_destroy("]]) {
  const extract=source=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  assert(native.includes(start)&&oldNative.includes(start));
  const body=extract(native);
  assert.equal(body,extract(oldNative),name);
  results.push({name,bytes:Buffer.byteLength(body),sha256:digest(body),sameAsBaseline:true});
}
console.log(JSON.stringify({status:"passed",baseline,protectedBodies:results.length,results,scope:"Independently extracted complete App declarations/JSX and native focus bodies; no DOM/editor lifecycle runtime assertion"},null,2));
