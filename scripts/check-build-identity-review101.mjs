// Independent review of output-boundary identity. Never mutates product inputs.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as after from './build-info.mjs';
const base='e6421f3786d7e78896f41efab13f54a92d8c35ec',author='24a9d4fef7f4e5ca99c9ab84d8a2afaeb46c92a4';
const output=resolve(process.argv[2]||'artifacts/build-identity101-independent/result.json');
const scratch=await mkdtemp(join(tmpdir(),'identity101-independent-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const oldBytes=execFileSync('git',['show',base+':scripts/build-info.mjs']);
const newBytes=await readFile('scripts/build-info.mjs');
const root=join(scratch,'fixture');
const write=async(path,bytes)=>{const file=join(root,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);};
const observations=[];
try {
 await writeFile(join(scratch,'before.mjs'),oldBytes);
 const before=await import(pathToFileURL(join(scratch,'before.mjs')));
 await write('package.json',JSON.stringify({version:'0.1.0'}));
 await write('src-tauri/tauri.conf.json',JSON.stringify({version:'0.1.0'}));
 await write('src-tauri/Cargo.toml','[package]\nversion = "0.1.0"\n');
 // Keep fixture script bytes identical for both module executions, isolating
 // traversal behavior from the real build-info source edit itself.
 await write('scripts/build-info.mjs',newBytes);
 await write('src/kept.ts','export const handwritten = 1;\n');
 await write('.gitignore','/plugins/*/android/.tauri/\n/src-tauri/gen/android/.tauri/\n/src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/\n/src-tauri/gen/android/app/proguard-tauri.pro\n');
 execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','.'],{cwd:root});
 execFileSync('git',['-c','user.name=Independent Identity Review','-c','user.email=review@example.invalid','commit','-qm','fixed bytes'],{cwd:root});
 const stampBefore=before.releaseStamp(root),stampAfter=after.releaseStamp(root);
 assert.equal(stampBefore.sourceFingerprint,stampAfter.sourceFingerprint);
 const stable=()=>{assert.equal(after.sourceIdentity(root).sourceFingerprint,stampAfter.sourceFingerprint);after.validateStamp(stampAfter,root);};
 const generated=[
  'plugins/never-built-plugin/android/.tauri/arbitrary/deep/SDK.kt',
  'src-tauri/gen/android/.tauri/arbitrary/deep/config.json',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/arbitrary/deep/Class.kt',
  'src-tauri/gen/android/app/proguard-tauri.pro',
 ];
 for(const path of generated){
  await write(path,'first generated output\n');
  assert.equal(execFileSync('git',['check-ignore',path],{cwd:root,encoding:'utf8'}).trim(),path);
  assert(before.productFiles(root).includes(path));assert.throws(()=>before.validateStamp(stampBefore,root),/stale/);
  assert(!after.productFiles(root).includes(path));stable();
  await write(path,'regenerated output of another SDK release\n');stable();
  await rm(join(root,path));stable();before.validateStamp(stampBefore,root);
  observations.push({kind:'causal-before-and-after',path,before:{listed:true,stampRejected:true},after:{createStable:true,rewriteStable:true,deleteStable:true}});
 }
 const authored=[
  'plugins/tauri-plugin-notes-media/android/src/main/java/com/local/notesmedia/NotesMediaPlugin.kt',
  'plugins/tauri-plugin-notes-scan/android/src/main/java/com/local/notesscan/NotesScanPlugin.kt',
  'plugins/tauri-plugin-notes-media/android/src/main/AndroidManifest.xml',
  'plugins/tauri-plugin-notes-media/android/build.gradle.kts',
  'plugins/tauri-plugin-notes-media/macos/thumbnail.m',
  'plugins/tauri-plugin-notes-ui/macos/native.c',
  'plugins/tauri-plugin-notes-media/src/lib.rs',
  'src-tauri/src/lib.rs',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt',
  'src-tauri/gen/android/app/src/main/AndroidManifest.xml',
  'src-tauri/gen/android/app/build.gradle.kts',
  'plugins/child/nested/android/.tauri/Handwritten.kt',
  'plugins/child/android/src/.tauri/Handwritten.kt',
  'plugins/child/android-backup/.tauri/Handwritten.kt',
  'plugins/child/android/.tauri-backup/Handwritten.kt',
  'plugins/child/android/.tauri.kt',
  'src-tauri/gen/android/.tauri-backup/config.json',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated.kt',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated-backup/Handwritten.kt',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone2/generated/Handwritten.kt',
  'src-tauri/gen/android/app/src/main/java/com/other/generated/Handwritten.kt',
  'src-tauri/gen/android/proguard-tauri.pro',
  'src-tauri/gen/android/app/proguard-tauri.pro.backup',
 ];
 for(const path of authored){
  await write(path,'handwritten first version\n');assert(after.productFiles(root).includes(path),path);
  assert.throws(()=>after.validateStamp(stampAfter,root),/stale/);
  const added=after.releaseStamp(root);await write(path,'handwritten second version\n');
  assert.throws(()=>after.validateStamp(added,root),/stale/);
  await rm(join(root,path));stable();
  observations.push({kind:'authored-or-near-name',path,listed:true,addedRejectsStamp:true,modifiedRejectsStamp:true,deleteRestores:true});
 }
 await write('scripts/build-info.mjs',Buffer.concat([newBytes,Buffer.from('\n// a different product build algorithm\n')]));
 assert.throws(()=>after.validateStamp(stampAfter,root),/stale/);await write('scripts/build-info.mjs',newBytes);stable();
 observations.push({kind:'script-self-input',path:'scripts/build-info.mjs',modifiedRejectsStamp:true});
 const oldFiles=before.productFiles(process.cwd()),newFiles=after.productFiles(process.cwd());
 const removed=oldFiles.filter(p=>!newFiles.includes(p)),added=newFiles.filter(p=>!oldFiles.includes(p));
 const reserved=p=>/^plugins\/[^/]+\/android\/\.tauri\//.test(p)||p.startsWith('src-tauri/gen/android/.tauri/')||p.startsWith('src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/')||p==='src-tauri/gen/android/app/proguard-tauri.pro';
 assert.equal(oldFiles.length,474);assert.equal(newFiles.length,433);assert.equal(removed.length,41);assert.deepEqual(added,[]);assert(removed.every(reserved));
 for(const path of [
  'plugins/tauri-plugin-notes-media/android/src/main/java/com/local/notesmedia/NotesMediaPlugin.kt',
  'plugins/tauri-plugin-notes-media/macos/thumbnail.m',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt',
  'src-tauri/gen/android/app/src/main/AndroidManifest.xml','src-tauri/gen/android/app/build.gradle.kts',
 ])assert(newFiles.includes(path),'Real authored input excluded: '+path);
 observations.push({kind:'actual-tree',beforeInputs:oldFiles.length,afterInputs:newFiles.length,removed,added,source:after.sourceIdentity()});
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify({ok:true,base,author,reviewScript:'scripts/check-build-identity-review101.mjs',beforeScriptSHA256:hash(oldBytes),afterScriptSHA256:hash(newBytes),checks:observations,scope:'Independent temporary git fixtures and actual-tree read-only inventory. No native generation, Cargo, packages, ADB, user data, or delivery-tree work.'},null,2)+'\n');
 console.log('Independent identity101: '+observations.length+' checks passed; '+output);
}finally{await rm(scratch,{recursive:true,force:true});}
