from pathlib import Path
import importlib.util,json,hashlib,subprocess,re
root=Path('/private/tmp/apple-notes-sync87-native');p=root/'scripts/debug/sync87-native/guard.py';spec=importlib.util.spec_from_file_location('g',p);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
src=root/'scripts/debug/sync87-native/android/SyncTargetCounts.java';old=subprocess.check_output(['git','show','4d3b98bb:scripts/debug/sync87-native/android/SyncTargetCounts.java'],cwd=root,text=True)
assert src.read_text().split('public static void main')[0]==old.split('public static void main')[0]
assert hashlib.sha256(src.read_bytes()).hexdigest()==g.COUNTS_SOURCE_SHA256=='55fdc7af6f7fb6c7de06373a1722257289cb17d005e25358888597b457364611'
assert hashlib.sha256(g.COUNTS_DEX.read_bytes()).hexdigest()==g.COUNTS_DEX_SHA256=='88898d00c8499846d197f1b976195364548dc332ae20596987e641822565afc8'
asm=subprocess.check_output(['/Users/water/Library/Android/sdk/build-tools/36.0.0/dexdump','-d',str(g.COUNTS_DEX)],text=True)
assert len(re.findall(r'invoke-virtual.*SQLiteDatabase;\.rawQuery',asm))==1
assert 'const/4 v3, #int 1' in asm or '#int 1' in asm
assert not any(x in asm for x in ['execSQL','openOrCreateDatabase','Runtime;.exec','System;.exit'])
for stage in ['IDENTITY','FILE','CANONICAL','OPEN','QUERY','SCHEMA','VALUES','TRAILING']:
 assert '"'+stage+'"' in asm
 try:g.counts_result(json.dumps({'ok':False,'error':'READONLY_COUNTS_FAILED','stage':stage}))
 except g.Refused as e:assert str(e)=='readonly counts helper stage '+stage
 else:raise AssertionError('failed stage accepted as success')
for stage in ['SECRET_SENTINEL',None,{},17]:
 try:g.counts_result(json.dumps({'ok':False,'error':'READONLY_COUNTS_FAILED','stage':stage}))
 except g.Refused as e:assert str(e)=='readonly counts schema mismatch'
 else:raise AssertionError('unbounded stage accepted')
valid={'ok':True,'counts':dict(inboxTotal=1,targetInbox=0,targetNotes=0,targetProjection=0,targetSeen=0)};assert g.counts_result(json.dumps(valid))==valid['counts']
print(json.dumps({'ok':True,'sourceCommit':'d2510e6bca68dce734f8a515a678bf3a37be2adc','javaSha256':g.COUNTS_SOURCE_SHA256,'dexSha256':g.COUNTS_DEX_SHA256,'scope':'fixed source/actual DEX/stage-parser host only; no helper/runtime/ADB/device execution','checks':['fixedDB/query/target unchanged','actualDEX single readonly query and finite stages, no System.exit/write path','all8failurestages remain refused counts with fixed stage diagnostic','unknown and nonstring stage do not leak','success counts parser unchanged']},indent=2))
