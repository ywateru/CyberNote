"""One canonical curl verbose route-class sample; raw streams never archived."""
from pathlib import Path
import datetime, hashlib, ipaddress, json, re, subprocess, time

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[4]
ADB='/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL='98895a3147304c3132'
HOST='cybernote-sync.vercel.app'
ENDPOINT='https://'+HOST+'/healthz'
COMMAND=('timeout 12 curl --verbose --silent --show-error --output /dev/null '
         '--connect-timeout 5 --max-time 10 '+ENDPOINT)
ERRNO_LABELS={110:'ETIMEDOUT',111:'ECONNREFUSED',101:'ENETUNREACH',113:'EHOSTUNREACH',13:'EACCES',1:'EPERM',100:'ENETDOWN',99:'EADDRNOTAVAIL',104:'ECONNRESET',103:'ECONNABORTED'}
ERRNO_TEXT=[('connection timed out','ETIMEDOUT'),('connection refused','ECONNREFUSED'),('network is unreachable','ENETUNREACH'),('no route to host','EHOSTUNREACH'),('permission denied','EACCES'),('operation not permitted','EPERM'),('network is down','ENETDOWN'),('cannot assign requested address','EADDRNOTAVAIL'),('connection reset','ECONNRESET'),('connection aborted','ECONNABORTED')]

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(name,data): (OUT/name).write_text(json.dumps(data,indent=2)+'\n')
def capture(args,timeout):
    tick=time.monotonic()
    try:
        p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
        return p.stdout,p.stderr,{'exitCode':p.returncode,'timedOut':False,'elapsedMs':round((time.monotonic()-tick)*1000)}
    except subprocess.TimeoutExpired:
        return '', '', {'exitCode':None,'timedOut':True,'elapsedMs':round((time.monotonic()-tick)*1000)}
    except OSError:
        return '', '', {'exitCode':None,'timedOut':False,'commandUnavailable':True,'elapsedMs':round((time.monotonic()-tick)*1000)}

def address_class(value):
    try: addr=ipaddress.ip_address(value.strip(' [](),').split('%',1)[0])
    except ValueError: return None
    if addr.version==4 and addr in ipaddress.ip_network('198.18.0.0/15'): label='benchmark-reserved'
    elif addr.version==6 and addr in ipaddress.ip_network('2001:2::/48'): label='benchmark-reserved'
    elif addr.is_loopback: label='loopback'
    elif addr.is_link_local: label='link-local'
    elif addr.is_multicast: label='multicast'
    elif addr.is_unspecified: label='unspecified'
    elif addr.version==4 and addr in ipaddress.ip_network('100.64.0.0/10'): label='shared-address-space'
    elif (addr.version==4 and any(addr in ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))) or (addr.version==6 and addr in ipaddress.ip_network('fc00::/7')): label='private'
    elif addr.is_global: label='public'
    else: label='other-reserved'
    return {'family':'IPv'+str(addr.version),'addressClass':label}

def address_port(value):
    value=value.strip().rstrip('.')
    if value.startswith('['): return address_class(value.split(']',1)[0][1:])
    m=re.match(r'((?:\d{1,3}\.){3}\d{1,3})(?::\d+)?',value)
    if m: return address_class(m.group(1))
    return address_class(value)

def summarize(verbose):
    resolutions=[];attempts=[];connect_errors=[];current=None
    for line in verbose.splitlines():
        # Capture only class projections; no raw line or address survives.
        m=re.match(r'^\*\s+IPv[46]:\s*(.*)$',line)
        if m:
            for value in m.group(1).split(','):
                item=address_class(value)
                if item: resolutions.append(item)
        m=re.search(r'\bTrying\s+(\[[^\]]+\](?::\d+)?|[^\s]+)',line)
        if m:
            current=address_port(m.group(1))
            if current: attempts.append(current)
        if re.search(r'\bconnect to\b|\bImmediate connect fail\b|\bconnect\([^)]*\)\s+failed',line,re.I):
            lower=line.lower(); labels=sorted(set(label for text,label in ERRNO_TEXT if text in lower))
            numeric=[int(v) for v in re.findall(r'\berrno\s*[=:]?\s*(\d{1,3})\b',line,re.I)]
            labels=sorted(set(labels+[ERRNO_LABELS[v] for v in numeric if v in ERRNO_LABELS]))
            if 'failed' in lower or 'fail ' in lower:
                item={'errnoLabels':labels or ['unclassified-connect-error'],'source':'curl-verbose-connect-error-text','explicitErrnoNumbers':[v for v in numeric if v in ERRNO_LABELS]}
                if current: item['attemptAddressClass']=current
                connect_errors.append(item)
    unique=lambda rows: [json.loads(v) for v in sorted(set(json.dumps(x,sort_keys=True) for x in rows))]
    return {'resolvedAddressClasses':unique(resolutions),'attemptedAddressClasses':unique(attempts),
            'resolvedAddressObservationCount':len(resolutions),'attemptAddressObservationCount':len(attempts),
            'connectErrors':connect_errors[:32],
            'canonicalHostResolutionMarkerObserved':bool(re.search(r'Host\s+'+re.escape(HOST)+r'(?::443)?\s+was resolved',verbose)),
            'proxyEnvironmentNoticeObserved':'uses proxy env variable' in verbose.lower(),
            'proxyTunnelMarkerObserved':'establish http proxy tunnel' in verbose.lower(),
            'tlsCertificateFailureTextObserved':bool(re.search(r'certificate.*(?:failed|expired|invalid)|ssl peer certificate',verbose,re.I)),
            'note':'Errno labels map finite OS error text, not syscall tracing; explicitErrnoNumbers remain empty unless verbose explicitly prints errno.'}

