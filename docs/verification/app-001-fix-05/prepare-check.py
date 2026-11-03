#!/usr/bin/env python3
"""Record locked close-role source evidence; do not compile, download, or launch."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
REGISTRY = Path('/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae')


def command(argv):
    result = subprocess.run(argv, cwd=ROOT, text=True, capture_output=True, timeout=60)
    return {'argv': argv, 'exitCode': result.returncode,
            'stdout': result.stdout, 'stderr': result.stderr}


def fingerprint(path):
    content = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}


sources = {
    'tauri-2.12.5/src/menu/builders/menu.rs': [(552, 577)],
    'tauri-2.12.5/src/menu/predefined.rs': [(238, 255)],
    'tauri-2.12.5/src/manager/window.rs': [(173, 185)],
    'muda-0.20.0/src/items/predefined.rs': [(223, 232), (658, 667)],
    'muda-0.20.0/src/accelerator/mod.rs': [(66, 73)],
    'muda-0.20.0/src/platform_impl/macos/mod.rs': [(634, 654), (709, 735), (940, 946)],
    'tao-0.37.2/src/platform_impl/macos/window_delegate.rs': [(202, 210)],
    'tauri-runtime-wry-2.12.3/src/lib.rs': [(4250, 4257), (4351, 4381)],
}
paths = [ROOT / path for path in ('src-tauri/src/lib.rs', 'src/App.tsx',
         'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock')]
paths += [REGISTRY / path for path in sources]
inputs = [fingerprint(path) for path in paths]
excerpts = []
for relative, ranges in sources.items():
    path = REGISTRY / relative
    crate, crate_relative = relative.split('/', 1)
    checksum_path = REGISTRY / crate / '.cargo-checksum.json'
    checksum = json.loads(checksum_path.read_text()) if checksum_path.exists() else None
    expected = checksum['files'].get(crate_relative) if checksum else None
    lines = path.read_text().splitlines()
    excerpts.append({'source': str(path), 'extractedChecksumFilePresent': checksum_path.exists(),
                     'packageChecksum': checksum['package'] if checksum else None,
                     'expectedExtractedFileSha256': expected,
                     'matchesExtractedFileChecksum': None if expected is None else
                         expected == hashlib.sha256(path.read_bytes()).hexdigest(),
                     'excerpts': [{'firstLine': first, 'lastLine': last,
                                  'text': '\n'.join(lines[first-1:last])}
                                  for first, last in ranges]})

lock = (ROOT / 'src-tauri/Cargo.lock').read_text()
wanted = {'tauri', 'muda', 'tao', 'tauri-runtime-wry'}
locked = []
for block in lock.split('[[package]]')[1:]:
    fields = dict(re.findall(r'^(name|version|checksum) = "([^"\n]+)"$', block, re.MULTILINE))
    if fields.get('name') in wanted:
        locked.append({key: fields[key] for key in ('name', 'version', 'checksum')})
archive_checks = []
for package in locked:
    crate = f"{package['name']}-{package['version']}"
    archive = REGISTRY.parent.parent / 'cache' / REGISTRY.name / (crate + '.crate')
    paths.append(archive)
    archive_info = fingerprint(archive)
    matches = []
    with tarfile.open(archive, 'r:gz') as content:
        for relative in sources:
            if relative.startswith(crate + '/'):
                archived = content.extractfile(relative).read()
                matches.append({'path': relative, 'matchesArchive':
                                archived == (REGISTRY / relative).read_bytes()})
    archive_checks.append({'archive': archive_info,
                           'matchesCargoLockChecksum': archive_info['sha256'] == package['checksum'],
                           'sourceFiles': matches})
inputs = [fingerprint(path) for path in paths]
targets = [ROOT / 'target', ROOT / 'src-tauri/target']
targets_before = {str(path): path.exists() for path in targets}
format_result = command(['rustfmt', '--check', '--edition', '2021', '--config',
                         'skip_children=true', 'src-tauri/src/lib.rs'])
metadata = command(['cargo', 'metadata', '--offline', '--locked', '--no-deps',
                    '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'])
if metadata['exitCode'] == 0:
    parsed = json.loads(metadata.pop('stdout'))
    metadata['summary'] = {'workspaceRoot': parsed['workspace_root'],
                           'targetDirectoryReportedOnly': parsed['target_directory'],
                           'resolve': parsed['resolve'],
                           'packages': [{'name': p['name'], 'version': p['version']}
                                        for p in parsed['packages']]}
report = {
    'readAt': datetime.now(timezone.utc).isoformat(),
    'worktree': str(ROOT),
    'head': command(['git', 'rev-parse', 'HEAD'])['stdout'].strip(),
    'inputs': inputs,
    'inputAggregate': hashlib.sha256(''.join(
        f"{item['path']}\0{item['sha256']}\n" for item in inputs
    ).encode()).hexdigest(),
    'lockedVersions': locked, 'cachedArchiveChecks': archive_checks,
    'lockedSourceExcerpts': excerpts,
    'tools': [command(['rustfmt', '--version']), command(['cargo', '--version'])],
    'checks': [format_result, metadata],
    'inputsUnchangedAfterChecks': inputs == [fingerprint(path) for path in paths],
    'targetExistenceBefore': targets_before,
    'targetExistenceAfter': {str(path): path.exists() for path in targets},
    'scope': 'Source preparation, rustfmt parse/format and offline locked no-deps metadata only. '
             'No Rust/frontend compilation, dependency download, GUI/device, app launch, or runtime proof.'
}
(OUT / 'prepare-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'checks': [check['exitCode'] for check in report['checks']],
                  'inputAggregate': report['inputAggregate'],
                  'inputsUnchangedAfterChecks': report['inputsUnchangedAfterChecks'],
                  'targetsUnchanged': report['targetExistenceBefore'] == report['targetExistenceAfter'],
                  'cachedSourcesMatchLock': all(item['matchesCargoLockChecksum'] and
                      all(source['matchesArchive'] for source in item['sourceFiles'])
                      for item in archive_checks)}))
raise SystemExit(0 if all(check['exitCode'] == 0 for check in report['checks']) and
                 all(item['matchesCargoLockChecksum'] and
                     all(source['matchesArchive'] for source in item['sourceFiles'])
                     for item in archive_checks) else 1)
