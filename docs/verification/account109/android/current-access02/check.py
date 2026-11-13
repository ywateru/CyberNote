"""One authorized phone canonical health GET + one host control; safe labels only."""
from pathlib import Path
import datetime, hashlib, json, re, shlex, subprocess, time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
ADB = '/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL = '98895a3147304c3132'
ENDPOINT = 'https://cybernote-sync.vercel.app/healthz'
FIELDS = ('status', 'dnsSeconds', 'connectSeconds', 'tlsSeconds', 'totalSeconds', 'verifyResult')
FORMAT = ('status=%{http_code}\ndnsSeconds=%{time_namelookup}\n'
          'connectSeconds=%{time_connect}\ntlsSeconds=%{time_appconnect}\n'
          'totalSeconds=%{time_total}\nverifyResult=%{ssl_verify_result}\n')
PHONE_COMMAND = ('timeout 12 curl --silent --show-error --output /dev/null '
                 '--connect-timeout 5 --max-time 10 --write-out '
                 + shlex.quote(FORMAT) + ' ' + ENDPOINT)
# Filter on device: retain no network IDs, addresses, SSIDs, routes or dump text.
NETWORK_COMMAND = r'''dumpsys connectivity | awk '
/Active default network:/ {
  v=$0; sub(/.*Active default network:[ ]*/, "", v);
  if (v ~ /[0-9]/) { gsub(/[^0-9]/, "", v); active=v }
}
/NetworkAgentInfo/ { rows[++n]=$0 }
END {
  if (active == "") { print "defaultPresent=unknown"; exit }
  print "defaultPresent=true";
  for (i=1; i<=n; i++) {
    if (rows[i] ~ ("network\\{[ ]*" active "[ ]*\\}")) {
      v=rows[i];
      if (v !~ /Transports:/) continue;
      sub(/.*Transports:[ ]*/, "", v); sub(/[ ]*Capabilities:.*/, "", v);
      count=split("WIFI CELLULAR VPN ETHERNET BLUETOOTH USB LOWPAN WIFI_AWARE", labels, " ");
      for (j=1; j<=count; j++)
        if (v ~ ("(^|[^A-Z_])" labels[j] "([^A-Z_]|$)")) print "defaultTransport=" labels[j];
    }
  }
}' '''

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(name, data): (OUT/name).write_text(json.dumps(data, indent=2) + '\n')
def capture(args, timeout):
    start = time.monotonic()
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return p.stdout, p.stderr, {'exitCode':p.returncode, 'timedOut':False, 'elapsedMs':round((time.monotonic()-start)*1000)}
    except subprocess.TimeoutExpired:
        return '', '', {'exitCode':None, 'timedOut':True, 'elapsedMs':round((time.monotonic()-start)*1000)}
    except OSError:
        return '', '', {'exitCode':None, 'timedOut':False, 'commandUnavailable':True, 'elapsedMs':round((time.monotonic()-start)*1000)}

def error_kind(text):
    value=text.lower()
    for needles, label in [
        (['permission denied','operation not permitted'],'permissionDenied'),
        (['could not resolve','unknown host','bad address'],'dnsResolutionFailed'),
        (['timed out','timeout'],'timeout'),
        (['network is unreachable','no route to host'],'routeUnavailable'),
        (['connection refused'],'connectionRefused'),
        (['certificate','ssl peer','ca cert'],'tlsCertificateOrTrust'),
        (['not found','unknown command'],'commandUnavailable')]:
        if any(n in value for n in needles): return label
    return 'otherOrNone'

def health(args, guard, kind):
    started=now()
    stdout,stderr,meta=capture(args,guard)
    parsed={}
    for line in stdout.splitlines():
        if '=' not in line: continue
        key,value=line.split('=',1)
        if key in FIELDS and re.fullmatch(r'\d+(?:\.\d+)?',value):
            parsed[key]=float(value) if key.endswith('Seconds') else int(value) if value.isdigit() else None
    report={'kind':kind,'startedAt':started,'finishedAt':now(),**meta,
            'attemptCount':1,'method':'GET','endpoint':ENDPOINT,
            'errorKind':'hostCommandTimeout' if meta['timedOut'] else error_kind(stderr),
            'metrics':{k:parsed.get(k) for k in FIELDS},
            'connectTimeoutSeconds':5,'curlTotalTimeoutSeconds':10,'commandGuardSeconds':guard,
            'certificateVerificationEnabled':True,'redirectsFollowed':False,
            'credentialsSupplied':False,'responseBodyRetained':False,
            'rawStdoutRetained':False,'rawStderrRetained':False,
            'dnsOrIpOverridesUsed':False,'proxyOrEnvironmentChanged':False}
    stdout=stderr=''
    status=report['metrics']['status']
    responded=meta['exitCode']==0 and not meta['timedOut'] and report['metrics']['verifyResult']==0 and isinstance(status,int) and 100<=status<=599
    report['canonicalHttpsResponded']=responded
    report['healthEndpointSucceeded']=bool(responded and 200<=status<=299)
    report['status']='reachable' if report['healthEndpointSucceeded'] else 'blocked'
    return report