def prior_hashes():
    return {str(p.relative_to(OUT.parent)):digest(p) for folder in ('current-access02','goal-network-recheck01') for p in sorted((OUT.parent/folder).iterdir()) if p.is_file()}

def main():
    with (OUT/'result.json').open('x') as f: f.write('{}\n')
    report={'schema':1,'kind':'single-android-canonical-connect-address-class-diagnostic','startedAt':now(),
            'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),
            'serial':SERIAL,'endpoint':ENDPOINT,'method':'GET','attemptCount':1,'hostControlRequests':0,'retries':0,
            'purpose':'Classify resolved/attempted connection addresses and finite connect errno labels; not another reachability acceptance test.',
            'freshEvidenceReview':{'files':['current-access02/phone-health.json','current-access02/result.json','goal-network-recheck01/result.json'],'hasResolvedOrAttemptedAddressClasses':False,'hasSpecificConnectErrno':False,'rawStreamsPreviouslyRetained':False,'reusableVerboseEvidenceAvailable':False},
            'scriptSha256':digest(Path(__file__)),'adbSha256':digest(Path(ADB)),
            'certificateVerificationEnabled':True,'redirectsFollowed':False,'connectTimeoutSeconds':5,'curlTotalTimeoutSeconds':10,'deviceGuardSeconds':12,'hostGuardSeconds':15,
            'rawStdoutRetained':False,'rawStderrRetained':False,'ipAddressesRetained':False,'responseBodyRetained':False,
            'credentialsSupplied':False,'loginCalled':False,'userStoreRead':False,'systemNetworkSettingsChanged':False,
            'dnsOrIpOverridesUsed':False,'proxyEnvironmentChanged':False,'vpnChangedOrBypassed':False,'separateDnsOrTcpProbesPerformed':False}
    before=prior_hashes()
    stdout,stderr,meta=capture([ADB,'-s',SERIAL,'shell','id -u'],8)
    uid=int(stdout.strip()) if meta['exitCode']==0 and re.fullmatch(r'\d{1,5}',stdout.strip()) else None
    report['executionIdentity']={**meta,'uid':uid,'isAndroidShellUid':uid==2000,'limitation':'ADB shell UID networking only; app UID may have different routing, VPN/proxy/firewall or DNS policy. No app request or app UID test was performed.'}
    stdout=stderr=''
    report['requestStartedAt']=now()
    stdout,stderr,meta=capture([ADB,'-s',SERIAL,'shell',COMMAND],15)
    report['commandResult']=meta
    report['routeClassEvidence']=summarize(stderr)
    stdout=stderr=''
    report['requestFinishedAt']=now()
    classes=report['routeClassEvidence']['resolvedAddressClasses']+report['routeClassEvidence']['attemptedAddressClasses']
    report['benchmarkReservedAddressObserved']=any(x['addressClass']=='benchmark-reserved' for x in classes)
    report['priorEvidenceHashes']=before;report['priorEvidenceUnchanged']=before==prior_hashes()
    report['underlyingCauseProven']=False
    report['limitations']=['One canonical curl sample under shell UID only. No IP addresses/raw verbose retained.','Classification does not identify the resolver, interception source, routing mechanism, address ownership or root cause.','No new/proposed hostname was queried; no claim about its DNS existence. No SDK peer/tunnel or login validation.']
    report['adbOwnershipReleased']=True;report['finishedAt']=now()
    save('result.json',report)
    print(json.dumps({'phase':'complete','exitCode':meta['exitCode'],'benchmarkReservedAddressObserved':report['benchmarkReservedAddressObserved'],'resolvedAddressClasses':report['routeClassEvidence']['resolvedAddressClasses'],'attemptedAddressClasses':report['routeClassEvidence']['attemptedAddressClasses'],'connectErrors':report['routeClassEvidence']['connectErrors'],'shellUid':uid,'priorEvidenceUnchanged':report['priorEvidenceUnchanged'],'adbOwnershipReleased':True}),flush=True)

if __name__=='__main__': main()
