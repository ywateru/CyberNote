from pathlib import Path
import datetime, hashlib, json, shutil, subprocess, sys

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent
ADB = '/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
SERIAL = 'emulator-5580'
PKG = 'com.local.notesclone'
REMOTE = '/data/user/0/com.local.notesclone/attachments/op-109f65df-0ac3-4f50-90e7-12665a22e060-6771077d-eee5-4c9a-875b-e9b7445cf516.blob'
EXPECTED = '6e145210f656836e9f1260f8e349af1ab8737e52885b27ed70fba80bf15fb32c'
APK_SHA = 'bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2'

def guard():
    free = shutil.disk_usage(ROOT).free
    assert free >= 2 * 1024**3, 'Less than 2 GiB; stage stopped'
    return free

events = []
def adb(args, binary=False):
    command = [ADB, '-s', SERIAL] + args
    p = subprocess.run(command, capture_output=True, timeout=40)
    event = {'command': command, 'exitCode': p.returncode, 'stderr': p.stderr.decode(errors='replace')}
    if binary:
        event['stdoutBytes'] = len(p.stdout)
    else:
        event['stdout'] = p.stdout.decode(errors='replace')
    events.append(event)
    assert p.returncode == 0, event
    return p.stdout if binary else p.stdout.decode().strip()

stage = sys.argv[1]
meta = {'stage': stage, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'freeBefore': guard(), 'serial': SERIAL, 'package': PKG, 'remote': REMOTE}
try:
    if stage == 'preflight':
        assert adb(['get-state']) == 'device'
        meta['deviceProperties'] = {key: adb(['shell', 'getprop', key]) for key in ['ro.product.model', 'ro.product.device', 'ro.build.fingerprint', 'ro.boot.qemu.avd_name']}
        assert adb(['shell', 'getprop', 'ro.kernel.qemu']) == '1'
        path_result = adb(['shell', 'pm', 'path', PKG])
        assert path_result.startswith('package:') and '\n' not in path_result
        apk = path_result.removeprefix('package:')
        apk_size = int(adb(['shell', 'stat', '-c', '%s', apk]))
        apk_hash = adb(['shell', 'sha256sum', apk]).split()[0]
        meta['installedApk'] = {'path': apk, 'bytes': apk_size, 'sha256': apk_hash}
        assert apk_size == 304110831 and apk_hash == APK_SHA, 'Installed APK identity mismatch'
        size = int(adb(['shell', 'run-as', PKG, 'stat', '-c', '%s', REMOTE]))
        digest = adb(['shell', 'run-as', PKG, 'sha256sum', REMOTE]).split()[0]
        meta['sourceFile'] = {'bytes': size, 'sha256': digest}
        assert size == 168397 and digest == EXPECTED, 'Source recording identity mismatch; no export'
    elif stage == 'export':
        prior = json.loads((OUT / 'preflight.json').read_text())
        assert prior['status'] == 'PASS'
        target = OUT / 'new-recording.webm'
        assert not target.exists(), 'Refuse overwrite'
        size = int(adb(['shell', 'run-as', PKG, 'stat', '-c', '%s', REMOTE]))
        digest = adb(['shell', 'run-as', PKG, 'sha256sum', REMOTE]).split()[0]
        assert size == 168397 and digest == EXPECTED, 'Source changed; no export'
        data = adb(['exec-out', 'run-as', PKG, 'cat', REMOTE], binary=True)
        assert len(data) == 168397 and hashlib.sha256(data).hexdigest() == EXPECTED
        guard()
        with target.open('xb') as f:
            f.write(data)
        after_size = int(adb(['shell', 'run-as', PKG, 'stat', '-c', '%s', REMOTE]))
        after_hash = adb(['shell', 'run-as', PKG, 'sha256sum', REMOTE]).split()[0]
        assert after_size == size and after_hash == digest
        meta.update(destination=str(target), bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), sourceAfter={'bytes': after_size, 'sha256': after_hash})
    else:
        raise ValueError(stage)
    meta['status'] = 'PASS'
except Exception as error:
    meta.update(status='FAIL', error=repr(error))
    raise
finally:
    meta.update(events=events, freeAfter=shutil.disk_usage(ROOT).free)
    (OUT / (stage + '.json')).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in meta.items() if k != 'events'}, ensure_ascii=False, indent=2))