def prior_hashes():
    prior=OUT.parent/'goal-network-recheck01'
    return {p.name:digest(p) for p in sorted(prior.iterdir()) if p.is_file()}

def main():
    with (OUT/'result.json').open('x') as f: f.write('{}\n')
    before=prior_hashes()
    report={'schema':1,'kind':'current-phone-and-host-access-check','startedAt':now(),
            'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),
            'serial':SERIAL,'scriptSha256':digest(Path(__file__)),
            'toolSha256':{'adb':digest(Path(ADB)),'hostCurl':digest(Path('/usr/bin/curl'))},
            'readOnly':True,'networkOrVpnSettingsChanged':False,'ipPinningUsed':False,
            'toolsInstalledOrCopied':False,'accountAuthorizationCopied':False,
            'appStoreOrUiAccessed':False,'loginCommandsCalled':False,'userDataScanned':False,
            'separateDnsOrTcpProbesPerformed':False,'retries':0,
            'parentDesktopAccessObservation':{'source':'parent report; not independently repeated here','currentNativeChromeAxSucceeded':True,'currentlyLocked':False,'historicalFailureCauseInferred':False}}
    stdout,stderr,meta=capture([ADB,'-s',SERIAL,'get-state'],8)
    report['deviceAuthorization']={**meta,'state':'authorized' if meta['exitCode']==0 and stdout.strip()=='device' else 'unauthorized' if 'unauthorized' in (stdout+stderr).lower() else 'offline' if 'offline' in (stdout+stderr).lower() else 'unavailable'}
    stdout=stderr=''
    save('device-state.json',report['deviceAuthorization'])
    if report['deviceAuthorization']['state']=='authorized':
        stdout,stderr,meta=capture([ADB,'-s',SERIAL,'shell',NETWORK_COMMAND],10)
        labels=sorted(set(re.findall(r'^defaultTransport=(WIFI|CELLULAR|VPN|ETHERNET|BLUETOOTH|USB|LOWPAN|WIFI_AWARE)$',stdout,re.M)))
        report['defaultNetwork']={**meta,'defaultPresent':True if 'defaultPresent=true' in stdout.splitlines() else None,'transportLabels':labels,'classification':'observed' if labels else 'unknown','limitation':'Android active-default network metadata only; not app routing, NAT traversal or selected SDK peer transport.'}
        stdout=stderr=''
        save('default-network.json',report['defaultNetwork'])
        phone=health([ADB,'-s',SERIAL,'shell',PHONE_COMMAND],15,'single-phone-canonical-public-health')
        save('phone-health.json',phone)
        report['phone']=phone
        print(json.dumps({'phase':'phone-single-check-complete','deviceState':report['deviceAuthorization']['state'],'defaultNetworkLabels':labels,'phoneStatus':phone['status'],'exitCode':phone['exitCode'],'httpStatus':phone['metrics']['status']}),flush=True)
    else:
        report['phone']={'status':'not-run','attemptCount':0,'reason':'deviceNotAuthorizedOrAvailable'}
        print(json.dumps({'phase':'phone-check-skipped','deviceState':report['deviceAuthorization']['state']}),flush=True)
    host=health(['/usr/bin/curl','--silent','--show-error','--output','/dev/null','--connect-timeout','5','--max-time','10','--write-out',FORMAT,ENDPOINT],12,'single-host-canonical-public-health-control')
    save('host-control.json',host)
    report['host']=host
    report['priorEvidenceHashes']=before
    report['priorEvidenceUnchanged']=before==prior_hashes()
    report['phoneReadyForNextRealLoginPreparation']=report['phone'].get('healthEndpointSucceeded',False)
    report['limitation']='Finite shell public-health samples only; not app/login/JWKS acceptance or proof of peer/tunnel readiness. TLS verifyResult=0 without a completed handshake is not certificate success.'
    report['adbOwnershipReleased']=True
    report['finishedAt']=now()
    save('result.json',report)
    print(json.dumps({'phase':'complete','phoneStatus':report['phone']['status'],'hostStatus':host['status'],'hostHttpStatus':host['metrics']['status'],'priorEvidenceUnchanged':report['priorEvidenceUnchanged'],'adbOwnershipReleased':True}),flush=True)

if __name__=='__main__': main()
