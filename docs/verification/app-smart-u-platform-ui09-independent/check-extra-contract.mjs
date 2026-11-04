import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const modules = new Map();
async function compiled(name) {
  if (modules.has(name)) return modules.get(name);
  let source = ts.transpileModule(await readFile(`src/${name}.ts`, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const match of [...source.matchAll(/from ["']\.\/([^"']+)["']/g)])
    source = source.replace(match[0], `from '${await compiled(match[1])}'`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  modules.set(name, url);
  return url;
}

import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const {parseSmartQuery,matchesSmart}=await import(await compiled('smart-folders'));
const out=resolve(process.argv[2]);await mkdir(out,{recursive:false});
const store=resolve(out,'store');await mkdir(store);
const child=spawn(resolve('src-tauri/target/debug/notes-u-session-transport'),[store],{stdio:['pipe','pipe','pipe']});
let id=0;const waiting=new Map();const transcript=[];
createInterface({input:child.stdout}).on('line',line=>{const row=JSON.parse(line);transcript.push(row);waiting.get(row.requestId)(row);waiting.delete(row.requestId);});
const call=(command,args={})=>new Promise(resolve=>{const row={requestId:++id,command,args,window:'independent'};transcript.push(row);waiting.set(row.requestId,resolve);child.stdin.write(JSON.stringify(row)+'\n');});
const results=[];
try {
 const ws=await call('load_workspace');assert.equal(ws.ok,true);
 for(const combine of [['all'],['any']]) {
  const query={version:1,combine,rules:[{type:'tags',mode:'anyTag'},{type:'pinned',value:true}]};
  let parsed,error;try{parsed=parseSmartQuery(query)}catch(e){error={code:e.code,message:e.message}}
  const rust=await call('workspace_action',{action:{type:'createSmartFolder',input:{name:'must reject array',query}},expected:{sessionId:ws.value.access.sessionId,epoch:ws.value.access.epoch}});
  const row={input:query,tsAccepted:!!parsed,tsError:error,rustAccepted:rust.ok,rustError:rust.error};
  if(parsed)row.mixedFactsResult=matchesSmart(parsed,{eligible:true,pinned:true,tags:[]});
  results.push(row);
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify({results,transcript},null,2)+'\n');
 for(const r of results){assert.equal(r.rustAccepted,false);assert.equal(r.tsAccepted,false,'strict TS query parser must reject a JSON array in combine, matching Rust');}
} finally {child.stdin.end();}
