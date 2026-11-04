"""Local-only final independent evidence assertions and manifest."""
from pathlib import Path
import hashlib, json, shutil, subprocess
ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/app-001-mobile-paper-order-independent-02'
AUTHOR = ROOT / 'docs/verification/app-001-mobile-paper-order-02'
SOURCE = '8463ed896847f891fd4fd5579affb253a11d681b'
REPORT = ROOT / 'docs/plan/reviews/app-001-mobile-paper-order-02.md'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3
def ident(path):
    b = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
audit = json.loads((OUT / 'source-audit.json').read_text())
r = json.loads((OUT / 'render-run01/result.json').read_text())
command = json.loads((OUT / 'render-command.json').read_text())
assert command['exitCode'] == 0 and command['stderr'] == ''
assert r['sourceRef'] == SOURCE and r['sourceSHA256'] == audit['appSHA256'] and r['cssSHA256'] == audit['cssSHA256']
assert r['independentCandidateOrderAssertionsEnabled'] and r['referenceOrderMatches'] and r['pass']
assert len(r['steps']) == 12 and r['errors'] == [] and r['externalRequests'] == []
choices = [s for s in r['steps'] if s['name'] == 'choose-reopen-cancel']
expected = ['plain', 'lines-small', 'lines-medium', 'lines-large', 'grid-small', 'grid-medium', 'grid-large']
assert [s['style'] for s in choices] == expected
for s in choices:
    assert s['selected'] == [s['style']] and s['after']['stored'] == s['style']
    assert s['before']['document'] == s['after']['document']
    assert s['after']['editable'] is True and s['after']['focused'] is False
assert choices[0]['selectionPreserved'] is False
assert choices[0]['before']['selection'] == {'type': 'text', 'anchor': 3, 'head': 8}
assert choices[0]['after']['selection'] == {'type': 'text', 'anchor': 1, 'head': 1}
assert all(s['selectionPreserved'] for s in choices[1:])
current_inputs = []
for row in audit['currentProductionInputs']:
    p = ROOT / row['path']; b = p.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
    assert blob == row['gitBlob'] or row['path'] == 'src/style.css', row
    current_inputs.append({'path': row['path'], 'matchesCandidate': blob == row['gitBlob']})
for item in audit['authorEvidence']:
    p = ROOT / item['path']
    assert ident(p) == item
    committed = subprocess.check_output(['git', 'show', SOURCE + ':' + item['path']], cwd=ROOT)
    assert p.read_bytes() == committed
result = {'source': SOURCE, 'decision': 'SOURCE-READY for mobile order only', 'realRenderSteps': 12,
    'choiceCount': 7, 'plainSelectionRiskReproduced': True, 'allSelectionPass': False,
    'currentInputsAtEnd': current_inputs, 'authorEvidence16FilesExactCommitAndHashes': True,
    'sourceAudit': ident(OUT / 'source-audit.json'), 'renderResult': ident(OUT / 'render-run01/result.json'),
    'report': ident(REPORT), 'freeBytes': shutil.disk_usage(ROOT).free,
    'limits': ['No GUI/ADB/native execution', 'No platform build', 'No Rust store/native persistence verification',
        'No pixel acceptance', 'Backdrop uses DOM event', 'Selection risk remains unresolved']}
with (OUT / 'result-audit.json').open('x') as f:
    f.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
files = [ident(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name != 'manifest.json']
files.append(ident(REPORT)); files.sort(key=lambda row: row['path'])
aggregate = hashlib.sha256(''.join(row['sha256'] + '  ' + row['path'] + '\n' for row in files).encode()).hexdigest()
with (OUT / 'manifest.json').open('x') as f:
    f.write(json.dumps({'schema': 1, 'files': files, 'aggregate': aggregate, 'excludes': ['manifest.json']}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'filesIncludingManifestAndReport': len(files) + 1, 'bytesExcludingManifest': sum(x['bytes'] for x in files), 'aggregate': aggregate, 'manifest': ident(OUT / 'manifest.json')}, ensure_ascii=False))
