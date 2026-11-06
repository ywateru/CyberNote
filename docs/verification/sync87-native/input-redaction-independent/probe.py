from pathlib import Path
import subprocess,json,time,os,hashlib
root=Path('/private/tmp/apple-notes-sync87-ui-native-review');out=Path('/private/tmp/notes-sync87-native-redaction-independent-01');runner=root/'scripts/debug/sync87-native/run.mjs'
node=subprocess.check_output(['which','node'],text=True).strip(); env={**os.environ,'PATH':'/nonexistent-sync87-no-python-no-adb'}
fixtures='/private/tmp/notes-sync87-native-redaction-independent-fixtures-01';prep=subprocess.run([node,str(runner),'--mode','prepare','--output',fixtures],env=env,capture_output=True,timeout=5)
(out/'prepare.stdout.log').write_bytes(prep.stdout);(out/'prepare.stderr.log').write_bytes(prep.stderr);assert prep.returncode==0
argv=[node,str(runner),'--mode','serve','--output',fixtures,'--receipt','/private/tmp/nonexistent-independent-review-receipt.json']
secret='Z7X9K2';cases=[
 ('original-short',secret.encode()+b'\n','INVALID_JSON'),
 ('original-prefix',(secret+'-invitation-prefix-more-text\n').encode(),'INVALID_JSON'),
 ('truncated',('{"action":"pair","invitation":"'+secret).encode(),'INVALID_JSON'),
 ('truncated-escape',('{"action":"pair","invitation":"'+secret+'\\').encode(),'INVALID_JSON'),
 ('oversize-ascii',b'A'*32769+b'\n','INPUT_TOO_LARGE'),
 ('oversize-utf8',('字'*10923+'\n').encode(),'INPUT_TOO_LARGE'),
 ('invalid-utf8',b'{"action":"pair","invitation":"\xff'+secret.encode()+b'"}\n','INVALID_JSON'),
 ('schema-requestid',json.dumps(dict(action='close',requestId=secret+' bad')).encode()+b'\n','INVALID_REQUEST'),
 ('schema-action',json.dumps(dict(action=secret)).encode()+b'\n','INVALID_REQUEST'),
 ('schema-secretkey',json.dumps(dict(action='close',**{secret:'hidden'})).encode()+b'\n','INVALID_REQUEST'),
 ('schema-null',b'null\n','INVALID_REQUEST'),
 ('schema-array',b'[]\n','INVALID_REQUEST'),
 ('schema-invitationtype',json.dumps(dict(action='pair',invitation={secret:True})).encode()+b'\n','INVALID_REQUEST'),
 ('schema-other-invitation',json.dumps(dict(action='close',invitation=secret)).encode()+b'\n','INVALID_REQUEST'),
 ('failure-no-next-dispatch',secret.encode()+b'\n{"action":"background"}\n','INVALID_JSON'),
 ('schema-no-next-dispatch',b'{"action":"close","extra":"'+secret.encode()+b'"}\n{"action":"background"}\n','INVALID_REQUEST'),
]
results=[]
for name,data,expected in cases:
 t=time.monotonic();p=subprocess.run(argv,env=env,input=data,capture_output=True,timeout=5)
 (out/(name+'.stdout.log')).write_bytes(p.stdout);(out/(name+'.stderr.log')).write_bytes(p.stderr)
 rows=p.stdout.decode().strip().splitlines();assert p.returncode==2 and len(rows)==1 and p.stderr==b'',name
 response=json.loads(rows[0]);assert response['error']==expected and response['ok']==False,name
 assert secret not in p.stdout.decode() and 'requestId' not in response and 'action' not in response and 'stack' not in response,name
 results.append(dict(name=name,bytes=len(data),inputSha256=hashlib.sha256(data).hexdigest(),expected=expected,exitCode=p.returncode,wallSeconds=time.monotonic()-t,stdoutLines=len(rows),secretAbsent=True))
# Leave stdin open: rejection must terminate without waiting for newline/EOF.
p=subprocess.Popen(argv,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE);t=time.monotonic();p.stdin.write(b'B'*32769);p.stdin.flush();code=p.wait(timeout=3);stdout=p.stdout.read();stderr=p.stderr.read();p.stdin.close()
(out/'oversize-open-stream.stdout.log').write_bytes(stdout);(out/'oversize-open-stream.stderr.log').write_bytes(stderr);assert code==2 and json.loads(stdout)['error']=='INPUT_TOO_LARGE' and stderr==b''
results.append(dict(name='oversize-open-stream',exitCode=code,wallSeconds=time.monotonic()-t,terminatedWithoutNewlineOrEOF=True))
# Boundary is bytes: exactly32768 valid bytes remains a harmless close action.
valid=b'{"action":"close","requestId":"safe_close"}';data=valid+b' '*(32768-len(valid))+b'\n';t=time.monotonic();p=subprocess.run(argv,env=env,input=data,capture_output=True,timeout=5)
(out/'exact-byte-limit.stdout.log').write_bytes(p.stdout);(out/'exact-byte-limit.stderr.log').write_bytes(p.stderr);assert p.returncode==0 and json.loads(p.stdout)['result']=={'closed':True} and p.stderr==b''
results.append(dict(name='exact-byte-limit',requestBytes=32768,exitCode=p.returncode,wallSeconds=time.monotonic()-t))
(out/'independent-cases.json').write_text(json.dumps(dict(passed=len(results),cases=results,scope='host-only; child PATH excludes Python and ADB; no valid receipt or device operation'),indent=2)+'\n');print(json.dumps(dict(passed=len(results),scope='host-only input boundaries, no ADB')))
