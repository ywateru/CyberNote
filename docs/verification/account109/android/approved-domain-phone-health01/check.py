"""Exactly one authorized phone health GET after finite device/CELLULAR/tool checks."""
from pathlib import Path
import datetime,hashlib,json,re,shlex,subprocess,time
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[4]
ADB='/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL='98895a3147304c3132'
ENDPOINT='https://cybernote-sync.aixgg.com/healthz'
FORMAT=('\n__ACCOUNT109_METRICS__\nhttp=%{http_code}\n'
        'dnsSeconds=%{time_namelookup}\nconnectSeconds=%{time_connect}\n'
        'tlsSeconds=%{time_appconnect}\ntotalSeconds=%{time_total}\n'
        'verifyResult=%{ssl_verify_result}\n')
ARGS=['curl','--disable','--silent','--show-error','--request','GET',
      '--proto','=https','--max-redirs','0','--retry','0',
      '--connect-timeout','5','--max-time','10','--max-filesize','4096',
      '--write-out',FORMAT,ENDPOINT]
PHONE_COMMAND='timeout 12 '+shlex.join(ARGS)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(data):return hashlib.sha256(data).hexdigest()
def save(data):(OUT/'result.json').write_text(json.dumps(data,indent=2)+'\n')
def capture(command,limit):
 start=time.monotonic()
 try:
  p=subprocess.run(command,capture_output=True,timeout=limit)
  return p.stdout,p.stderr,{'exitCode':p.returncode,'timedOut':False,'elapsedMs':round((time.monotonic()-start)*1000)}
 except subprocess.TimeoutExpired:
  return b'',b'',{'exitCode':None,'timedOut':True,'elapsedMs':round((time.monotonic()-start)*1000)}
 except OSError:
  return b'',b'',{'exitCode':None,'timedOut':False,'commandUnavailable':True,'elapsedMs':round((time.monotonic()-start)*1000)}
def adb(command,limit):return capture([ADB,'-s',SERIAL,'shell',command],limit)
def prior_hashes():
 base=OUT.parent
 dirs=['current-access02','coordinator-route-class01','login-surfaces-preflight01','source5d30-baseline01']
 return {str(p.relative_to(base)):sha(p.read_bytes()) for d in dirs for p in sorted((base/d).rglob('*')) if p.is_file()}
def finish(report,before):
 report['priorEvidenceSha256']=before
 report['priorEvidenceUnchanged']=before==prior_hashes()
 report['finishedAt']=now();report['adbOwnershipReleased']=True
 save(report)
 print(json.dumps({'status':report['status'],'defaultTransportLabels':report.get('defaultNetwork',{}).get('transportLabels'),
 'attemptCount':report.get('phone',{}).get('attemptCount',0),'phone':report.get('phone'),'priorEvidenceUnchanged':report['priorEvidenceUnchanged']}),flush=True)
