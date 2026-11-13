"""Bounded read-only Android DNS/TCP/HTTPS probes for exactly two public hosts.

Never retains raw shell output, DNS addresses, routes, proxy endpoints, Wi-Fi
identifiers, account state, grants, OAuth URLs or response bodies.
"""
from pathlib import Path
import datetime
import ipaddress
import json
import re
import shlex
import subprocess
import time

OUT = Path(__file__).resolve().parent
OUTPUT = Path('/private/tmp/account109-android-real-9263-jwks01')
ADB = '/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL = '98895a3147304c3132'
HOSTS = ['cybernote-sync.vercel.app', 'auth.x.aixgg.com']


def save(report):
    for directory in [OUT, OUTPUT]:
        (directory / 'network-diagnostic.json').write_text(json.dumps(report, indent=2) + '\n')


def capture(command, timeout=12):
    began = time.monotonic()
    try:
        result = subprocess.run([ADB, '-s', SERIAL, 'shell', command], capture_output=True,
                                text=True, timeout=timeout)
        return result.stdout, result.stderr, {'exitCode': result.returncode,
            'elapsedMs': round((time.monotonic() - began) * 1000), 'hostTimedOut': False}
    except subprocess.TimeoutExpired:
        return '', '', {'exitCode': None, 'elapsedMs': round((time.monotonic() - began) * 1000),
                        'hostTimedOut': True}


def address_class(value):
    try:
        addr = ipaddress.ip_address(value.strip('/[] ,'))
    except ValueError:
        return None
    if addr.version == 4 and addr in ipaddress.ip_network('198.18.0.0/15'):
        return 'benchmark-fakeIP-range'
    if addr.is_loopback:
        return 'loopback'
    if addr.is_link_local:
        return 'linkLocal'
    if addr.is_private:
        return 'privateOrReserved'
    if addr.is_global:
        return 'public'
    return 'otherReserved'


