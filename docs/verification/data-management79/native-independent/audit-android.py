from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,subprocess,zipfile,struct,time,os,re

ROOT=Path.cwd(); OUT=Path(__file__).resolve().parent
MANIFEST=ROOT/'docs/verification/data-management79/android-build/result.json'
EXTRACT=ROOT/'artifacts/data-management79/verification-extract/android'
started=time.monotonic();sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
x=load(MANIFEST);apk=Path(x['apk']['path']);commands=[]
def run(label,argv):
 start=time.monotonic();env=os.environ.copy();env['JAVA_HOME']='/opt/zerobrew/opt/openjdk@17'
 p=subprocess.run(argv,capture_output=True,env=env)
 (OUT/(label+'.stdout.txt')).write_bytes(p.stdout);(OUT/(label+'.stderr.txt')).write_bytes(p.stderr)
 row={'label':label,'argv':argv,'exit':p.returncode,'wallMs':round((time.monotonic()-start)*1000,2),'stdoutSha256':sha(p.stdout),'stderrSha256':sha(p.stderr)};commands.append(row);assert p.returncode==0,row;return p.stdout.decode()
def ident(p):
 b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':sha(b)}
assert x['inputUnchanged'] and x['inputBefore']==x['inputAfter']
assert len(x['inputBefore'])==len({r['path'] for r in x['inputBefore']})
for row in x['inputBefore']:
 b=(ROOT/row['path']).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'];assert subprocess.check_output(['git','show',x['head']+':'+row['path']])==b,row['path']
assert ident(apk)==x['apk'];sdk=Path('/Users/water/Library/Android/sdk/build-tools/36.0.0')
signature=run('android-signature',[str(sdk/'apksigner'),'verify','--verbose','--print-certs',str(apk)])
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signature
badging=run('android-badging',[str(sdk/'aapt2'),'dump','badging',str(apk)])
assert "package: name='com.local.notesclone'" in badging
assert "native-code: 'arm64-v8a'" in badging
manifest=run('android-manifest',[str(sdk/'aapt2'),'dump','xmltree',str(apk),'--file','AndroidManifest.xml'])
assert 'android.permission.RECORD_AUDIO' in manifest and 'com.local.notesclone.fileprovider' in manifest
with zipfile.ZipFile(apk) as z:
 assert z.testzip() is None
 entries=z.infolist();names=[e.filename for e in entries];assert len(names)==len(set(names))
 assert all(not n.startswith('/') and '..' not in Path(n).parts and '\\' not in n for n in names)
 abis=sorted({n.split('/')[1] for n in names if n.startswith('lib/') and not n.endswith('/')});assert abis==['arm64-v8a']
 lib=z.read('lib/arm64-v8a/libnotes_clone_lib.so');assert lib==(EXTRACT/'libnotes_clone_lib.so').read_bytes()
 assert lib[:7]==b'\x7fELF\x02\x01\x01' and struct.unpack_from('<H',lib,18)[0]==183
 dex=z.read('classes4.dex');assert dex==(EXTRACT/'classes4.dex').read_bytes()
 dexes=[{'path':n,'bytes':z.getinfo(n).file_size,'sha256':sha(z.read(n))} for n in names if re.fullmatch(r'classes\d*\.dex',n)]

