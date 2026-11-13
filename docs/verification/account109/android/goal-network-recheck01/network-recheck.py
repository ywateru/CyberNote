"""One canonical public Android HTTPS GET. No app, account or network changes."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import shlex
import subprocess
import time

OUT = Path(__file__).resolve().parent
ADB = '/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL = '98895a3147304c3132'
ENDPOINT = 'https://cybernote-sync.vercel.app/healthz'
FIELDS = ('status', 'dnsSeconds', 'connectSeconds', 'tlsSeconds', 'totalSeconds', 'verifyResult')
FORMAT = ('status=%{http_code}\ndnsSeconds=%{time_namelookup}\n'
          'connectSeconds=%{time_connect}\ntlsSeconds=%{time_appconnect}\n'
          'totalSeconds=%{time_total}\nverifyResult=%{ssl_verify_result}\n')
COMMAND = ('timeout 12 curl --silent --show-error --output /dev/null '
           '--connect-timeout 5 --max-time 10 --write-out '
           + shlex.quote(FORMAT) + ' ' + ENDPOINT)


def error_kind(value):
    value = value.lower()
    for needles, label in [
        (['permission denied', 'operation not permitted'], 'permissionDenied'),
        (['could not resolve', 'unknown host', 'bad address'], 'dnsResolutionFailed'),
        (['timed out', 'timeout'], 'timeout'),
        (['network is unreachable', 'no route to host'], 'routeUnavailable'),
        (['connection refused'], 'connectionRefused'),
        (['certificate', 'ssl peer', 'ca cert'], 'tlsCertificateOrTrust'),
        (['not found', 'unknown command'], 'commandUnavailable'),
    ]:
        if any(needle in value for needle in needles):
            return label
    return 'otherOrNone'


def main():
    result_path = OUT / 'result.json'
    # Exclusive reservation prevents accidentally repeating this single check.
    with result_path.open('x') as handle:
        handle.write('{}\n')
    report = {
        'schema': 1, 'kind': 'android-single-public-health-recheck',
        'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'currentDateUtc': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        'serial': SERIAL, 'method': 'GET', 'endpoint': ENDPOINT,
        'requestedGetCount': 1, 'attemptCount': 1, 'controlGetCount': 0,
        'connectTimeoutSeconds': 5, 'curlTotalTimeoutSeconds': 10,
        'deviceCommandTimeoutSeconds': 12, 'hostCommandTimeoutSeconds': 15,
        'certificateVerificationEnabled': True, 'redirectsFollowed': False,
        'credentialsSupplied': False, 'responseBodyRetained': False,
        'rawStdoutRetained': False, 'rawStderrRetained': False,
        'dnsOrIpOverridesUsed': False, 'proxyOrEnvironmentChanged': False,
        'networkOrVpnSettingsChanged': False, 'toolsInstalledOrCopied': False,
        'appStoreOrUiAccessed': False, 'accountOrLoginCommandsCalled': False,
        'separateDnsOrTcpProbesPerformed': False, 'readOnly': True,
        'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'priorCommandSource': '9263-signin01/network-diagnostic.py coordinator HTTPS curl command',
        'limitation': 'One Android shell public endpoint sample only; not app/runtime, account, JWKS or login validation.',
    }
    began = time.monotonic()
    stdout = stderr = ''
    try:
        response = subprocess.run([ADB, '-s', SERIAL, 'shell', COMMAND],
                                  capture_output=True, text=True, timeout=15)
        report.update(exitCode=response.returncode, hostTimedOut=False)
        stdout, stderr = response.stdout, response.stderr
        report['errorKind'] = error_kind(stderr)
    except subprocess.TimeoutExpired:
        report.update(exitCode=None, hostTimedOut=True, errorKind='hostCommandTimeout')
    except OSError:
        report.update(exitCode=None, hostTimedOut=False, errorKind='hostCommandUnavailable')
    parsed = {}
    for line in stdout.splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            if key in FIELDS and re.fullmatch(r'\d+(?:\.\d+)?', value):
                parsed[key] = float(value) if key.endswith('Seconds') else int(value) if value.isdigit() else None
    report['metrics'] = {key: parsed.get(key) for key in FIELDS}
    stdout = stderr = ''  # Never write upstream streams into any artifact or log.
    http_status = report['metrics']['status']
    trusted_response = (report['exitCode'] == 0 and not report['hostTimedOut']
                        and report['metrics']['verifyResult'] == 0
                        and isinstance(http_status, int) and 100 <= http_status <= 599)
    report['canonicalHttpsResponded'] = trusted_response
    report['healthPrerequisiteRestored'] = bool(trusted_response and 200 <= http_status <= 299)
    report['status'] = 'reachable' if report['healthPrerequisiteRestored'] else 'blocked'
    report['elapsedMs'] = round((time.monotonic() - began) * 1000)
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['adbOwnershipReleased'] = True
    result_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
