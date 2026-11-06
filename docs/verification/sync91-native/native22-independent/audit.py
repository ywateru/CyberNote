from pathlib import Path
import json,hashlib
root=Path('/Users/water/work/2026/Apple-Notes-Clone');p=root/'docs/verification/sync91-native/native-original-target-and-network22';orig=Path('/private/tmp/notes-sync87-native-final-02');out=Path(__file__).resolve().parent
load=lambda f:json.loads((p/f).read_text());sha=lambda b:hashlib.sha256(b).hexdigest();docsha=lambda d:sha(json.dumps(d,ensure_ascii=False,separators=(',',':')).encode())
rows=[]
for f in sorted(p.glob('*.json')):
 b=f.read_bytes();r={'name':f.name,'bytes':len(b),'sha256':sha(b)}
 if (orig/f.name).exists():assert (orig/f.name).read_bytes()==b;r['originalOutputExact']=True
 rows.append(r)
baseline=load('cycle22-native-baseline-original-target.json');d=baseline['diagnostics'];assert d['commits']==1 and d['abortReasons']['applyError']==0 and len(d['applyErrors'])==29 and all(v==0 for v in d['applyErrors'].values())
assert d['abortReasons']['timeout']==1 and baseline['originalTarget']['id']=='eac3b7e0-12cd-43cc-a1c0-2457e8cc4320'
counts=load('cycle22-target-counts12.json')['result'];assert counts['counts']=={'inboxTotal':0,'targetInbox':0,'targetNotes':1,'targetProjection':1,'targetSeen':1};assert counts['appIdentityBefore']==counts['appIdentityAfter']==baseline['identity']
native=load('cycle22-desktop-media-afterfailure-native.json');peer=load('cycle22-peer-afterfailure-exact-owned-proof.json');cold=load('cold-boot-before.json');notes={n['id']:n for n in peer['notes']};assert len(notes)==2
for expected in [baseline['mobileExpected'],native['expected']]:
 actual=notes[expected['id']];assert actual['document']==expected['document'] and actual['plainText']==expected['plainText']
 assert next(n for n in cold['notes'] if n['id']==expected['id'])['document']==expected['document']
assert native['stateDesktopNote']['attachmentIds']==[] and native['clientClosed'] and baseline['clientClosed']
fixtures=json.loads((orig/'state.json').read_text())['files'];known={(x['bytes'],x['sha256']) for x in fixtures}
for f in fixtures:
 b=Path(f['path']).read_bytes();assert len(b)==f['bytes'] and sha(b)==f['sha256']
assert len(peer['originals'])==5
for pr in peer['originals']:assert pr['managedFileVerified'] and (pr['bytes'],pr['sha256']) in known
for pr in native['proofs']:assert (pr['bytes'],pr['sha256']) in known and pr['source']=='actual-native-read_attachment'
assert len(native['proofs'])==2 and len(cold['notes'])==2 and sum(len(n['attachments']) for n in cold['notes'])==5
text=load('text-roundtrip.json');assert all(x['completeDocumentAndPlainTextVerified'] for k,x in text.items() if k!='scope');assert docsha(baseline['mobileExpected']['document'])==text['mobileToDesktop']['documentSha256'];assert sha(baseline['mobileExpected']['plainText'].encode())==text['mobileToDesktop']['plainTextSha256']
life=load('desktop-peer-lifecycle.json');assert life['exit']=={'code':0,'signal':None} and life['binaryUnchanged'] and life['frontendUnchanged'] and not life['forcedOrFailed'] and life['pageErrorCount']==0
assert life['reopenProof']['identities']['root']['inode']==35260086 and life['reopenProof']['identities']['database']['inode']==35260089
assert load('cycle22-peer.execution.json')['exitCode']==2 and load('cycle22-coldboot-prepare.execution.json')['exitCode']==0
result={'status':'PASS-NARROW-ACTUAL21-ORIGINAL-TARGET-AND-STORE-BYTES','files':rows,'originalTargetAppliedCounts':counts['counts'],'diagnosticCommits':d['commits'],'applyErrorAll29Zero':True,'timeoutCountPreserved':1,'sameNativeIdentity':baseline['identity'],'twoFullDocumentsAndPlainTextEqual':True,'fiveManagedOriginalProofs':peer['originals'],'nativeTwoReceivedOriginals':native['proofs'],'samePairedPeerRootInode':35260086,'samePairedPeerDbInode':35260089,'peerNatural0':True,'wrapperFailure2Retained':True,'coldPrepareNotes':2,'coldPrepareAttachments':5,'limits':['OriginaldesktopMedia action remainsFAILED; late substage unobserved','No actual visible/decode/export/coldbootVERIFY/foregroundReconnect acceptance yet','Read-only original safe evidence/fixtures/source review; no DBqueries/devices/runtime']}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'notes':2,'managedOriginals':5,'nativeReceivedOriginals':2}))
