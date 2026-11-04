"""Read-only source/evidence audit and exact-commit real-App fixture preparation."""
from pathlib import Path
import hashlib, json, re, shutil, subprocess

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/app-001-mobile-paper-order-independent-02'
AUTHOR = ROOT / 'docs/verification/app-001-mobile-paper-order-02'
SOURCE = '8463ed896847f891fd4fd5579affb253a11d681b'
BASE = 'a6b629479deddff18a84214b4420d8c1272b0aae'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def ident(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

assert git('rev-parse', '8463ed8').decode().strip() == SOURCE
assert git('rev-parse', SOURCE + '^').decode().strip() == BASE
changed = git('diff', '--name-only', BASE, SOURCE, '--', 'src', 'assets', 'package.json', 'pnpm-lock.yaml').decode().splitlines()
assert changed == ['src/App.tsx'], changed
old = git('show', BASE + ':src/App.tsx')
new = git('show', SOURCE + ':src/App.tsx')
pattern = rb'const mobilePaperOptions = \[.*?\] as const satisfies readonly PaperOption\[\];'
old_block, new_block = re.search(pattern, old, re.S).group(), re.search(pattern, new, re.S).group()
assert old.replace(old_block, b'') == new.replace(new_block, b'')
assert len(old) == len(new)
assert git('show', BASE + ':src/style.css') == git('show', SOURCE + ':src/style.css')
rows = []
for raw in git('ls-tree', '-r', SOURCE, '--', 'src', 'assets', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts').decode().splitlines():
    meta, path = raw.split('\t'); mode, kind, oid = meta.split()
    assert kind == 'blob'
    data = (ROOT / path).read_bytes()
    current = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    rows.append({'path': path, 'gitBlob': oid, 'currentGitBlob': current, 'currentMatches': oid == current})
assert all(row['currentMatches'] or row['path'] == 'src/style.css' for row in rows), [r for r in rows if not r['currentMatches']]
manifest = json.loads((AUTHOR / 'manifest.json').read_text())
for row in manifest['files']:
    data = (AUTHOR / row['path']).read_bytes()
    assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row
assert manifest['product'][0]['sha256'] == hashlib.sha256(new).hexdigest()
fixture = git('show', SOURCE + ':docs/verification/app-001-mobile-paper-order-02/check-real-app.mjs').decode()
original = fixture
fixture = fixture.replace('{mkdir,readFile,writeFile,mkdtemp}', '{mkdir,readFile,writeFile,mkdtemp,rm}')
fixture = fixture.replace("const sourceRef=process.env.PAPER_SOURCE_REF||null;", "const sourceRef='" + SOURCE + "';\nconst pinnedCss=execFileSync('git',['show',sourceRef+':src/style.css']);")
needle = "if(id===resolve('src/App.tsx'))return appSource.toString();"
assert fixture.count(needle) == 1
fixture = fixture.replace(needle, needle + "if(id===resolve('src/style.css'))return pinnedCss.toString();")
assert fixture.count('if(!sourceRef)') == 2
fixture = fixture.replace('if(!sourceRef)', 'if(true)')
fixture = fixture.replace("sourceSHA256:createHash('sha256').update(appSource).digest('hex'),", "sourceSHA256:createHash('sha256').update(appSource).digest('hex'),cssSHA256:createHash('sha256').update(pinnedCss).digest('hex'),independentCandidateOrderAssertionsEnabled:true,")
fixture = fixture.replace("await new Promise(done=>server.close(done));await writeFile", "await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});await writeFile")
with (OUT / 'check-pinned-real-app.mjs').open('x') as f:
    f.write(fixture)
result = {'source': SOURCE, 'base': BASE, 'changedProductPaths': changed,
    'allOtherAppBytesEqual': True, 'cssEqualAcrossExactCommits': True,
    'oldMobileBlock': old_block.decode(), 'newMobileBlock': new_block.decode(),
    'appSHA256': hashlib.sha256(new).hexdigest(),
    'cssSHA256': hashlib.sha256(git('show', SOURCE + ':src/style.css')).hexdigest(),
    'currentProductionInputs': rows,
    'sourceAuditAt': 'before independent browser run',
    'authorManifestAll15FilesMatch': len(manifest['files']) == 15,
    'authorEvidence': [ident(AUTHOR / r['path']) for r in manifest['files']] + [ident(AUTHOR / 'manifest.json')],
    'referenceFrame': ident(ROOT / 'references/mobile/frames-2s/frame-044.png'),
    'fixtureOriginalSHA256': hashlib.sha256(original.encode()).hexdigest(),
    'fixtureAdaptation': ['Pin App.tsx and complete style.css to exact candidate git blobs',
        'Enable reference-order/actual-CSS-row assertions despite explicit sourceRef',
        'Record exact CSS SHA and remove only newly owned temporary Vite cache on completion'],
    'freeBytes': shutil.disk_usage(ROOT).free}
with (OUT / 'source-audit.json').open('x') as f:
    f.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'source': SOURCE, 'inputs': len(rows), 'authorManifestFiles': len(manifest['files']), 'appSHA256': result['appSHA256'], 'fixture': ident(OUT / 'check-pinned-real-app.mjs')}, ensure_ascii=False))
