import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { sourceIdentity, releaseStamp, validateStamp, createBuildInfo, assertVersions } from './build-info.mjs';
import { verifyFrontend, verifyEmbedded, publishLatest, artifactDigest } from './release.mjs';
import { openRuntime, saveJSON } from './debug/runtime.mjs';
const output = resolve('artifacts/build-delivery97'); await mkdir(output, { recursive: true });
const checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
const fixture = await mkdtemp(join(tmpdir(), 'cybernote-build-identity-'));
try {
  await mkdir(join(fixture,'src'), {recursive:true}); await mkdir(join(fixture,'src-tauri'), {recursive:true});
  await writeFile(join(fixture,'package.json'), JSON.stringify({version:'0.1.0'}));
  await writeFile(join(fixture,'src-tauri/tauri.conf.json'), JSON.stringify({version:'0.1.0'}));
  await writeFile(join(fixture,'src-tauri/Cargo.toml'), '[package]\nversion = "0.1.0"\n');
  await writeFile(join(fixture,'src/a.ts'), 'export const value=1;');
  execFileSync('git',['init','-q'],{cwd:fixture}); execFileSync('git',['add','.'],{cwd:fixture});
  execFileSync('git',['-c','user.name=Identity Test','-c','user.email=identity@example.invalid','commit','-qm','fixture'],{cwd:fixture});
  const initial = sourceIdentity(fixture), stamp = releaseStamp(fixture);
  await mkdir(join(fixture,'src-tauri/target/debug'), {recursive:true}); await writeFile(join(fixture,'src-tauri/target/debug/generated.rs'),'output');
  await mkdir(join(fixture,'src-tauri/gen/android/app'), {recursive:true});
  await writeFile(join(fixture,'src-tauri/gen/android/tauri.settings.gradle'),'generated dependency paths');
  await writeFile(join(fixture,'src-tauri/gen/android/app/tauri.build.gradle.kts'),'generated plugin dependencies');
  await mkdir(join(fixture,'artifacts'), {recursive:true}); await writeFile(join(fixture,'artifacts/stamp.json'),JSON.stringify(stamp));
  check('generated output and release stamp do not change product fingerprint', sourceIdentity(fixture).sourceFingerprint === initial.sourceFingerprint);
  validateStamp(stamp, fixture);
  const preparedBuild = createBuildInfo({root:fixture,stampPath:'artifacts/stamp.json',now:new Date('2026-11-09T01:02:03.000Z')});
  check('shared release stamp preserves source while recording actual per-build time', preparedBuild.releasePreparedAt === stamp.preparedAt && preparedBuild.builtAt === '2026-11-09T01:02:03.000Z' && preparedBuild.sourceFingerprint === stamp.sourceFingerprint);
  await writeFile(join(fixture,'src/a.ts'), 'export const value=2;');
  check('uncommitted product source changes fingerprint without changing Git revision', sourceIdentity(fixture).sourceFingerprint !== initial.sourceFingerprint && sourceIdentity(fixture).sourceRevision === initial.sourceRevision);
  assert.throws(()=>validateStamp(stamp,fixture), /stale/); checks.push('stale release identity is rejected');
  assert.throws(()=>createBuildInfo({root:fixture,stampPath:'artifacts/stamp.json'}), /stale/); checks.push('build refuses to reuse a stale release stamp');
  const dev = createBuildInfo({root:fixture,development:true});
  check('development preview never claims an installer build time', dev.mode === 'development' && dev.builtAt === null);
  await writeFile(join(fixture,'src-tauri/tauri.conf.json'), JSON.stringify({version:'0.2.0'}));
  assert.throws(()=>assertVersions(fixture), /differs/); checks.push('frontend/native version drift fails explicitly');
  await writeFile(join(fixture,'src-tauri/tauri.conf.json'), JSON.stringify({version:'0.1.0'}));
  const current = releaseStamp(fixture), info=createBuildInfo({root:fixture,now:new Date('2026-11-09T01:02:03.000Z')});
  await mkdir(join(fixture,'dist/assets'),{recursive:true}); await writeFile(join(fixture,'dist/build-info.json'),JSON.stringify(info));
  await writeFile(join(fixture,'dist/assets/runtime.js'),'window.fixture='+JSON.stringify(info));
  assert.equal(verifyFrontend(join(fixture,'dist'),undefined,fixture).sourceFingerprint,current.sourceFingerprint); checks.push('frontend verifier checks runtime metadata against actual source');
  const embedded=join(fixture,'embedded'); await mkdir(embedded);
  const metadataBytes=brotliCompressSync(Buffer.from(JSON.stringify(info))), runtimeBytes=brotliCompressSync(Buffer.from('const build='+JSON.stringify(info)));
  await writeFile(join(embedded,'metadata.json'),metadataBytes); await writeFile(join(embedded,'runtime.js'),runtimeBytes);
  const native=join(fixture,'native'); await writeFile(native,Buffer.concat([Buffer.from('synthetic-native-boundary'),metadataBytes,runtimeBytes]));
  check('package identity verifier requires compressed metadata and runtime bytes in native binary', Object.keys(verifyEmbedded(native,embedded,info)).length===2);
  await writeFile(native,metadataBytes); assert.throws(()=>verifyEmbedded(native,embedded,info), /metadata AND/); checks.push('metadata sidecar alone cannot satisfy native verification');
  const readme=join(fixture,'README.md'); await writeFile(readme,'# Test\n<!-- latest-installers:start -->old<!-- latest-installers:end -->\n');
  const manifests=[];
  for(const platform of ['macos','android']) { const artifact=`artifacts/${platform}.bin`;await writeFile(join(fixture,artifact),platform); manifests.push({schema:1,platform,artifact,artifactSha256:artifactDigest(join(fixture,artifact)),...current,mode:'production',builtAt:info.builtAt,releasePreparedAt:current.preparedAt,embedded:{metadata:{},runtime:{}}}); }
  publishLatest(manifests,fixture);check('latest installer publication requires and renders both platform entries', (await readFile(readme,'utf8')).includes('macos.bin') && (await readFile(readme,'utf8')).includes('android.bin'));
  await writeFile(join(fixture,manifests[0].artifact),'changed'); assert.throws(()=>publishLatest(manifests,fixture),/artifact changed/); checks.push('publication rejects artifacts changed after verification');
} finally { await rm(fixture,{recursive:true,force:true}); }
const stampPath=resolve(output,'source-stamp.json');
execFileSync('node',['scripts/release.mjs','prepare','--out',stampPath],{stdio:'pipe'});
execFileSync('pnpm',['build'],{stdio:'inherit',env:{...process.env,CYBERNOTE_RELEASE_STAMP:stampPath}});
const info=verifyFrontend(resolve('dist'),JSON.parse(await readFile(stampPath,'utf8')));checks.push('real production frontend contains current prepared release identity');
for (const mobile of [false,true]) {
  const runtime=await openRuntime({production:'dist',mobile});
  try {
    const {page}=runtime;
    await page.getByRole('button',{name:'设置',exact:true}).click();
    if(mobile) await page.getByRole('button',{name:/外观与字号/}).click();
    const panel=page.getByRole('region',{name:'版本信息',exact:true}); await panel.scrollIntoViewIfNeeded();
    check(`${mobile?'Android layout':'Mac layout'} shows actual version, timestamp and complete source identity`, (await panel.innerText()).includes(info.version) && (await panel.innerText()).includes(info.builtAt.replace('T',' ').replace('Z',' UTC')) && (await panel.innerText()).includes(info.sourceFingerprint));
    for (const theme of ['light','dark']) {
      if(mobile) await page.getByRole('combobox',{name:'外观',exact:true}).selectOption(theme);
      else await page.getByRole('radio',{name:theme==='dark'?'深色':'浅色',exact:true}).click();
      await panel.scrollIntoViewIfNeeded();
      check(`${mobile?'390px mobile':'desktop'} ${theme} build identity fits without horizontal overflow`,await panel.evaluate(el=>el.scrollWidth<=el.clientWidth && el.getBoundingClientRect().left>=0 && el.getBoundingClientRect().right<=innerWidth));
      await page.screenshot({path:resolve(output,`${mobile?'mobile':'desktop'}-${theme}.png`)});
    }
    check(`${mobile?'mobile':'desktop'} production settings have no page errors`,runtime.errors.length===0);
  } finally { await runtime.cleanup(); }
}
await saveJSON(resolve(output,'result.json'),{ok:true,checks,info,nativeScope:'Compressed asset detection is tested with synthetic bytes; final real package verification is required in FINAL101.'});
console.log(JSON.stringify({ok:true,checks},null,2));
