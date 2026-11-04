"""Local-only sealing of this capture; no device or image transformation."""
from pathlib import Path
import hashlib, json, shutil

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/android-paper-current06-02'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3

def ident(path):
    b = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}

identity = json.loads((OUT / '00-identity-attempt02.json').read_text())
stages = [json.loads((OUT / (name + '.json')).read_text()) for name in [
    '01-initial', '02-search-return', '03-fixed-paper-query', '04-paper-note-before',
    '05-note-more', '06-paper-picker-native', '07-cancel-return']]
result = {
    'schema': 'notesclone.android.paper-current06.capture.v1',
    'serial': identity['serial'], 'package': identity['package'],
    'installedApk': identity['installedApk'],
    'sourceHeadViaExistingProvenance': identity['sourceHead'],
    'identityEvidence': ident(OUT / '00-identity-attempt02.json'),
    'primary': ident(OUT / '06-paper-picker-native.png'),
    'before': ident(OUT / '04-paper-note-before.png'),
    'returned': ident(OUT / '07-cancel-return.png'),
    'referenceFrame': ident(ROOT / 'references/mobile/frames-2s/frame-044.png'),
    'savedOriginalVideo': ident(ROOT / 'references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4'),
    'nativePngDimensions': [1080, 2280], 'referenceFrameDimensions': [224, 480],
    'actionsAllPassed': all(stage['status'] == 'PASS' for stage in stages),
    'pidsRecorded': [stage['pidof'] for stage in stages],
    'fixedSearch': 'QA-PAPER-INDEPENDENT-20261103C',
    'observedResultCount': 1,
    'visibleTitle': 'QA-PAPER-INDEPENDENT-20261103C',
    'visibleBody': 'Alpha Beta Gamma',
    'visibleDateBeforeAndAfter': '2026年11月3日23:45',
    'observedState': {'keyboardBeforePickerAndAfterHidden': True, 'sevenItemsVisible': True,
        'selectedPriorToAnyCardTap': 'grid-large', 'cardTapped': False, 'cancelTapped': True,
        'currentRowsAfterBlank': [['lines-small', 'grid-small'], ['lines-medium', 'grid-medium'], ['lines-large', 'grid-large']],
        'referenceRowsAfterBlank': [['lines-small', 'lines-medium'], ['lines-large', 'grid-small'], ['grid-medium', 'grid-large']]},
    'conclusion': 'Finite actual current06 paper page/cancel observations supported; card order differs from reference; no pixel acceptance.',
    'limits': ['No DB or rich-text JSON query', 'No card selection or save', 'Different preexisting selected state from reference',
        'No body-editing keyboard-entry test', 'No screenshot geometry recomputation', 'No APK/DB/audio payload export'],
}
with (OUT / 'result.json').open('x') as f:
    f.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
files = [ident(p) for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'manifest.json']
aggregate = hashlib.sha256(''.join(x['sha256'] + '  ' + x['path'] + '\n' for x in files).encode()).hexdigest()
with (OUT / 'manifest.json').open('x') as f:
    f.write(json.dumps({'schema': 1, 'files': files, 'aggregate': aggregate, 'excludes': ['manifest.json']}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'filesIncludingManifest': len(files) + 1, 'bytesExcludingManifest': sum(x['bytes'] for x in files), 'aggregate': aggregate, 'manifest': ident(OUT / 'manifest.json')}, ensure_ascii=False))
