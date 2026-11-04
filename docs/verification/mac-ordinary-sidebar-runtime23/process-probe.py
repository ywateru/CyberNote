import datetime,hashlib,json,pathlib,subprocess,sys
exe=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);r=subprocess.run(['ps','-axo','pid=,comm='],capture_output=True,text=True)
rows=[]
for line in r.stdout.splitlines():
 parts=line.strip().split(None,1)
 if len(parts)==2 and parts[1]==str(exe):rows.append({'pid':int(parts[0]),'executable':parts[1]})
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executable':str(exe),'exists':exe.is_file(),'sha256':hashlib.sha256(exe.read_bytes()).hexdigest() if exe.is_file() else None,'psExit':r.returncode,'matchingRows':rows,'stderr':r.stderr}
with out.open('x') as f:json.dump(record,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(record,ensure_ascii=False,indent=2))
