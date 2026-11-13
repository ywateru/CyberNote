"""Verify, push, execute once, and remove the exact owned public Rust probe.

No raw stderr/device logs or credentials are retained. No application, SSO,
grant, APK, environment override, proxy setting, DNS override or IP pinning.
"""
from pathlib import Path
import datetime
import hashlib
import json
import re
import shlex
import shutil
import struct
import subprocess
import time
import uuid

MAIN = Path('/Users/water/work/2026/Apple-Notes-Clone')
INPUT = Path('/private/tmp/account109-android-public-native-probe01')
OUT = Path(__file__).resolve().parent
ADB = '/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL = '98895a3147304c3132'
EXPECTED = 'b9c628a47f70c6be884478c3957185a2ecf5a6a086880505a1bf2bdfc2494d02'
BINARY = INPUT / 'account109-public-connectivity'
DEVICE = '/data/local/tmp/account109-public-probe-' + uuid.uuid4().hex


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def call(args, timeout=15):
    began = time.monotonic()
    try:
        r = subprocess.run([ADB, '-s', SERIAL, *args], capture_output=True, timeout=timeout)
        return r.stdout, r.stderr, {'exitCode': r.returncode,
            'elapsedMs': round((time.monotonic() - began) * 1000), 'hostTimedOut': False}
    except subprocess.TimeoutExpired:
        return b'', b'', {'exitCode': None, 'elapsedMs': round((time.monotonic() - began) * 1000),
                         'hostTimedOut': True}


def shell(command, timeout=15):
    return call(['shell', command], timeout)


def save(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + '\n')


def inspect_elf(blob):
    assert blob[:6] == b'\x7fELF\x02\x01'
    kind, machine = struct.unpack_from('<HH', blob, 16)
    assert kind == 3 and machine == 183
    phoff = struct.unpack_from('<Q', blob, 32)[0]
    phsize, phcount = struct.unpack_from('<HH', blob, 54)
    interpreter = None
    api = None
    for i in range(phcount):
        ptype, _, offset, _, _, size, _, _ = struct.unpack_from('<IIQQQQQQ', blob, phoff + i * phsize)
        if ptype == 3:
            interpreter = blob[offset:offset + size].rstrip(b'\0').decode()
        if ptype == 4:
            cursor = offset
            while cursor + 12 <= offset + size:
                namesz, descsz, _ = struct.unpack_from('<III', blob, cursor)
                cursor += 12
                name = blob[cursor:cursor + namesz].rstrip(b'\0')
                cursor += (namesz + 3) & ~3
                desc = blob[cursor:cursor + descsz]
                cursor += (descsz + 3) & ~3
                if name == b'Android' and len(desc) >= 4:
                    api = struct.unpack_from('<I', desc)[0]
    assert interpreter == '/system/bin/linker64' and api == 28
    return {'class': 64, 'endianness': 'little', 'machine': 'AArch64', 'eMachine': machine,
            'type': 'DYN/PIE', 'interpreter': interpreter, 'androidApiFromElfNote': api,
            'independentlyParsed': True}


def validate_json(data):
    assert set(data) == {'schema', 'kind', 'reqwest', 'hasLowercaseProxy', 'rows', 'credentialsSent', 'networkSettingsChanged'}
    assert data['schema'] == 1 and data['kind'] == 'public-native-connectivity' and data['reqwest'] == '0.12.28'
    assert data['credentialsSent'] is False and data['networkSettingsChanged'] is False
    assert isinstance(data['hasLowercaseProxy'], bool)
    expected = {(endpoint, mode) for endpoint in ['coordinatorHealth', 'coordinatorConfig', 'coordinatorAnonymousProfile']
                for mode in ['inherited', 'direct']} | {('identityDiscovery', 'direct')}
    assert len(data['rows']) == 7
    assert {(r['endpoint'], r['mode']) for r in data['rows']} == expected
    kinds = ['NotFound', 'PermissionDenied', 'ConnectionRefused', 'ConnectionReset', 'HostUnreachable',
             'NetworkUnreachable', 'ConnectionAborted', 'NotConnected', 'AddrInUse', 'AddrNotAvailable',
             'NetworkDown', 'BrokenPipe', 'AlreadyExists', 'WouldBlock', 'InvalidInput', 'InvalidData',
             'TimedOut', 'WriteZero', 'Interrupted', 'Unsupported', 'UnexpectedEof', 'OutOfMemory', 'Other', 'Uncategorized']
    for row in data['rows']:
        assert set(row) <= {'mode', 'endpoint', 'status', 'ms', 'timeout', 'connect', 'request', 'ioKind', 'osCode'}
        assert type(row['ms']) is int and 0 <= row['ms'] <= 25000
        if 'status' in row:
            assert type(row['status']) is int and 100 <= row['status'] <= 599
        else:
            assert all(isinstance(row[k], bool) for k in ['timeout', 'connect', 'request'])
            assert row['ioKind'] is None or row['ioKind'] in kinds
            assert row['osCode'] is None or type(row['osCode']) is int
    return data


