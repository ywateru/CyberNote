import sys,pathlib,hashlib,subprocess,time,json,shutil
root,out=map(pathlib.Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=False)
source=pathlib.Path(__file__).parent/'IndependentPolicy.kt'
files=[root/'plugins/tauri-plugin-notes-scan/android/src/main/java/com/local/notesscan'/n for n in ['DocumentUris.kt','DocumentStreams.kt']]+[source]
inputs={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
cache=pathlib.Path('/Users/water/.gradle/caches/modules-2/files-2.1')
def jar(group,name,version):
 return next((cache/group/name/version).glob('*/*.jar'))
cp=[jar('org.jetbrains.kotlin',name,'2.1.0') for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-reflect']]
cp+=[jar('org.jetbrains.intellij.deps','trove4j','1.0.20200330')]
for group,name in [('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),('org.jetbrains','annotations')]:
 matches=list((cache/group/name).glob('*/*/*.jar'));cp.append(matches[0])
java='/opt/zerobrew/opt/openjdk@17/bin/java'
for p in files:shutil.copy2(p,out/p.name)
args=[java,'-cp',':'.join(map(str,cp)),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',':'.join(map(str,cp[1:])),'-d',str(out/'probe.jar')]+[str(out/p.name) for p in files]
started=time.monotonic();runs=[]
for name,argv in [('compile',args),('run',[java,'-cp',str(out/'probe.jar')+':'+str(cp[1]),'com.local.notesscan.IndependentPolicyKt'])]:
 t=time.monotonic();r=subprocess.run(argv,capture_output=True);(out/(name+'.stdout.txt')).write_bytes(r.stdout);(out/(name+'.stderr.txt')).write_bytes(r.stderr);runs.append({'name':name,'argv':argv,'exit':r.returncode,'wallMs':(time.monotonic()-t)*1000});
 if r.returncode:break
result={'status':'PASS' if len(runs)==2 and all(r['exit']==0 for r in runs) else 'FAIL','inputs':inputs,'inputsUnchanged':all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in inputs.items()),'runs':runs,'completeWallMs':(time.monotonic()-started)*1000,'scope':'actual DocumentUris/DocumentStreams pure JVM source policy; Android Uri decoding/provider/ContentResolver OS runtime not claimed'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));sys.exit(0 if result['status']=='PASS' else 1)
