from pathlib import Path
import hashlib,json,subprocess,zipfile,plistlib,struct,time
from html.parser import HTMLParser
ROOT=Path.cwd();OUT=Path(__file__).resolve().parent;RUN=ROOT/'docs/verification/mac-feedback77/native-build';ART=ROOT/'artifacts/mac-feedback77';start=time.monotonic()
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def ident(p):
 b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':sha(b)}
def inventory(app):
 rows=[]
 for p in sorted(app.rglob('*')):
  assert not p.is_symlink(),str(p)
  if p.is_file():rows.append({'path':str(p.relative_to(app)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
 return rows
def run(label,argv,expected):
 began=time.monotonic();p=subprocess.run(argv,capture_output=True);(OUT/(label+'.stdout.txt')).write_bytes(p.stdout);(OUT/(label+'.stderr.txt')).write_bytes(p.stderr)
 assert p.returncode==expected,(label,p.returncode,p.stdout,p.stderr)
 return {'label':label,'argv':argv,'naturalExitCode':p.returncode,'wallMs':round(1000*(time.monotonic()-began),2),'stdoutSha256':sha(p.stdout),'stderrSha256':sha(p.stderr)}
x=load(RUN/'result.json');assert x['inputBefore']==x['inputAfter'] and x['inputUnchanged'];assert len(x['inputBefore'])==279
tracked=set(subprocess.check_output(['git','ls-tree','-r','--name-only',x['head']]).decode().splitlines());input_only=[];tracked_count=0
for row in x['inputBefore']:
 data=(ROOT/row['path']).read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256'],row
 if row['path'] in tracked:
  assert subprocess.check_output(['git','show',x['head']+':'+row['path']])==data,row['path'];tracked_count+=1
 else:input_only.append(row)
original=ART/'mac-original.app';derived=ART/'备忘录.app';before={a.name:inventory(a) for a in [original,derived]};assert before[original.name]==x['originalFiles'];assert before[derived.name]==x['derivedFiles']
assert inventory(ROOT/'src-tauri/target/release/bundle/macos/备忘录.app')==x['originalFiles']
old={r['path']:r for r in before[original.name]};new={r['path']:r for r in before[derived.name]};changed=[p for p in sorted(old.keys()|new.keys()) if old.get(p)!=new.get(p)];assert changed==x['changedPaths']==['Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources']
info=plistlib.loads((derived/'Contents/Info.plist').read_bytes());assert (original/'Contents/Info.plist').read_bytes()==(derived/'Contents/Info.plist').read_bytes();assert info['CFBundleIdentifier']=='com.local.notesclone' and info['CFBundleExecutable']=='notes-clone' and info['CFBundleDisplayName']=='备忘录'
archive=Path(x['archive']['path']);assert ident(archive)==x['archive'];assert ident(derived/'Contents/MacOS/notes-clone')['sha256']==x['executable']['sha256']
ziprows=[];expected={'备忘录.app/'+r['path']:r for r in before[derived.name]}
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert len(z.namelist())==len(set(z.namelist()))
 for entry in z.infolist():
  # ditto stores UTF-8 bytes without setting ZIP bit11; decode that spelling explicitly.
  name=entry.filename if entry.flag_bits&0x800 else entry.filename.encode('cp437').decode('utf8')
  assert not name.startswith('/') and '..' not in Path(name).parts and '\\' not in name
  if entry.is_dir():continue
  data=z.read(entry.filename)
  if name in expected:
   r=expected.pop(name);assert len(data)==r['bytes'] and sha(data)==r['sha256'];assert (entry.external_attr>>16)&0o777==(derived/r['path']).stat().st_mode&0o777
  else:assert name.startswith('__MACOSX/备忘录.app/') and Path(name).name.startswith('._') and data[:4]==bytes.fromhex('00051607'),name
  ziprows.append({'name':name,'bytes':len(data),'sha256':sha(data)})
 assert not expected,expected
class Tokens(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.tokens=[]
 def handle_decl(self,d):self.tokens.append(['decl',d.lower()])
 def handle_starttag(self,t,a):self.tokens.append(['start',t,sorted((k,'' if v is None else v) for k,v in a)])
 def handle_startendtag(self,t,a):self.handle_starttag(t,a)
 def handle_endtag(self,t):self.tokens.append(['end',t])
 def handle_data(self,d):
  if d.strip():self.tokens.append(['data',d])
 def handle_comment(self,d):self.tokens.append(['comment',d])
htmlrecords=[]
for label in ['original','derived']:
 folder=OUT/(label+'-assets');extract=load(folder/'result.json');exe=(original if label=='original' else derived)/'Contents/MacOS/notes-clone';assert extract['binarySha256']==sha(exe.read_bytes())
 for row in x['frontendFiles']:
  dist=(ROOT/'dist'/row['path']).read_bytes();embedded=(folder/row['path']).read_bytes();assert len(dist)==row['bytes'] and sha(dist)==row['sha256']
  if row['path']!='index.html':assert embedded==dist,row['path']
  else:
   a=Tokens();a.feed(dist.decode());b=Tokens();b.feed(embedded.decode());assert a.tokens==b.tokens
   htmlrecords.append({'label':label,'rawDistBytes':len(dist),'rawEmbeddedBytes':len(embedded),'rawBytesEqual':embedded==dist,'completeNormalizedTokensEqual':True,'tokens':a.tokens,'distSha256':sha(dist),'embeddedSha256':sha(embedded)})
 for r in extract['records']:
  m=r['match'];raw=exe.read_bytes()[m['offset']:m['offset']+m['compressedBytes']]
  assert raw==(original/'Contents/MacOS/notes-clone').read_bytes()[m['offset']:m['offset']+m['compressedBytes']]
(OUT/'html-comparison.json').write_text(json.dumps(htmlrecords,ensure_ascii=False,indent=2)+'\n')
def sections(p):
 data=p.read_bytes();magic,cpu,sub,filetype,ncmds,sizecmds,flags,res=struct.unpack_from('<8I',data);assert magic==0xfeedfacf and cpu==0x100000c;offset=32;rows=[]
 for _ in range(ncmds):
  cmd,size=struct.unpack_from('<II',data,offset)
  if cmd==0x19:
   nsects=struct.unpack_from('<I',data,offset+64)[0]
   for j in range(nsects):
    pos=offset+72+j*80;name,segment=struct.unpack_from('<16s16s',data,pos);addr,length,fileoffset,align,reloff,nreloc,sflags=struct.unpack_from('<QQIIIII',data,pos+32);zero=sflags&0xff in [1,0xc,0x12];content=b'' if zero else data[fileoffset:fileoffset+length];rows.append({'segment':segment.rstrip(b'\0').decode(),'section':name.rstrip(b'\0').decode(),'length':length,'sha256':sha(content),'zeroFill':zero})
  offset+=size
 assert offset==32+sizecmds;return rows
original_sections=sections(original/'Contents/MacOS/notes-clone');assert original_sections==sections(derived/'Contents/MacOS/notes-clone')
commands=[]
for label,app in [('original',original),('derived',derived)]:
 commands.append(run(label+'-strict',['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(app)],1 if label=='original' else 0))
 commands.append(run(label+'-display',['/usr/bin/codesign','-dv','--verbose=4',str(app)],0))
 commands.append(run(label+'-entitlements',['/usr/bin/codesign','-d','--entitlements','-',str(app)],0))
assert 'code has no resources but signature indicates they must be present' in (OUT/'original-strict.stderr.txt').read_text()
sig=(OUT/'derived-display.stderr.txt').read_text();assert 'Identifier=com.local.notesclone' in sig and 'Signature=adhoc' in sig and 'TeamIdentifier=not set' in sig
assert before=={a.name:inventory(a) for a in [original,derived]};assert ident(archive)==x['archive']
for row in x['inputBefore']:assert sha((ROOT/row['path']).read_bytes())==row['sha256']
result={'status':'PASS-PACKAGE-IDENTITY','sourceHead':x['head'],'inputCount':279,'trackedInputBytesMatchSourceCommit':tracked_count,'generatedInputOnly':input_only,'inputBeforeAfterAndCurrentMatch':True,'originalAndDerivedInventoriesUnchanged':before,'onlySigningPathsChanged':changed,'zip':ident(archive),'zipEntriesMatchDerivedAndModes':ziprows,'info':info,'machOSectionContentsUnchangedBySigning':original_sections,'signatureCommands':commands,'frontendPayloads':'All three decoded JS/CSS complete bytes equal current dist and build hashes in both original and derived exe; HTML 498->478 Tauri serialization is raw unequal but complete normalized tokens equal. No stale UI payload found.','completeWallMs':round((time.monotonic()-start)*1000,2),'limits':['Read-only file/signature/resource audit; no build, sign, launch, install, GUI, mic, user/Android data access.','Local adhoc signature only, no DeveloperID or notarization.','Current embedded payload identity does not establish WKWebView rendering/runtime or Apple Notes pixel parity.']}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['status','sourceHead','inputCount','trackedInputBytesMatchSourceCommit','onlySigningPathsChanged','completeWallMs']}))
