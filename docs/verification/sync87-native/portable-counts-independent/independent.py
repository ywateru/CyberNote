from pathlib import Path
import importlib.util,json,hashlib,subprocess,re
root=Path('/private/tmp/apple-notes-sync87-native');source=root/'scripts/debug/sync87-native/android/SyncTargetCounts.java';spec=importlib.util.spec_from_file_location('g',root/'scripts/debug/sync87-native/guard.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
assert hashlib.sha256(source.read_bytes()).hexdigest()==g.COUNTS_SOURCE_SHA256=='b7cdb5f07dc5da82ba0902bd010535f5baad91649eef685bc6bd8ef9f9157c73'
assert hashlib.sha256(g.COUNTS_DEX.read_bytes()).hexdigest()==g.COUNTS_DEX_SHA256=='ec0358fff130bc00cf501304806f81e80a12eb74e2854e24e9e67001ecea41b7'
text=source.read_text();assert '/data/data/com.local.notesclone/notes.sqlite3' in text and 'eac3b7e0-12cd-43cc-a1c0-2457e8cc4320' in text
assert text.count('db.rawQuery(')==2 and 'json_extract' not in text
assert 'if (++inspected>10000)' in text and 'if (inspected!=n[0] || targetInbox>2147483647L)' in text
assert 'root.opt("kind"), entity=root.opt("entityId")' in text
assert 'kind instanceof String && kind.equals("note") && entity instanceof String && entity.equals(TARGET)' in text
asm=subprocess.check_output(['/Users/water/Library/Android/sdk/build-tools/36.0.0/dexdump','-d',str(g.COUNTS_DEX)],text=True)
assert len(re.findall(r'invoke-virtual.*SQLiteDatabase;\.rawQuery',asm))==2
assert 'SELECT wire FROM sync_inbox' in asm and 'Lorg/json/JSONObject;' in asm and 'json_extract' not in asm
assert len(re.findall(r'invoke-virtual.*JSONObject;\.opt',asm))==2
assert 'SQLiteDatabase;.isReadOnly' in asm and not any(x in asm for x in ['execSQL','openOrCreateDatabase','FileOutputStream','printStackTrace'])
for stage in ['INBOX_QUERY','INBOX_PARSE','INBOX_VALUES']:
 try:g.counts_result(json.dumps({'ok':False,'error':'READONLY_COUNTS_FAILED','stage':stage}))
 except g.Refused as e:assert str(e)=='readonly counts helper stage '+stage
 else:raise AssertionError('failure stage accepted')
valid={'ok':True,'counts':dict(inboxTotal=1,targetInbox=1,targetNotes=0,targetProjection=0,targetSeen=1)};assert g.counts_result(json.dumps(valid))==valid['counts']
for result in [{**valid,'wire':'SECRET'},{'ok':True,'counts':{**valid['counts'],'targetInbox':'SECRET'}}]:
 try:g.counts_result(json.dumps(result))
 except g.Refused as e:assert 'SECRET' not in str(e)
 else:raise AssertionError('unsafe output accepted')
print(json.dumps({'ok':True,'sourceCommit':'a65a6853565bfcf72dd99e8fd33dd1c6e53b6977','javaSha256':g.COUNTS_SOURCE_SHA256,'dexSha256':g.COUNTS_DEX_SHA256,'scope':'actualDEX/source/fixedoutput host only; no devices/helperexecution','checks':['two exact readonly queries with fixed appDB/target','org.json reads two rootkeys with exact string type/target checks; no payload output','10000row cap and total mismatch refusal','actualDEX no optional SQLiteJSON/write/stacktrace paths','new failurestages refused and success output onlyfiveboundedintegers'],'limits':['two readonly query snapshots are sequential; not atomic across concurrent apply']},indent=2))
