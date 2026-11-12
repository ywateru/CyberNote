#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {boundedLines,linearRustBackend} from './line-transport.mjs';
const checks=[];const check=(name,run)=>{run();checks.push(name);};
const lines=['{"value":"中文"}','{"data":"YWJjZA=="}','{"ok":true}'],input=Buffer.from(lines.join('\n')+'\n');
for(const chunk of [1,3,17,65536])check('Linear line parser preserves split UTF8/JSON and multiple responses, chunk '+chunk,()=>{const result=[],reader=boundedLines(line=>result.push(line),1024);for(let at=0;at<input.length;at+=chunk)reader(input.subarray(at,at+chunk));reader.finish();assert.deepEqual(result,lines);});
check('Line size is bounded before assembly',()=>assert.throws(()=>boundedLines(()=>{},3)(Buffer.from('1234')),/oversized/));
check('Incomplete EOF is rejected',()=>{const reader=boundedLines(()=>{},10);reader(Buffer.from('test'));assert.throws(()=>reader.finish(),/incomplete/);});
if(process.argv.includes('--unit-only')){console.log(JSON.stringify({ok:true,checks,scope:'Small parser unit boundaries only'}));process.exit(0);}
const [fixtureArg,buildArg]=process.argv.slice(2);if(!fixtureArg||!buildArg)throw Error('Usage: node scripts/performance/check-tools.mjs FIXTURE HARNESS [or --unit-only]');
const fixture=resolve(fixtureArg),build=JSON.parse(await readFile(resolve(buildArg,'performance-build.json'),'utf8')),disk=await statfs(fixture);if(disk.bavail*disk.bsize<2.5*1024**3)throw Error('STOP: less than 2.5GiB free');
const map=JSON.parse(await readFile(resolve(fixture,'store-map.json'),'utf8'));const sample=map.attachments.find(x=>x.mime==='image/svg+xml');
const backend=await linearRustBackend(build.transport.path,resolve(fixture,'store'));
try{
 const row=await backend.call('load_workspace');assert.ok(row.ok);const ws=row.value;assert.equal(ws.attachments.length,503);assert.equal(ws.notes.length,103);checks.push('Real current Rust Store contains all 103 notes and 503 registered original files');
 const read=await backend.call('read_attachment',{id:sample.id,expected:{sessionId:ws.access.sessionId,epoch:ws.access.epoch,noteEpoch:ws.access.notes[sample.noteId].epoch}});assert.ok(read.ok);const bytes=Buffer.from(read.value.data,'base64');assert.equal(bytes.length,sample.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256);checks.push('Linear client receives exact current real Store bytes and SHA256 through unmodified Rust protocol');
}finally{await backend.close();}
await writeFile(resolve(buildArg,'measurement-client-check.json'),JSON.stringify({ok:true,checks,scope:'Parser unit boundaries and a real immutable SVG read from isolated Store; no native App/device claim'},null,2)+'\n');console.log(JSON.stringify({ok:true,checks},null,2));
