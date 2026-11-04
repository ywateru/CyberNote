"""Independent exact-commit source/evidence audit and real-Tiptap fixture pinning."""
from pathlib import Path
import hashlib, json, shutil, subprocess
ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/app-001-body-vertical-independent-03'
AUTHOR = ROOT / 'docs/verification/app-001-body-vertical-03'
SOURCE = 'b2f3570783361a5754e3a213730a72d201ddde7a'
BASE = '8463ed896847f891fd4fd5579affb253a11d681b'
PARENT = '4d86a7d3dc5bb421331527ab88fdf2e056cb0850'
EXPECTED_CSS = 'de2222e4b3c8e4ccde3af4312e8d0db5480dabea1a3c54fe4a0bf9c2a3feb962'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)
def ident(path):
    b = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
assert git('rev-parse', SOURCE).decode().strip() == SOURCE
assert git('rev-parse', SOURCE + '^').decode().strip() == PARENT
paths = git('diff', '--name-only', BASE, SOURCE, '--', 'src', 'src-tauri', 'assets', 'package.json', 'pnpm-lock.yaml').decode().splitlines()
assert paths == ['src/style.css'], paths
old = git('show', BASE + ':src/style.css')
candidate = git('show', SOURCE + ':src/style.css')
addition = b'''/* Vertical candidate only while every direct editor element is a paragraph. */
.desktop.native-toolbar:not(.separate) .note-document .tiptap:has(> p):not(:has(> :not(p))) {
  padding-top: 2px;
}
.desktop.native-toolbar:not(.separate) .note-document .tiptap:has(> p):not(:has(> :not(p))) > p {
  line-height: 17px;
  min-height: 17px;
}
'''
assert candidate.count(addition) == 1 and candidate.replace(addition, b'') == old
assert hashlib.sha256(candidate).hexdigest() == EXPECTED_CSS
assert git('show', PARENT + ':src/style.css') == old
manifest = json.loads((AUTHOR / 'manifest.json').read_text())
author_inputs = []
for item in manifest['files']:
    p = ROOT / item['path']
    assert ident(p) == item
    assert p.read_bytes() == git('show', SOURCE + ':' + item['path'])
    author_inputs.append(ident(p))
assert (AUTHOR / 'manifest.json').read_bytes() == git('show', SOURCE + ':' + str((AUTHOR / 'manifest.json').relative_to(ROOT)))
author_inputs.append(ident(AUTHOR / 'manifest.json'))
production = []
for raw in git('ls-tree', '-r', SOURCE, '--', 'src', 'assets', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts').decode().splitlines():
    meta, path = raw.split('\t'); mode, kind, oid = meta.split()
    assert kind == 'blob'
    b = (ROOT / path).read_bytes(); actual = hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
    assert actual == oid or path == 'src/style.css', path
    production.append({'path': path, 'candidateGitBlob': oid, 'currentGitBlob': actual})
original = git('show', SOURCE + ':docs/verification/app-001-body-vertical-03/check-render.mjs').decode()
fixture = original.replace('{readFile,writeFile,mkdir,mkdtemp}', '{readFile,writeFile,mkdir,mkdtemp,rm}')
needle = "const candidateCss=await readFile('src/style.css','utf8');"
assert fixture.count(needle) == 1
fixture = fixture.replace(needle, "const candidateSource='" + SOURCE + "';const candidateCss=execFileSync('git',['show',candidateSource+':src/style.css'],{encoding:'utf8'});")
needle = "if(id==='/__vertical.ts')return entry;"
assert fixture.count(needle) == 1
fixture = fixture.replace(needle, needle + "if(id===resolve('src/editor-schema.ts'))return execFileSync('git',['show',candidateSource+':src/editor-schema.ts'],{encoding:'utf8'});if(id===resolve('src/note-tag-extension.ts'))return execFileSync('git',['show',candidateSource+':src/note-tag-extension.ts'],{encoding:'utf8'});")
fixture = fixture.replace('const result={baselineHead,', 'const result={candidateSource,baselineHead,')
fixture = fixture.replace("await new Promise(done=>server.close(done));await writeFile", "await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});await writeFile")
with (OUT / 'check-pinned-render.mjs').open('x') as f:
    f.write(fixture)
result = {'source': SOURCE, 'parent': PARENT, 'productBaseline': BASE,
    'changedProductPaths': paths, 'onlyExactEightCssLinesAdded': True,
    'baselineCssSHA256': hashlib.sha256(old).hexdigest(), 'candidateCssSHA256': EXPECTED_CSS,
    'addition': addition.decode(), 'authorEvidence': author_inputs, 'productionInputs': production,
    'sourceCorpora': [ident(ROOT / path) for path in [
        'docs/verification/mac-body-typography-runtime-01/corpus.json',
        'docs/verification/mac-punctuation-context-runtime-02/corpus.json']],
    'fixtureOriginalSHA256': hashlib.sha256(original.encode()).hexdigest(),
    'fixturePinned': ident(OUT / 'check-pinned-render.mjs'),
    'fixtureAdaptation': ['Pin full candidate CSS, production schema and NoteTag to exact commit',
        'Record candidateSource SHA', 'Remove only newly owned temporary Vite cache after completion'],
    'freeBytes': shutil.disk_usage(ROOT).free}
with (OUT / 'source-audit.json').open('x') as f:
    f.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'source': SOURCE, 'authorEvidenceFiles': len(author_inputs), 'productionInputs': len(production), 'candidateCssSHA256': EXPECTED_CSS, 'fixture': result['fixturePinned']}, ensure_ascii=False))
