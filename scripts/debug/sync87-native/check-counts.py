#!/usr/bin/env python3
"""Host-only fixed helper/guard checks, stubbed ADB and app identity."""
import contextlib,importlib.util,io,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('counts_guard',Path(__file__).with_name('guard.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
identity={'pid':123,'startTicks':'456','package':'com.local.notesclone'};valid={'ok':True,'counts':dict(inboxTotal=1,targetInbox=0,targetNotes=0,targetProjection=0,targetSeen=0)};checks=0
assert g.counts_result(json.dumps(valid))==valid['counts'];checks+=1
for value in [{'ok':True,'counts':{**valid['counts'],'wire':'SECRET_SENTINEL'}},{'ok':True,'counts':{**valid['counts'],'inboxTotal':True}},{'ok':False,'error':'SECRET_SENTINEL'}]:
 try:g.counts_result(json.dumps(value));raise AssertionError('accepted invalid result')
 except g.Refused:checks+=1
for stage in ['IDENTITY','FILE','CANONICAL','OPEN','QUERY','QUERY_JSON_UNAVAILABLE','SCHEMA','VALUES','TRAILING']:
 try:g.counts_result(json.dumps({'ok':False,'error':'READONLY_COUNTS_FAILED','stage':stage}));raise AssertionError('stage accepted as counts')
 except g.Refused as e:assert str(e)=='readonly counts helper stage '+stage;checks+=1
for stage in ['SECRET_SENTINEL',None,17]:
 try:g.counts_result(json.dumps({'ok':False,'error':'READONLY_COUNTS_FAILED','stage':stage}));raise AssertionError('unbounded stage accepted')
 except g.Refused as e:assert str(e)=='readonly counts schema mismatch';checks+=1
calls=[]
def fake_adb(serial,avd,tail,**options):
 calls.append((serial,avd,tail,options));return json.dumps(valid) if 'run-as' in tail else 'synthetic push acknowledgement'
g.adb=fake_adb;g.app_identity=lambda serial,avd,expected=None:identity if expected==identity else (_ for _ in ()).throw(AssertionError('identity mismatch'))
sys.argv=['guard.py','--serial','emulator-5584','--avd','notes-sync87-isolated','sync-target-counts','--run-state','/private/tmp/notes-sync87-native-final-02/state.json','--app-identity',json.dumps(identity)]
with contextlib.redirect_stdout(io.StringIO()):g.main()
assert len(calls)==2 and calls[0][2]==['push',str(g.COUNTS_DEX),'/data/local/tmp/notes-sync87-target-counts.dex'] and calls[1][2]==['shell','run-as','com.local.notesclone','env','CLASSPATH=/data/local/tmp/notes-sync87-target-counts.dex','app_process','/system/bin','SyncTargetCounts'] and calls[1][3]=={'timeout':15};checks+=1
calls.clear();sys.argv[2]='emulator-5580'
try:
 with contextlib.redirect_stdout(io.StringIO()):g.main()
 raise AssertionError('foreign device accepted')
except g.Refused:assert not calls;checks+=1
print(json.dumps({'ok':True,'checks':checks,'scope':'host-only; exact owned final02 state/helper identity read; stubbed ADB, no subprocess/device'}))
