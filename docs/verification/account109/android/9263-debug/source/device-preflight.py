"""Read-only, serial-scoped preflight. No raw device/log output is archived."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import tempfile

OUT = Path(__file__).resolve().parent.parent
SERIAL = '98895a3147304c3132'
PACKAGE = 'com.local.notesclone.account109'
ADB = '/Users/water/Library/Android/sdk/platform-tools/adb'
TOOLS = Path('/Users/water/Library/Android/sdk/build-tools/36.0.0')
CERT = 'e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'


def adb(*args, binary=False):
    return subprocess.check_output([ADB, '-s', SERIAL, *args], timeout=25,
                                   stderr=subprocess.DEVNULL, text=not binary)


def check():
    report = {'schema': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'serial': SERIAL, 'package': PACKAGE, 'readOnly': True, 'passed': False,
              'installedByVerifier': False, 'driverConnected': False}
    try:
        assert adb('get-state').strip() == 'device'
        report['deviceOnline'] = True
        policy = adb('shell', 'dumpsys', 'window', 'policy')
        report['unlocked'] = bool(re.search(r'\bshowing=false\b', policy) and
                                  re.search(r'\binputRestricted=false\b', policy))
        if not report['unlocked']:
            report['stopReason'] = 'ANDROID_DEVICE_AUTH_REQUIRED'
            report['phoneOperationsStoppedAtLockCheck'] = True
            return report
        report['currentUser'] = adb('shell', 'am', 'get-current-user').strip()
        assert report['currentUser'] == '0'
        activity = adb('shell', 'dumpsys', 'activity', 'activities')
        resumed = [line for line in activity.splitlines() if 'mResumedActivity:' in line]
        report['isolatedPackageUser0Foreground'] = len(resumed) == 1 and bool(
            re.search(r'\su0\s+' + re.escape(PACKAGE) + r'/', resumed[0]))
        report['forwardsBefore'] = [line.split() for line in adb('forward', '--list').splitlines()
                                    if line.startswith(SERIAL + ' ')]
        paths = adb('shell', 'pm', 'path', '--user', '0', PACKAGE).strip().splitlines()
        assert len(paths) == 1 and paths[0].startswith('package:/data/app/')
        apk_path = paths[0].split(':', 1)[1]
        assert apk_path.endswith('/base.apk') and not any(c.isspace() for c in apk_path)
        raw = adb('exec-out', 'cat', apk_path, binary=True)
        env = os.environ.copy()
        env['JAVA_HOME'] = '/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
        with tempfile.NamedTemporaryFile(dir=OUT, suffix='.apk') as temp:
            temp.write(raw)
            temp.flush()
            sig = subprocess.check_output([str(TOOLS / 'apksigner'), 'verify', '--print-certs', temp.name],
                                          text=True, env=env, stderr=subprocess.DEVNULL)
            badging = subprocess.check_output([str(TOOLS / 'aapt2'), 'dump', 'badging', temp.name],
                                              text=True, stderr=subprocess.DEVNULL)
        certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)', sig)
        assert certs == [CERT]
        assert "package: name='com.local.notesclone.account109'" in badging
        assert "launchable-activity: name='com.local.notesclone.MainActivity'" in badging
        report['installedApk'] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                                  'certificateSha256': certs[0], 'packageVerified': True,
                                  'activityVerified': True, 'user': 0}
        report['passed'] = True
        return report
    except Exception as error:
        report['stopReason'] = 'READ_ONLY_PREFLIGHT_FAILED'
        report['errorType'] = type(error).__name__
        return report


if __name__ == '__main__':
    report = check()
    (OUT / 'device-preflight.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