def main():
    receipt = {'schema': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'serial': SERIAL, 'binary': str(BINARY), 'expectedSha256': EXPECTED, 'devicePath': DEVICE,
        'executionAttempts': 0, 'maxExecutionSeconds': 25, 'environmentOverrides': {},
        'appLaunched': False, 'ssoRetried': False, 'grantAccessed': False, 'apkUpdated': False,
        'networkSettingsChanged': False, 'rawStderrRetained': False, 'cleanup': {}}
    owned = False
    try:
        assert not (OUT / 'run-receipt.json').exists(), 'Never reuse a prior execution receipt'
        assert sha(BINARY) == EXPECTED
        blob = BINARY.read_bytes()
        artifact = json.loads((INPUT / 'artifact-receipt.json').read_text())
        assert artifact['sha256'] == EXPECTED and artifact['bytes'] == len(blob)
        assert artifact['requests'] == 7 and artifact['concurrent'] and artifact['androidApi'] == 28
        elf = inspect_elf(blob)
        save('elf-verified.json', elf)
        source = json.loads((INPUT / 'source-manifest.json').read_text())
        expected_source = MAIN / 'docs/verification/account109/server/native-public01/source'
        assert Path(source['source']) == expected_source
        for f in source['files']:
            assert f['path'] in ['Cargo.toml', 'Cargo.lock', 'src/main.rs']
            p = INPUT / f['path']
            assert p.stat().st_size == f['bytes'] and sha(p) == f['sha256'] == sha(expected_source / f['path'])
            destination = OUT / 'source' / f['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, destination)
        for name in ['artifact-receipt.json', 'build-command.json', 'source-manifest.json', 'elf-inspection.txt']:
            shutil.copyfile(INPUT / name, OUT / name)
        for name in ['result.json', 'receipt.json']:
            shutil.copyfile(expected_source.parent / name, OUT / ('desktop-' + name))
        receipt['binarySha256'] = EXPECTED
        receipt['binaryBytes'] = len(blob)
        receipt['sourceByteIdenticalToDesktopProbe'] = True
        receipt['elf'] = elf
        # Report only key-presence booleans, never proxy values.
        proxy, _, meta = shell("env | sed -n 's/^\\(HTTP_PROXY\\|HTTPS_PROXY\\|ALL_PROXY\\|NO_PROXY\\|http_proxy\\|https_proxy\\|all_proxy\\|no_proxy\\)=.*/\\1=present/p'")
        keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']
        present = proxy.decode(errors='replace').splitlines()
        receipt['deviceProxyEnvironmentPresent'] = {key: key + '=present' in present for key in keys}
        _, _, fresh = shell('test ! -e ' + shlex.quote(DEVICE) + ' && test ! -L ' + shlex.quote(DEVICE))
        assert fresh['exitCode'] == 0
        timeout, _, _ = shell('command -v timeout >/dev/null 2>&1 && echo yes')
        assert timeout.strip() == b'yes', 'Remote execution must have an independent 25-second bound'
        owned = True  # Clean up even a partial push, only after proving this exact path absent.
        _, _, push = call(['push', str(BINARY), DEVICE], 20)
        receipt['push'] = push
        assert push['exitCode'] == 0
        _, _, mode = shell('test -f ' + shlex.quote(DEVICE) + ' && test ! -L ' + shlex.quote(DEVICE) +
                           ' && chmod 700 ' + shlex.quote(DEVICE))
        assert mode['exitCode'] == 0
        hash_cmd, _, _ = shell('if command -v sha256sum >/dev/null 2>&1; then echo sha256sum; elif toybox sha256sum --help >/dev/null 2>&1; then echo toybox; fi')
        method = hash_cmd.strip().decode()
        if method in ['sha256sum', 'toybox']:
            raw, _, checked = shell(('sha256sum ' if method == 'sha256sum' else 'toybox sha256sum ') + shlex.quote(DEVICE))
            match = re.match(rb'^([0-9a-f]{64})\s', raw)
            assert checked['exitCode'] == 0 and match and match[1].decode() == EXPECTED
            receipt['onDeviceSha256'] = EXPECTED
            receipt['onDeviceHashMethod'] = method
        else:
            receipt['onDeviceHashUnavailable'] = True
        receipt['executionAttempts'] = 1
        save('run-receipt.json', receipt)
        print(json.dumps({'phase': 'verified-probe-starting-once', 'sha256': EXPECTED,
                          'onDeviceHashVerified': receipt.get('onDeviceSha256') == EXPECTED,
                          'maxExecutionSeconds': 25}), flush=True)
        stdout, stderr, execution = shell('timeout -s KILL 25 ' + shlex.quote(DEVICE), 28)
        receipt['execution'] = execution
        receipt['stderrBytesDiscarded'] = len(stderr)
        if execution['exitCode'] != 0:
            combined = (stdout + stderr).lower()
            receipt['failure'] = 'EXECUTION_PERMISSION_DENIED' if b'permission denied' in combined else 'BOUNDED_PROBE_EXECUTION_FAILED'
            receipt['selinuxBlockEstablished'] = False
        else:
            assert len(stdout) <= 65536
            result = validate_json(json.loads(stdout))
            save('result.json', result)
            receipt['validatedJsonOnly'] = True
            print(json.dumps({'phase': 'native-public-probe-result', **result}), flush=True)
    except Exception as error:
        receipt['failure'] = receipt.get('failure', 'PROBE_VERIFICATION_OR_EXECUTION_FAILED')
        receipt['errorType'] = type(error).__name__
    finally:
        if owned:
            _, _, removed = shell('rm -f ' + shlex.quote(DEVICE))
            _, _, absent = shell('test ! -e ' + shlex.quote(DEVICE) + ' && test ! -L ' + shlex.quote(DEVICE))
            receipt['cleanup'] = {'exactOwnedBinaryRemoved': removed['exitCode'] == 0 and absent['exitCode'] == 0,
                                  'devicePathAbsent': absent['exitCode'] == 0, 'otherPathsRemoved': False}
        else:
            receipt['cleanup'] = {'deviceBinaryNeverOwnedOrPushed': True}
        receipt['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        receipt['adbOwnershipReturned'] = True
        save('run-receipt.json', receipt)
        print(json.dumps({'phase': 'native-public-probe-finished', 'executionAttempts': receipt['executionAttempts'],
            'failure': receipt.get('failure'), 'cleanup': receipt['cleanup'], 'adbOwnershipReturned': True}))


if __name__ == '__main__':
    main()
