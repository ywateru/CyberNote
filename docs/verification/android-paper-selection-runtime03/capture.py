"""Bounded actual-UI capture on the one authorized installed candidate06 device."""
from pathlib import Path
import datetime, hashlib, json, re, shutil, subprocess, sys

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/android-paper-selection-runtime03'
ADB = '/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
SERIAL = 'emulator-5580'
PACKAGE = 'com.local.notesclone'
EXPECTED = (177445114, 'd6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c') if len(sys.argv)>3 and sys.argv[3]=='new' else (177445114, '843e0c01aad154872851664ced574e1fa07544d8fcf874022698c37a3ee160f8')
tag = sys.argv[1]
assert re.fullmatch(r'[a-z0-9-]+', tag)
events = []
record = {'serial': SERIAL, 'package': PACKAGE, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}

def run(args, binary=False, allowed=(0,)):
    try:
        p = subprocess.run([ADB, '-s', SERIAL] + args, capture_output=True, timeout=25)
    except subprocess.TimeoutExpired as exc:
        events.append({'args': args, 'timeoutSeconds': 25, 'stdout': (exc.stdout or b'').decode(errors='replace'), 'stderr': (exc.stderr or b'').decode(errors='replace')})
        raise
    events.append({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'args': args, 'exitCode': p.returncode,
        'stdout': {'bytes': len(p.stdout), 'sha256': hashlib.sha256(p.stdout).hexdigest()} if binary else p.stdout.decode(errors='replace'),
        'stderr': p.stderr.decode(errors='replace')})
    if p.returncode not in allowed:
        raise RuntimeError(events[-1])
    return p.stdout

def space():
    free = shutil.disk_usage(ROOT).free
    assert free >= 2 * 1024**3, free
    raw = run(['shell', 'df', '-k', '/data']).decode()
    fields = raw.strip().splitlines()[-1].split()
    assert int(fields[3]) * 1024 >= 2 * 1024**3, raw
    return {'hostFreeBytes': free, 'deviceDataDf': raw}

try:
    record['hostFreeBefore'] = shutil.disk_usage(ROOT).free
    assert record['hostFreeBefore'] >= 2 * 1024**3
    assert run(['get-state']).strip() == b'device'
    record['spaceBefore'] = space()
    if sys.argv[2] == 'identity':
        props = {key: run(['shell', 'getprop', key]).decode().strip() for key in ['ro.product.model', 'ro.product.device', 'ro.kernel.qemu', 'ro.build.fingerprint']}
        record['properties'] = props
        assert props['ro.product.model'] == 'sdk_gphone_arm64' and props['ro.product.device'] == 'emulator_arm64' and props['ro.kernel.qemu'] == '1'
        paths = run(['shell', 'pm', 'path', PACKAGE]).decode().strip().splitlines()
        assert len(paths) == 1 and paths[0].startswith('package:/data/app/') and paths[0].endswith('/base.apk'), paths
        path = paths[0][8:]
        size = int(run(['shell', 'stat', '-c', '%s', path]).decode().strip())
        sha = run(['shell', 'sha256sum', path]).decode().split()[0]
        record['installedApk'] = {'path': path, 'bytes': size, 'sha256': sha}
        assert (size, sha) == EXPECTED, record['installedApk']
        dump = run(['shell', 'dumpsys', 'package', PACKAGE]).decode()
        record['packageFields'] = {key: re.search(r'^\s*' + key + r'=(.*)$', dump, re.M).group(1) for key in ['userId', 'firstInstallTime', 'lastUpdateTime']}
        record['pidof'] = run(['shell', 'pidof', PACKAGE], allowed=(0, 1)).decode().strip()
        record['sourceHead'] = '093986d170ef279fbce0f66e59891fd5f94aecad' if sys.argv[3:] == ['new'] else '347660b352f6becb1f52a9c79fdf5372b50f1f12'
    elif sys.argv[2] == 'capture':
        commands = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []
        for args in commands:
            assert args[:2] == ['shell', 'input'] and args[2] in ['tap', 'keyevent', 'text', 'swipe'], args
            run(args)
        record['spaceBeforePng'] = space()
        png = run(['exec-out', 'screencap', '-p'], binary=True)
        assert png.startswith(b'\x89PNG\r\n\x1a\n'), 'not PNG'
        with (OUT / (tag + '.png')).open('xb') as f:
            f.write(png)
        record['png'] = {'path': tag + '.png', 'bytes': len(png), 'sha256': hashlib.sha256(png).hexdigest()}
        record['pidof'] = run(['shell', 'pidof', PACKAGE], allowed=(0, 1)).decode().strip()
    else:
        raise RuntimeError('unknown mode')
    record['status'] = 'PASS'
except Exception as exc:
    record['status'] = 'FAIL_STOP'
    record['error'] = repr(exc)
finally:
    record['events'] = events
    record['hostFreeAfter'] = shutil.disk_usage(ROOT).free
    with (OUT / (tag + '.json')).open('x') as f:
        f.write(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: record[k] for k in ['status', 'installedApk', 'png', 'error'] if k in record}, ensure_ascii=False))
sys.exit(0 if record['status'] == 'PASS' else 1)