def error_kind(text):
    value = text.lower()
    for needles, label in [
        (['permission denied', 'operation not permitted'], 'permissionDenied'),
        (['unknown host', 'bad address', 'could not resolve', 'name or service not known'], 'dnsResolutionFailed'),
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
    inventory = json.loads((OUT / 'network-availability.json').read_text())
    available = inventory['commandAvailable']
    applets = inventory['toyboxAppletAvailable']
    assert available['timeout'] or applets['timeout']
    timer = 'timeout' if available['timeout'] else 'toybox timeout'
    report = {'schema': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'serial': SERIAL, 'readOnly': True, 'allowedHosts': HOSTS, 'maxPerDnsProbeSeconds': 6,
        'maxPerTcpProbeSeconds': 7, 'maxHttpsSeconds': 10,
        'networkSettingsChanged': False, 'vpnChangedOrBypassed': False, 'ipPinningUsed': False,
        'toolsInstalled': False, 'oauthOpened': False, 'accountCommandsCalled': False,
        'rawOutputRetained': False, 'ipAddressesRetained': False,
        'commandAvailability': available, 'toyboxAppletAvailability': applets,
        'deviceNetworkMetadata': {}, 'hosts': {}}
    began = time.monotonic()

    # The phone filters these dumps before the diagnostic receives any data.
    # DNS addresses are immediately reduced to address classes, never archived.
    dns, err, meta = capture("dumpsys connectivity | sed -n 's/.*DnsAddresses: \\[\\([^]]*\\)\\].*/DNS=\\1/p'", 10)
    dns_classes = []
    for line in dns.splitlines():
        if line.startswith('DNS='):
            for token in re.split(r'[\s,]+', line[4:]):
                kind = address_class(token)
                if kind:
                    dns_classes.append(kind)
    report['deviceNetworkMetadata']['dnsServers'] = {
        **meta, 'filteredEntries': len(dns_classes), 'addressClasses': sorted(set(dns_classes)),
        'limitation': 'Filtered LinkProperties entries can include multiple networks, not only the active default.'}
    transports, _, meta = capture("dumpsys connectivity | sed -n 's/.*Transports: \\([^ ]*\\).*/TRANSPORT=\\1/p'", 10)
    transport_types = set()
    for line in transports.splitlines():
        if line.startswith('TRANSPORT='):
            transport_types.update(x for x in re.split(r'[|,]', line[10:])
                                   if x in ['WIFI', 'CELLULAR', 'VPN', 'ETHERNET', 'BLUETOOTH'])
    report['deviceNetworkMetadata']['transportsPresent'] = {**meta, 'types': sorted(transport_types)}
    for version in ['', '-6 ']:
        raw, _, meta = capture("ip " + version + "route show table all | sed -n '/^default /p'", 10)
        rows = [line for line in raw.splitlines() if line.startswith('default ')]
        interface_types = set()
        gateway_classes = set()
        for line in rows:
            interface = re.search(r'\bdev\s+(\S+)', line)
            if interface:
                name = interface.group(1)
                interface_types.add('wifi' if name.startswith('wlan') else 'cellular' if name.startswith(('rmnet', 'ccmni'))
                                    else 'tunnel' if name.startswith(('tun', 'wg', 'ppp')) else 'other')
            gateway = re.search(r'\bvia\s+(\S+)', line)
            if gateway and address_class(gateway.group(1)):
                gateway_classes.add(address_class(gateway.group(1)))
        report['deviceNetworkMetadata']['ipv6DefaultRoutes' if version else 'ipv4DefaultRoutes'] = {
            **meta, 'defaultRouteCount': len(rows), 'interfaceTypes': sorted(interface_types),
            'gatewayAddressClasses': sorted(gateway_classes)}
    raw, _, meta = capture('settings get global http_proxy')
    proxy = raw.strip()
    report['deviceNetworkMetadata']['globalHttpProxy'] = {**meta,
        'configured': proxy not in ['', 'null', ':0', '0', 'null:0'],
        'endpointRetained': False,
        'limitation': 'Global setting only; does not establish per-app/VPN interception or bypass.'}
    raw, _, meta = capture('settings get global private_dns_mode')
    mode = raw.strip()
    report['deviceNetworkMetadata']['privateDnsMode'] = {**meta,
        'mode': mode if mode in ['off', 'opportunistic', 'hostname', 'null'] else 'otherOrUnavailable'}
    raw, _, meta = capture('settings get global private_dns_specifier')
    report['deviceNetworkMetadata']['privateDnsSpecifier'] = {**meta,
        'configured': raw.strip() not in ['', 'null'], 'hostnameRetained': False}

    for host in HOSTS:
        assert host in HOSTS
        entry = {}
        # No nslookup/getent is available on this phone. One bounded ping is
        # used only to expose system-selected DNS resolution; ICMP failure is
        # not treated as DNS/TCP failure. No address or ICMP body is retained.
        if available['ping']:
            stdout, stderr, meta = capture(f'{timer} 6 ping -c 1 -W 1 {shlex.quote(host)}', 9)
            match = re.search(r'^PING\s+[^\n]*?\(([^)]+)\)', stdout, re.M)
            kind = address_class(match.group(1)) if match else None
            entry['dns'] = {**meta, 'method': 'system-ping-name-resolution', 'resolved': kind is not None,
                'selectedAddressClass': kind, 'errorKind': error_kind(stdout + stderr),
                'limitation': 'One system-selected address, not a complete RRset. ICMP status is not a TCP-connectivity verdict.'}
        else:
            entry['dns'] = {'method': None, 'resolved': None, 'limitation': 'No standalone resolver available.'}
        if applets['nc']:
            # EOF immediately after connect, no HTTP/TLS/auth payload and no IP override.
            stdout, stderr, meta = capture(f'{timer} 7 toybox nc -w 5 -q 0 {shlex.quote(host)} 443 </dev/null', 10)
            entry['tcp443'] = {**meta, 'method': 'toybox-nc-canonical-host',
                'connected': meta['exitCode'] == 0 and not meta['hostTimedOut'],
                'errorKind': error_kind(stdout + stderr), 'applicationPayloadSent': False}
        report['hosts'][host] = entry
        save(report)
        print(json.dumps({'phase': 'canonical-host-dns-tcp-probed', 'host': host, **entry}), flush=True)

    if available['curl']:
        # Canonical coordinator health endpoint only; no redirect following,
        # credentials, OAuth, custom DNS/IP, proxy bypass or certificate bypass.
        command = (f'{timer} 12 curl --silent --show-error --output /dev/null '
            '--connect-timeout 5 --max-time 10 --write-out '
            + shlex.quote('status=%{http_code}\ndnsSeconds=%{time_namelookup}\nconnectSeconds=%{time_connect}\ntlsSeconds=%{time_appconnect}\ntotalSeconds=%{time_total}\nverifyResult=%{ssl_verify_result}\n')
            + ' https://cybernote-sync.vercel.app/healthz')
        stdout, stderr, meta = capture(command, 15)
        parsed = dict(line.split('=', 1) for line in stdout.splitlines() if '=' in line)
        health = {**meta, 'host': HOSTS[0], 'path': '/healthz', 'certificateVerificationEnabled': True,
                  'redirectsFollowed': False, 'errorKind': error_kind(stderr), 'responseBodyRetained': False}
        for key in ['status', 'dnsSeconds', 'connectSeconds', 'tlsSeconds', 'totalSeconds', 'verifyResult']:
            value = parsed.get(key, '')
            health[key] = float(value) if re.fullmatch(r'\d+(?:\.\d+)?', value) and 'Seconds' in key else int(value) if value.isdigit() else None
        report['coordinatorHttpsHealth'] = health
    fake_hosts = [host for host in HOSTS if report['hosts'][host]['dns'].get('selectedAddressClass') == 'benchmark-fakeIP-range']
    report['diagnosis'] = {
        'fakeIpRangeObservedForCanonicalHosts': fake_hosts,
        'tcp443Connected': {host: report['hosts'][host].get('tcp443', {}).get('connected') for host in HOSTS},
        'coordinatorHttpsSucceeded': report.get('coordinatorHttpsHealth', {}).get('exitCode') == 0,
        'limitation': 'Phone shell path only. Fake-IP range is an observation, not proof of causality. App runtime, VPN routing and trust behavior may differ. No account retry or upstream provider response is inspected.'}
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['totalElapsedMs'] = round((time.monotonic() - began) * 1000)
    report['adbOwnershipReturned'] = True
    save(report)
    print(json.dumps({'phase': 'readonly-network-diagnostic-complete', 'diagnosis': report['diagnosis'],
                      'coordinatorHttpsHealth': report.get('coordinatorHttpsHealth'),
                      'deviceNetworkMetadata': report['deviceNetworkMetadata'],
                      'totalElapsedMs': report['totalElapsedMs'], 'adbOwnershipReturned': True}))


if __name__ == '__main__':
    main()
