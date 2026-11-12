#!/usr/bin/env node
// Native-free harness only; copies current production sources through the
// existing explicit builder. Uses the assigned shared Cargo cache, jobs=2.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,copyFile,chmod,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [output]=process.argv.slice(2);
if(!output||!process.env.CARGO_TARGET_DIR)throw Error('Usage: CARGO_TARGET_DIR=assigned node scripts/performance/build-harness.mjs FRESH_OUTPUT');
const out=resolve(output),floor=2.5*1024**3;
const disk=await statfs('.');if(disk.bavail*disk.bsize<floor)throw Error('Free disk is below 2.5GiB; stopped');
const refreshSeeder=process.argv.includes('--refresh-seeder');
if(!refreshSeeder)execFileSync('node',['scripts/debug/build-rust-attachments.mjs',out],{stdio:'inherit',env:{...process.env,CARGO_BUILD_JOBS:'2'}});
const build=JSON.parse(await readFile(resolve(out,'build.json'),'utf8'));
const transport=resolve(out,'current-transport');if(!refreshSeeder){await copyFile(build.binary.path,transport);await chmod(transport,0o755);}
await copyFile('scripts/performance/media-seeder.rs',resolve(build.harness,'media-seeder.rs'));
const cargo=resolve(build.harness,'Cargo.toml');if(!refreshSeeder)await writeFile(cargo,(await readFile(cargo,'utf8'))+'\n[[bin]]\nname = "media-fixture-seeder"\npath = "media-seeder.rs"\n');
execFileSync('cargo',['build','--locked','--offline','--manifest-path',cargo,'--bin','media-fixture-seeder'],{stdio:'inherit',env:{...process.env,CARGO_BUILD_JOBS:'2'}});
const seeder=resolve(out,'media-seeder');await copyFile(resolve(process.env.CARGO_TARGET_DIR,'debug/media-fixture-seeder'),seeder);await chmod(seeder,0o755);
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
await writeFile(resolve(out,'performance-build.json'),JSON.stringify({schema:1,sourceHead:build.sourceHead,sources:build.sources,transport:{path:transport,sha256:await sha(transport)},seeder:{path:seeder,sha256:await sha(seeder),sourceSha256:await sha('scripts/performance/media-seeder.rs')},native:false,cargoTarget:resolve(process.env.CARGO_TARGET_DIR),jobs:2},null,2)+'\n');
console.log(JSON.stringify({transport,seeder}));
