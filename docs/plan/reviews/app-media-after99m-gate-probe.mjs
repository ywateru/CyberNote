// Read-only gate/hash probes; no production mutation, browser, harness execution,
// original media scan, build, or formal measurement replay.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {acceptedCandidate,validateCandidate,validateProvider} from '../../../scripts/performance/media-candidate.mjs';
import {validateMediaMetrics,mediaMetricsDelta,counterFields,gaugeFields} from '../../../scripts/performance/media-metrics.mjs';
const root=resolve('.'), checks=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const candidate=validateCandidate(root);assert.equal(candidate.sourceFingerprint,acceptedCandidate.fingerprint);assert.equal(candidate.inputCount,434);
checks.push('actual current product is exact accepted4e143c3d/434 and accepted1507d66a is a real Git ancestor');
const build=JSON.parse(await readFile('artifacts/media99m-after-harness1/performance-build.json','utf8'));
await validateProvider(root,build);
assert.equal(sha(await readFile(build.transport.path)),build.transport.sha256);
for(const [path,hash]of Object.entries(build.sources))assert.equal(sha(await readFile(resolve(root,path))),hash,'harness source '+path);
checks.push('actual formal harness binary/all recorded production and tool source hashes/exact extracted provider match');
await assert.rejects(()=>validateProvider(root,{...build,providerNative:false}));
await assert.rejects(()=>validateProvider(root,{...build,tauriPackage:true}));
checks.push('wrong native-provider and wrong shell provenance reject');
// Inject only the sourceIdentity port in an in-memory copy of the gate. The
// production equality and actual git merge-base code remain unchanged. This
// tests ancestry independently from fingerprint without copying product files.
let code=await readFile('scripts/performance/media-candidate.mjs','utf8');
assert(code.includes("import {sourceIdentity} from '../build-info.mjs';"));
code=code.replace("import {sourceIdentity} from '../build-info.mjs';",'const sourceIdentity=()=>globalThis.__RAW_AUDIT_IDENTITY__;');
code=code.replace("from './extract-media-provider.mjs'",'from '+JSON.stringify(pathToFileURL(resolve('scripts/performance/extract-media-provider.mjs')).href));
const controlled=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const temporary=await mkdtemp(join(tmpdir(),'media-after99m-gate-'));
try{
 globalThis.__RAW_AUDIT_IDENTITY__={...candidate,sourceFingerprint:'0'.repeat(64)};
 assert.throws(()=>controlled.validateCandidate(root),/Unaccepted product fingerprint/);
 globalThis.__RAW_AUDIT_IDENTITY__={...candidate,inputCount:433};
 assert.throws(()=>controlled.validateCandidate(root),/Unaccepted product input inventory/);
 execFileSync('git',['init','-q'],{cwd:temporary});await writeFile(join(temporary,'a'),'unrelated history');execFileSync('git',['add','.'],{cwd:temporary});execFileSync('git',['-c','user.name=Raw Audit','-c','user.email=raw@example.invalid','commit','-qm','unrelated'],{cwd:temporary});
 globalThis.__RAW_AUDIT_IDENTITY__=candidate;
 assert.throws(()=>controlled.validateCandidate(temporary));
 controlled.validateCandidate(root);
 checks.push('controlled identity port:wrong fp/count reject;exact fp still rejected by actual unrelated Git ancestry');
 const out=join(temporary,'must-not-exist');
 const child=spawnSync(process.execPath,['scripts/performance/run-media.mjs','--mode','formal','--fixture',join(temporary,'no-fixture'),'--build',join(temporary,'no-build'),'--output',out,'--scroll-step-ms','101'],{cwd:root,encoding:'utf8'});
 assert.notEqual(child.status,0);assert.match(child.stderr,/Formal scroll cadence must match baseline100ms/);await assert.rejects(()=>access(out));
 checks.push('formal101ms cadence fails before fixture/build reads,output creation or process launch');
}finally{delete globalThis.__RAW_AUDIT_IDENTITY__;await rm(temporary,{recursive:true,force:true});}
const phases=JSON.parse(await readFile('artifacts/media99m-after-run1/phases.json','utf8'));
const valid=phases[0].runtimeStart;validateMediaMetrics(valid);
for(const field of [...counterFields,...gaugeFields]){
 for(const value of [undefined,null,-1,Number.NaN,Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1,'0']){
  assert.throws(()=>validateMediaMetrics({...valid,[field]:value}),'unknown precise metric '+field);
 }
}
for(const field of counterFields)assert.throws(()=>mediaMetricsDelta({...valid,[field]:1},valid),/regressed/);
assert.throws(()=>validateMediaMetrics({...valid,schema:1}));
checks.push('all17 required precise fields reject absent/null/negative/nonfinite/unsafe/string;all11 counters reject regression,unknown never0');
const runner=await readFile('artifacts/media99m-after-run1/measured-runner.mjs','utf8');
assert(!/\.src\s*=|setAttribute\(['"]src|\.load\s*\(/.test(runner));
assert(runner.indexOf('await button.click()')<runner.indexOf('result.metadataMs='));
assert(runner.indexOf('result.playing=')<runner.indexOf('await el.play()'));
const changes=execFileSync('git',['diff','--name-only','1507d66a152ac2ac9838d2bcd37791449135a370..1e3d3e398c2d1555987e93b6a8f462eb82613714'],{encoding:'utf8'}).trim().split('\n');
assert(changes.every(p=>p.startsWith('docs/')||p.startsWith('scripts/performance/')));
assert(changes.every(p=>!['run.mjs','browser-probes.mjs','trace-transport.mjs','generate-fixture.py','media-seeder.rs','build-frontend.mjs','prepare-store.mjs'].some(old=>p==='scripts/performance/'+old)));
checks.push('measured runner has no src/load assignment;UI click precedes metadata/auto progression;manual play only after rear seek;author delta only new measurement tooling/docs');
const result={ok:true,checks,candidate,acceptedCandidate,harnessBinarySHA256:build.transport.sha256,changedFiles:changes,scope:'Gate equality unit port injection is disclosed;actual accepted-root and unrelated Git ancestry exercised.No measurement/native replay.'};
await writeFile('docs/plan/reviews/app-media-after99m-gate-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ok:true,checks:checks.length}));
