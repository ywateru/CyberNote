from pathlib import Path
import hashlib,json,base64,re
p=Path('/private/tmp/sync91-dom-final01');root=Path('/private/tmp/apple-notes-viewport88');out=Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
d=load(p/'result.json');build=load(Path('/private/tmp/sync91-transport-final01/build.json'))
assert len(d['checks'])==39 and not d['sourceChanged'] and d['sourceBefore']==d['sourceAfter']
assert d['backend']['sourcesUnchanged'] and d['backend']['sources']==build['sources']
assert d['backend']['binary']['sha256']==build['binary']['sha256']==sha((p/'notes-sync-dom-transport').read_bytes())
assert d['backend']['buildSourceHead']==build['sourceHead']==d['sourceHead']
process=[]
for x in d['processes']:
 assert x['lifecycle']['exit']=={'code':0,'signal':None} and x['lifecycle']['pending']==0 and x['pageErrors']==[] and x['polling']['stopped']
 assert all(c['terminal'] for c in x['resourceClosures'])
 assert any(c['event']=='browser-process-exit' and c['code']==0 and c['signal'] is None for c in x['resourceClosures'])
 process.append({'name':x['name'],'lifecycle':x['lifecycle'],'pageErrors':x['pageErrors'],'browserTerminal':True})
assert len(process)==3 and process[0]['lifecycle']['pid']!=process[2]['lifecycle']['pid']
events=[e['payload'] for x in d['processes'] for e in x['events'] if e['name']=='notes-sync']
assert all(any(e.get('phase')==p for e in events) for p in ['probe','prepare','commit'])
assert any(e.get('phase')=='release' and e.get('outcome')=='commit' for e in events)
for x in d['databaseEvidence']:assert x['integrity']=='ok' and x['counts']['sync_inbox']==0 and x['immutableReadOnly'] and x['unchanged']
assert d['databaseEvidence'][0]['identity'][0][0]==d['databaseEvidence'][1]['identity'][0][0]
assert d['databaseEvidence'][0]['identity'][0][1]!=d['databaseEvidence'][1]['identity'][0][1]
record=next(x for x in d['observations'] if x['name']=='recording-original-bytes');b=(p/'synthetic-recording.wav').read_bytes();assert len(b)==record['bytes'] and sha(b)==record['sha256'] and record['decoded']['tailPeak']>0 and record['decoded']['duration']>0
src=(root/'scripts/debug/mobile-attachments.mjs').read_text();m=re.search(r'export const tinyPNG = Buffer.from\(\s*["\']([^"\']+)["\'],\s*["\']base64',src);assert m
assert (p/'exported-original.png').read_bytes()==base64.b64decode(m[1])
result={'status':'PASS-READONLY-ACTUAL39-DOM-EVIDENCE','checks':d['checks'],'binary':d['backend']['binary'],'sourceUnchanged':True,'source48ExactFrozenBinaryManifest':True,'processes':process,'realCommitReleaseObserved':True,'databaseIntegrityAndEmptyInbox':True,'sameWorkspaceDistinctDevices':True,'mediaOriginals':record,'exportedPNGBytes':len((p/'exported-original.png').read_bytes()),'resultSha256':sha((p/'result.json').read_bytes()),'limits':d['limitations']+['Independent read-only original-evidence audit, no rerun/device/DB queries','backend gitDirty true at spawn is preserved; exact48 sources and approved322 verified separately']}
(out/'dom-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(d['checks']),'mediaBytes':record['bytes'],'processes':len(process)}))
