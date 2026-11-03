"""Supplemental Android recovery evidence; imports perform no capture/build."""
import hashlib
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'preparation'))
import common as c

RO = Path('/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro')
ORIGINAL = c.ROOT / 'docs/verification/unified-candidate04/build-01/source-inputs-before.json'
MAC = c.ROOT / 'docs/verification/unified-candidate04/build-01/MAC-STAGE-MANIFEST.json'
SOURCE_HEAD = 'd8f832e83349c7503b872e0e88853d1ab7b0713a'
TOOLS = {'scripts/build-window-capture.py', 'scripts/check-window-capture.swift', 'scripts/run-window-capture.py', 'scripts/window-capture.md', 'scripts/window-capture.swift'}
EXPECTED_RO = {
 'modules-2/metadata-2.107/module-artifact.bin': (18667, '55b0eeb6b0400be7162efe79646c630f6c05b88165f1e89e946e252f169d2654'),
 'modules-2/files-2.1/androidx.lifecycle/lifecycle-livedata/2.10.0/ce0b5f930a64679a621c8bc67c060a7820c0a57b/lifecycle-livedata-2.10.0.aar': (55037, '3e8c009fc88da1c52e4ed05a81269d5ac9bd405046f300307f5e3a17e201a6df')}

def supplemental(current):
    original = json.loads(ORIGINAL.read_text())
    if original['head'] != SOURCE_HEAD or len(original['files']) != 279:
        raise RuntimeError('Unexpected accepted original source reference')
    old = {r['path']: r for r in original['files']}
    new = {r['path']: r for r in current['files']}
    changed = [p for p, row in old.items() if new.get(p) != row]
    additions = sorted(set(new) - set(old))
    if changed or set(additions) != TOOLS:
        raise RuntimeError('Original 279 inputs changed or unexpected additions: ' + repr((changed, additions)))
    files = []
    found = set()
    for p in sorted(RO.rglob('*')):
        if p.is_symlink() or p.stat().st_mode & 0o222:
            raise RuntimeError('Overlay must be real and read-only: ' + str(p))
        if p.is_file():
            rel = str(p.relative_to(RO)); found.add(rel)
            row = {**c.identity(p), 'path': rel}
            if rel not in EXPECTED_RO or (row['bytes'], row['sha256']) != EXPECTED_RO[rel]:
                raise RuntimeError('Unexpected supplemental cache bytes: ' + rel)
            files.append(row)
    if found != set(EXPECTED_RO) or not RO.is_dir() or RO.is_symlink() or RO.stat().st_mode & 0o222:
        raise RuntimeError('Supplemental cache is incomplete or writable')
    files.sort(key=lambda row: list(EXPECTED_RO).index(row['path']))
    aggregate = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'supplementalBuildEnvironment': {'GRADLE_RO_DEP_CACHE': str(RO), 'GRADLE_OPTS': '-Dorg.gradle.daemon=false'},
            'readOnlyCache': {'path': str(RO), 'files': files, 'aggregateSha256': aggregate},
            'acceptedMacReference': {'manifest': c.identity(MAC), 'sourceHead': SOURCE_HEAD, 'sameCompleteFreezeAsRecovery': False},
            'originalSourceReference': c.identity(ORIGINAL),
            'originalInputComparison': {'unchangedOriginalFiles': len(old), 'changedOriginalFiles': changed, 'addedTools': [new[p] for p in additions]}}