class Tokens(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.tokens=[]
 def handle_decl(self,d):self.tokens.append(['decl',d.lower()])
 def handle_starttag(self,t,a):self.tokens.append(['start',t,sorted((k,'' if v is None else v) for k,v in a)])
 def handle_startendtag(self,t,a):self.handle_starttag(t,a)
 def handle_endtag(self,t):self.tokens.append(['end',t])
 def handle_data(self,d):
  if d.strip():self.tokens.append(['data',d])
 def handle_comment(self,d):self.tokens.append(['comment',d])

decoded=load(EXTRACT/'embedded-assets/result.json');assert decoded['binarySha256']==sha(lib) and decoded['binaryBytes']==len(lib)
assert [r['path'] for r in decoded['records']]==[r['path'] for r in x['distFiles']]
payloads=[];html=[]
for row in x['distFiles']:
 expected=(Path(x['frontendSnapshot'])/row['path']).read_bytes();b=(EXTRACT/'embedded-assets'/row['path']).read_bytes()
 assert len(expected)==row['bytes'] and sha(expected)==row['sha256']
 record=next(r for r in decoded['records'] if r['path']==row['path']);assert record['match']['sha256']==sha(b) and record['match']['bytes']==len(b)
 if row['path']=='index.html':
  a=Tokens();a.feed(expected.decode());a.close();c=Tokens();c.feed(b.decode());c.close();assert a.tokens==c.tokens;html.append({'rawBytesEqual':expected==b,'distBytes':len(expected),'embeddedBytes':len(b),'completeNormalizedTokensEqual':True,'tokens':a.tokens})
 else:assert b==expected,row['path']
 assert all(marker not in b for marker in [b'__NOTES_DEBUG__',b'SyntheticMediaRecorder',b'__DEBUG_PLATFORM__'])
 payloads.append({'path':row['path'],'embeddedBytes':len(b),'embeddedSha256':sha(b),'rawDistEqual':b==expected})

preserved={r['originalOutput']:r for r in load(OUT/'payload-preservation-map.json')}
dump_path=OUT/'android-dexdump.stdout.txt'
if not dump_path.exists():
 row=preserved[str(dump_path.resolve())];dump_path=Path(row['preservedAt']);assert sha(dump_path.read_bytes())==row['sha256']
dump=dump_path.read_text()
blocks=re.split(r'(?m)^Class #\d+\s+-\n',dump)
selected={}
for block in blocks:
 m=re.search(r"Class descriptor\s+: '([^']+)'",block)
 if m and m[1] in ['Lcom/local/notesscan/DocumentUris;','Lcom/local/notesscan/DocumentStreams;','Lcom/local/notesscan/NotesScanPlugin;','Lcom/local/notesscan/NotesScanPlugin$$ExternalSyntheticLambda0;']:selected[m[1]]=block
assert len(selected)==4,selected.keys()
uris=selected['Lcom/local/notesscan/DocumentUris;'];streams=selected['Lcom/local/notesscan/DocumentStreams;'];plugin=selected['Lcom/local/notesscan/NotesScanPlugin;'];wrapper=selected['Lcom/local/notesscan/NotesScanPlugin$$ExternalSyntheticLambda0;']
assert all(s in uris for s in ["name          : 'normalizedAuthority'","name          : 'isManagedAuthority'",'"[0-9]+"','Ljava/util/Locale;.ROOT','Ljava/lang/String;.toLowerCase','Lkotlin/text/StringsKt;.startsWith','Lkotlin/text/StringsKt;.split'])
assert all(s in streams for s in ["name          : 'copy'",'#00008000','Ljava/io/InputStream;.read:([BII)I','Ljava/io/InputStream;.read:()I','Ljava/io/OutputStream;.write:','Ljava/io/OutputStream;.flush:','文档超过大小限制','文档读取长度与预期不符'])
method=plugin.split("name          : 'copyDocument$lambda$8'",1)[1].split("name          : '",1)[0]
assert all(s in method for s in ['Landroid/net/Uri;.getAuthority','Landroid/content/pm/PackageManager;.getPackageInfo','Lcom/local/notesscan/DocumentUris;.isManagedAuthority','"protected_target"','Landroid/content/ContentResolver;.openOutputStream','"wt"','Lcom/local/notesscan/DocumentStreams;.copy','Lkotlin/io/CloseableKt;.closeFinally'])
assert method.index('Lcom/local/notesscan/DocumentUris;.isManagedAuthority') < method.index('Landroid/content/ContentResolver;.openOutputStream')
assert 'Lcom/local/notesscan/NotesScanPlugin;.copyDocument$lambda$8' in wrapper
assert "name          : 'copyDocument'" in plugin
evidence=[]
for descriptor,block in selected.items():
 if descriptor=='Lcom/local/notesscan/NotesScanPlugin;':
  focused=[]
  for name in ['copyDocument$lambda$8','copyDocument']:
   part=block.split("name          : '"+name+"'",1)[1].split("name          : '",1)[0]
   focused.append("name          : '"+name+"'"+part)
  block="Class descriptor: '"+descriptor+"'\n"+'\n'.join(focused)
 filename='android-class-'+descriptor.split('/')[-1].replace(';','').replace('$','_')+'.txt';(OUT/filename).write_text(block)
 evidence.append({'descriptor':descriptor,'dex':'classes4.dex','file':filename,'bytes':len(block.encode()),'sha256':sha(block.encode())})
assert ident(apk)==x['apk']
for row in x['inputBefore']:assert sha((ROOT/row['path']).read_bytes())==row['sha256']
result={'status':'PASS-APK-IDENTITY','sourceHead':x['head'],'trackedInputCount':len(x['inputBefore']),'inputBeforeAfterCurrentAndCommitMatch':True,'apk':ident(apk),'abis':abis,'elf':{'member':'lib/arm64-v8a/libnotes_clone_lib.so','bytes':len(lib),'sha256':sha(lib),'ELF64LittleEndianAArch64':True},'dexes':dexes,'policyClasses':evidence,'staticMethodEvidence':{'guardBeforeOutputStream':True,'decodedAuthorityAndPackageManagerProviders':True,'bounded32KiBRawCopyFlushAndCloseFinally':True,'actualDEXClassMethodsNotFilenameOnly':True},'frontendPayloads':payloads,'htmlComparison':html,'commands':commands,'completeWallMs':round((time.monotonic()-started)*1000,2),'limits':['Read-only APK/DEX/ELF/signature audit; APK never installed or launched.','DEX method/disassembly is static inclusion and instruction evidence, not Android Uri/provider/ContentResolver execution proof.','Actual JSX/CSS/HTML payload identity does not establish Android native rendering or Apple Notes pixel parity.','REA Android provider unavailable: REA_JADX_MCP_JAR not configured; used installed SDK dexdump/aapt2 fallback, no setup or installation.']}
(OUT/'android-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['status','sourceHead','trackedInputCount','abis','staticMethodEvidence','completeWallMs']}))