def main():
 with (OUT/'result.json').open('x') as f:f.write('{}\n')
 before=prior_hashes()
 report={'schema':1,'kind':'single-phone-approved-domain-anonymous-health','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
 'startedAt':now(),'status':'preflight','scriptSha256':sha(Path(__file__).read_bytes()),'readOnly':True,
 'boundary':{'appOpened':False,'installed':False,'adbDeviceDataOrSettingsChanged':False,'credentialsSupplied':False,'toolsInstalledOrCopied':False,'oldEndpointProbed':False,'hostControlRequested':False,'dnsOrRouteOrProxyOverrides':False,'rawTopologyRetained':False,'rawResponseRetained':False,'rawStderrRetained':False}}
 stdout,stderr,meta=capture([ADB,'-s',SERIAL,'get-state'],8)
 authorized=meta['exitCode']==0 and stdout.strip()==b'device'
 report['device']={**meta,'state':'authorized' if authorized else 'unavailable'}
 stdout=stderr=b''
 if not authorized:
  report['status']='stopped-device-unavailable';finish(report,before);return
 stdout,stderr,meta=adb((OUT/'network-command.txt').read_text(),10)
 text=stdout.decode(errors='replace')
 labels=sorted(set(re.findall(r'^defaultTransport=(WIFI|CELLULAR|VPN|ETHERNET|BLUETOOTH|USB|LOWPAN|WIFI_AWARE)$',text,re.M)))
 report['defaultNetwork']={**meta,'defaultPresent':True if 'defaultPresent=true' in text.splitlines() else None,'transportLabels':labels,'limitation':'Active-default Android system metadata only; not app UID routing or peer transport.'}
 stdout=stderr=b'';text=''
 if meta['exitCode']!=0 or labels!=['CELLULAR']:
  report['status']='stopped-cellular-not-confirmed';finish(report,before);return
 stdout,stderr,meta=adb('command -v curl && command -v timeout && curl --disable --version',8)
 text=stdout.decode(errors='replace')
 found=meta['exitCode']==0 and bool(re.search(r'^curl \d',text,re.M)) and bool(re.search(r'^Protocols:.*\bhttps\b',text,re.M))
 version=re.search(r'^curl (\d+\.\d+\.\d+)',text,re.M)
 report['toolPreflight']={**meta,'existingCurlAndTimeoutAvailable':found,'httpsProtocolAvailable':found,'curlVersion':version.group(1) if version else None}
 stdout=stderr=b'';text=''
 if not found:
  report['status']='stopped-tools-unavailable';finish(report,before);return
 print(json.dumps({'phase':'preflight-pass','defaultTransportLabels':labels,'existingCurlHttps':True,'next':'one-health-get-only'}),flush=True)
 started=now();stdout,stderr,meta=adb(PHONE_COMMAND,15)
 body,sep,metrics=stdout.rpartition(b'\n__ACCOUNT109_METRICS__\n')
 values={}
 if sep:
  for line in metrics.decode(errors='replace').splitlines():
   if '=' not in line:continue
   key,value=line.split('=',1)
   if key in ['http','verifyResult'] and re.fullmatch(r'\d+',value):values[key]=int(value)
   elif key in ['dnsSeconds','connectSeconds','tlsSeconds','totalSeconds'] and re.fullmatch(r'\d+(?:\.\d+)?',value):values[key]=float(value)
 exitcode=meta['exitCode'];http=values.get('http')
 categories={5:'proxyDns',6:'dns',7:'connect',28:'timeout',35:'tlsHandshake',51:'tlsCertificateOrHostname',58:'tlsClientCertificate',60:'tlsCertificateOrHostname',63:'bodyTooLarge',77:'tlsTrustStore',124:'deviceGuardTimeout',127:'commandUnavailable'}
 category='hostGuardTimeout' if meta['timedOut'] else categories.get(exitcode,'otherFailure')
 if exitcode==0:category='httpsOk' if http==200 else 'httpRedirect' if isinstance(http,int) and 300<=http<400 else 'httpOther'
 verified=exitcode==0 and values.get('verifyResult')==0 and values.get('tlsSeconds',0)>0 and isinstance(http,int) and http>=100
 matches=bool(sep and body==b'ok\n')
 phone={'attemptCount':1,'method':'GET','endpoint':ENDPOINT,'startedAt':started,'finishedAt':now(),**meta,'networkCategory':category,'metrics':values,
 'responseSummary':{'bytes':len(body) if sep else None,'sha256':sha(body) if sep else None,'matchesExpectedOkLine':matches,'bodyRetained':False},
 'tls':{'peerCertificateVerificationEnabled':True,'hostnameVerificationEnabled':True,'curlConfigDisabled':True,'insecureFlagUsed':False,'completedVerifiedHandshake':verified},
 'connectTimeoutSeconds':5,'totalTimeoutSeconds':10,'deviceGuardSeconds':12,'hostGuardSeconds':15,'retries':0,'redirectsFollowed':False,'authenticationHeadersSupplied':False,'proxyOrEnvironmentChanged':False,
 'passed':bool(verified and http==200 and matches)}
 report['phone']=phone
 stdout=stderr=body=metrics=b''
 report['status']='passed-anonymous-shell-health-only' if phone['passed'] else 'failed-anonymous-shell-health'
 finish(report,before)
if __name__=='__main__':main()
