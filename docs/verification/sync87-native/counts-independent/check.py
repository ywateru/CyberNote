from pathlib import Path
import importlib.util,json,hashlib,subprocess,re,contextlib,io,sys
root=Path('/private/tmp/apple-notes-sync87-native');p=root/'scripts/debug/sync87-native/guard.py';spec=importlib.util.spec_from_file_location('g',p);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
source=root/'scripts/debug/sync87-native/android/SyncTargetCounts.java';dex=g.COUNTS_DEX
assert hashlib.sha256(source.read_bytes()).hexdigest()==g.COUNTS_SOURCE_SHA256
assert hashlib.sha256(dex.read_bytes()).hexdigest()==g.COUNTS_DEX_SHA256
assembly=subprocess.check_output(['/Users/water/Library/Android/sdk/build-tools/36.0.0/dexdump','-d',str(dex)],text=True)
assert assembly.count('Class descriptor')==1 and "'LSyncTargetCounts;'" in assembly
assert '/data/user/0/com.local.notesclone/files/notes.sqlite3' in assembly and 'eac3b7e0-12cd-43cc-a1c0-2457e8cc4320' in assembly
assert len(re.findall(r'invoke-virtual.*SQLiteDatabase;\.rawQuery',assembly))==1
assert 'const/4 v3, #int 1' in assembly and re.search(r'invoke-static \{v0, v11, v3\}.*SQLiteDatabase;\.openDatabase',assembly)
assert not any(x in assembly for x in ['execSQL','openOrCreateDatabase','java/net','SQLiteStatement','FileOutputStream','Runtime;.exec'])
valid={'ok':True,'counts':dict(inboxTotal=1,targetInbox=1,targetNotes=0,targetProjection=0,targetSeen=1)};assert g.counts_result(json.dumps(valid))==valid['counts']
for v in [{**valid,'secret':'SENTINEL'},{'ok':True,'counts':{**valid['counts'],'targetSeen':True}},{'ok':True,'counts':{**valid['counts'],'targetSeen':-1}},{'ok':True,'counts':{**valid['counts'],'targetSeen':2147483648}},{'ok':False,'error':'SENTINEL'}]:
 try:g.counts_result(json.dumps(v))
 except g.Refused as e:assert 'SENTINEL' not in str(e)
 else:raise AssertionError('invalid counts admitted')
identity={'pid':123,'startTicks':'456','package':g.PACKAGE};calls=[];identities=[]
def adb(serial,avd,tail,**kw):
 calls.append((serial,avd,tail,kw));return json.dumps(valid) if tail[:2]==['shell','run-as'] else 'fixed push acknowledgement'
def app(serial,avd,expected=None):
 identities.append((serial,avd,expected));assert expected==identity;return identity
g.adb=adb;g.app_identity=app
argv=['guard.py','--serial',g.SERIAL,'--avd',g.AVD,'sync-target-counts','--run-state','/private/tmp/notes-sync87-native-final-02/state.json','--app-identity',json.dumps(identity)]
old=sys.argv
try:
 sys.argv=argv;out=io.StringIO()
 with contextlib.redirect_stdout(out):g.main()
 result=json.loads(out.getvalue());assert result['result']['counts']==valid['counts'];assert len(identities)==3
 assert calls==[(g.SERIAL,g.AVD,['push',str(dex),'/data/local/tmp/notes-sync87-target-counts.dex'],{}),(g.SERIAL,g.AVD,['shell','run-as',g.PACKAGE,'env','CLASSPATH=/data/local/tmp/notes-sync87-target-counts.dex','app_process','/system/bin','SyncTargetCounts'],{'timeout':15})]
 calls.clear();identities.clear();sys.argv=[*argv];sys.argv[2]='emulator-5580'
 try:g.main()
 except g.Refused:pass
 else:raise AssertionError('wrongserial accepted')
 assert not calls and not identities
finally:sys.argv=old
print(json.dumps({'ok':True,'sourceCommit':'4d3b98bb7e2d25b30c426ca175e23142cdbc6e91','javaSha256':g.COUNTS_SOURCE_SHA256,'dexSha256':g.COUNTS_DEX_SHA256,'scope':'source/DEX disassembly/host stub only, no Java helper execution/runtime/ADB/device','checks':['one fixed target/db/readonly open flag and one rawQuery in actual DEX','source and DEX hashes match frozen guard','bounded integer output rejects extra fields/bools/negative/overflow/error secrets','exact fixed push+run-as15s and three same-lifetime observations','wrong serial refused before stub invocation']},indent=2))
