"""Read-only device SQL for exact synthetic IDs; no DB/WAL or audio transfer."""
from pathlib import Path
import datetime
import hashlib
import json
import shutil
import shlex
import subprocess
import sys

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/unified-candidate04-android-install-01'
ADB = '/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
SERIAL = 'emulator-5580'
PACKAGE = 'com.local.notesclone'
DATA = '/data/user/0/com.local.notesclone'
IDS = ['1a0718dd-c71c-4192-89b6-bd58cb9ba475', 'a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3', 'a5a92add-fdb9-4b7f-9836-e7e4a930b2c2']
ATTACHMENT = 'cb3fa001-9d73-4580-b959-38481fbba90b'
EXPECTED = {'before': 'bd29ae0b526cafa9b491d645587f5ae7b1254f0e56ad7fc7df309b2fed143477', 'after': 'bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2'}

def adb(args, binary=False, allowed=(0,)):
    p = subprocess.run([ADB, '-s', SERIAL] + args, capture_output=True, timeout=30)
    if p.returncode not in allowed:
        raise RuntimeError(json.dumps({'args': args, 'exit': p.returncode, 'stderr': p.stderr.decode(errors='replace')}))
    if binary:
        return p.stdout
    return {'exit': p.returncode, 'stdout': p.stdout.decode(), 'stderr': p.stderr.decode()}

def file_identity(path, private=False):
    prefix = ['shell'] + (['run-as', PACKAGE] if private else [])
    size = adb(prefix + ['stat', '-c', '%s', path])
    digest = adb(prefix + ['sha256sum', path])
    return {'path': path, 'bytes': int(size['stdout'].strip()), 'sha256': digest['stdout'].split()[0]}

phase = sys.argv[1]
assert phase in EXPECTED
r = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'phase': phase, 'serial': SERIAL, 'package': PACKAGE}
try:
    r['hostFreeBytes'] = shutil.disk_usage(ROOT).free
    assert r['hostFreeBytes'] >= 2 * 1024**3, 'Host free space below 2 GiB'
    r['pidofBefore'] = adb(['shell', 'pidof', PACKAGE], allowed=(0, 1))
    assert r['pidofBefore']['exit'] == 1 and not r['pidofBefore']['stdout'].strip(), 'App unexpectedly running; no stop action sent'
    r['packagePath'] = adb(['shell', 'pm', 'path', PACKAGE])
    lines = r['packagePath']['stdout'].strip().splitlines()
    assert len(lines) == 1 and lines[0].startswith('package:/data/app/'), 'Unexpected APK paths'
    base = lines[0][len('package:'):]
    r['installedApk'] = file_identity(base)
    assert r['installedApk']['sha256'] == EXPECTED[phase], 'Installed APK baseline mismatch'
    r['dataRoot'] = DATA
    r['dataRootBasis'] = 'Derived this round from locked Tauri 2.12.5 Android app_data_dir/getDataDir/activity.dataDir and Store::open; exact notes.sqlite3 stat succeeded. Not a path supplied by old candidate03 records.'
    names = ['notes.sqlite3', 'notes.sqlite3-wal']
    r['databaseFileChecks'] = [dict(name=n, **file_identity(DATA + '/' + n, True)) for n in names]
    def selected_row(sql, columns):
        command = shlex.join(['run-as', PACKAGE, '/system/bin/sqlite3', '-readonly', DATA + '/notes.sqlite3', sql])
        raw = adb(['shell', command])
        lines = raw['stdout'].strip().splitlines()
        assert len(lines) == 1, 'Exact selected row missing or duplicated'
        values = lines[0].split('|')
        assert len(values) == len(columns), 'Unexpected fixed-column projection'
        row = {key: bytes.fromhex(value).decode('utf-8') for key, value in zip(columns, values)}
        row['body'] = json.loads(row['body'])
        if 'revision' in row:
            row['revision'] = int(row['revision'])
        return row
    r['syntheticNotes'] = []
    for nid in IDS:
        assert all(c in '0123456789abcdef-' for c in nid)
        sql = "SELECT hex(id)||'|'||hex(folder_id)||'|'||hex(body)||'|'||hex(revision) FROM notes WHERE id='" + nid + "';"
        r['syntheticNotes'].append(selected_row(sql, ['id', 'folder_id', 'body', 'revision']))
    sql = "SELECT hex(id)||'|'||hex(note_id)||'|'||hex(body) FROM attachments WHERE id='" + ATTACHMENT + "';"
    r['syntheticAttachments'] = [selected_row(sql, ['id', 'note_id', 'body'])]
    relative = r['syntheticAttachments'][0]['body']['relativePath']
    assert relative == ATTACHMENT + '.webm', 'Unexpected attachment path'
    r['syntheticAudio'] = file_identity(DATA + '/attachments/' + relative, True)
    r['databaseFileChecksAfterRead'] = [dict(name=n, **file_identity(DATA + '/' + n, True)) for n in names]
    assert r['databaseFileChecks'] == r['databaseFileChecksAfterRead'], 'DB/WAL changed during read'
    r['pidofAfter'] = adb(['shell', 'pidof', PACKAGE], allowed=(0, 1))
    assert r['pidofAfter']['exit'] == 1 and not r['pidofAfter']['stdout'].strip(), 'App unexpectedly running after read'
    baseline = json.loads((ROOT / 'docs/verification/unified-candidate03-android-independent-01/07-after-data-package.json').read_text())
    r['matchesCandidate03Baseline'] = {
        'syntheticNotes': r['syntheticNotes'] == baseline['syntheticNotes'],
        'syntheticAttachments': r['syntheticAttachments'] == baseline['syntheticAttachments'],
        'syntheticAudio': all(r['syntheticAudio'][k] == baseline['syntheticAudio'][k] for k in ['bytes', 'sha256']),
        'databaseFileChecks': all(all(e[k] == b[k] for k in ['name', 'bytes', 'sha256']) for e, b in zip(r['databaseFileChecks'], baseline['databaseFileChecks']))
    }
    assert all(r['matchesCandidate03Baseline'].values()), 'Selected baseline data mismatch'
    r['status'] = 'PASS'
except Exception as e:
    r['status'] = 'FAIL_STOP'
    r['error'] = str(e)
finally:
    r['copyHandling'] = 'Existing device sqlite3 -readonly queried exactly three synthetic note IDs and one attachment ID. No DB/WAL or audio bytes copied to host; whole-file DB/WAL and audio identities computed on device only.'
    r['notExecuted'] = ['app launch', 'UI input', 'force-stop', 'mirror', 'microphone configuration', 'permission operation', 'uninstall', 'clear data']
    (OUT / ('08-before-data-core.json' if phase == 'before' else '11-after-data-core.json')).write_text(json.dumps(r, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in r.items() if k not in ['syntheticNotes', 'syntheticAttachments']}, ensure_ascii=False))
sys.exit(0 if r['status'] == 'PASS' else 1)
