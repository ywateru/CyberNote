#!/usr/bin/env node
// Independent host adapter; verbatim production modules, no Tauri/App package.
import { cp, mkdir, readFile, writeFile, readdir, statfs, copyFile, chmod, symlink, realpath } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { extractMacProvider } from './extract-media-provider.mjs';
const out=resolve(process.argv[2]||'');
if(!process.argv[2]||!process.env.CARGO_TARGET_DIR)throw Error('Usage: CARGO_TARGET_DIR=shared node scripts/performance/build-media-harness.mjs FRESH_OUTPUT');
const disk=await statfs('.');if(disk.bavail*disk.bsize<2.5*1024**3)throw Error('STOP: disk below2.5GiB');
await mkdir(out);const harness=resolve(out,'harness');await mkdir(resolve(harness,'current'),{recursive:true});
const hashes={},sha=b=>createHash('sha256').update(b).digest('hex');
async function hashTree(source){const s=await import('node:fs/promises').then(fs=>fs.stat(source));if(s.isDirectory()){for(const ent of await readdir(source,{withFileTypes:true}))await hashTree(resolve(source,ent.name));}else hashes[relative(process.cwd(),source)]=sha(await readFile(source));}
async function capture(source,target){await cp(source,target,{recursive:true});await hashTree(source);}
for(const name of ['session.rs','session','store.rs','store','sync.rs','sync','attachment_media','apple_notes_import','apple_notes_source.js'])await capture(resolve('src-tauri/src',name),resolve(harness,'current',name));
await capture(resolve('scripts/performance/media-transport.rs'),resolve(harness,'transport.rs'));
await capture(resolve('scripts/performance/media-observer.rs'),resolve(harness,'media-observer.rs'));
await import('node:fs/promises').then(fs=>fs.appendFile(resolve(harness,'current/attachment_media/mod.rs'),'\n// Measurement-only actual map observer.\ninclude!("../../media-observer.rs");\n'));
//104 trusted font stays a single source asset. include_bytes in copied modules
// resolves harness/fonts; no font copy or altered production include path.
let fontReference;
if(await import('node:fs').then(fs=>fs.existsSync(resolve('src-tauri/fonts/NotoSansCJKsc-Regular.otf')))){
 const target=await realpath(resolve('src-tauri/fonts'));
 if(target!==resolve('src-tauri/fonts'))throw Error('Trusted font source must not redirect outside accepted source');
 await hashTree(target);
 if(hashes['src-tauri/fonts/NotoSansCJKsc-Regular.otf']!=='2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b')throw Error('Trusted104 font changed');
 await symlink(target,resolve(harness,'fonts'),'dir');
 fontReference={path:resolve(harness,'fonts'),target,copy:false,sha256:hashes['src-tauri/fonts/NotoSansCJKsc-Regular.otf']};
}
const generated={};
if(process.platform==='darwin'){
 await capture(resolve('scripts/performance/media-macos.rs'),resolve(harness,'media-macos.rs'));
 await capture(resolve('scripts/performance/media-native-build.rs'),resolve(harness,'build.rs'));
 await capture(resolve('plugins/tauri-plugin-notes-media/macos/thumbnail.m'),resolve(harness,'native/thumbnail.m'));
 const providerPath='plugins/tauri-plugin-notes-media/src/lib.rs';
 const providerSource=await readFile(providerPath,'utf8');hashes[providerPath]=sha(providerSource);
 const extracted=extractMacProvider(providerSource);
 await writeFile(resolve(harness,'native-provider.rs'),extracted);generated['native-provider.rs']=sha(extracted);
}
await hashTree(resolve('scripts/performance/extract-media-provider.mjs'));
const manifestPath='src-tauri/src/attachment_media/harness/Cargo.toml',lockPath='src-tauri/src/attachment_media/harness/Cargo.lock';
const original=await readFile(manifestPath,'utf8');
if(!original.includes('[lib]')||!original.includes('features = ["rt",'))throw Error('Media manifest boundary changed');
const manifest=original.replace('name = "notes-media-core-tests"','name = "notes-media-measurement"').replace('features = ["rt",','features = ["rt-multi-thread",').replace(/\[lib\][\s\S]*?(?=\[profile.dev\])/,'[[bin]]\nname = "notes-media-measurement"\npath = "transport.rs"\n');
await writeFile(resolve(harness,'Cargo.toml'),manifest);
// Lock package identity is kept consistent; dependency graph remains production.
const lock=(await readFile(lockPath,'utf8')).replace('name = "notes-media-core-tests"','name = "notes-media-measurement"');
await writeFile(resolve(harness,'Cargo.lock'),lock);
for(const file of [manifestPath,lockPath,'scripts/performance/build-media-harness.mjs'])hashes[file]=sha(await readFile(file));
const env={...process.env,CARGO_BUILD_JOBS:'2',CARGO_INCREMENTAL:'0',CARGO_PROFILE_DEV_DEBUG:'0'};
const command=['build','--locked','--offline','--manifest-path',resolve(harness,'Cargo.toml'),'--bin','notes-media-measurement'];
const log=await import('node:fs').then(fs=>fs.createWriteStream(resolve(out,'build.log')));
const child=spawn('cargo',command,{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});await new Promise(done=>log.end(done));
if(code!==0)throw Error('Native-free media harness failed: '+resolve(out,'build.log'));
for(const[path,hash]of Object.entries(hashes))if(sha(await readFile(path))!==hash)throw Error('Source changed during build: '+path);
const binary=resolve(out,'media-transport');await copyFile(resolve(process.env.CARGO_TARGET_DIR,'debug/notes-media-measurement'),binary);await chmod(binary,0o755);
const info={schema:3,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sources:hashes,transport:{path:binary,sha256:sha(await readFile(binary))},command:['cargo',...command],fontReference,native:process.platform==='darwin',tauriPackage:false,provider:process.platform==='darwin'?'production Mac Provider mechanically extracted + exact thumbnail.m; no Tauri shell':'production portable raster/restricted SVG',providerNative:process.platform==='darwin',generated,observer:'read-only actual leases map in copied core; no mutation or scheduling',harness,cargoTarget:resolve(env.CARGO_TARGET_DIR),jobs:2,incremental:false,debug:0};
await writeFile(resolve(out,'performance-build.json'),JSON.stringify(info,null,2)+'\n');console.log(JSON.stringify(info.transport));
