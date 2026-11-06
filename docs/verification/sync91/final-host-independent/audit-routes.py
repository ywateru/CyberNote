from pathlib import Path
import hashlib,json,os
out=Path(__file__).resolve().parent;p=Path('/private/tmp/sync87-routes-final91-02/result.json');r=json.loads(p.read_text());old=json.loads(Path('/private/tmp/sync87-routes-final91-01/result.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
assert r['mode']=='tunnel' and not r['failures'] and len(r['checks'])==39
assert r['sourceBefore']==r['sourceAfter']==old['sourceBefore']==old['sourceAfter']
assert r['script']['sha256']==r['script']['after']==old['script']['sha256']
assert r['binary']['sha256']==r['binary']['after']==old['binary']['sha256']=='cd1e2b6fc989a9d09d69bc889704bb1fbc26bd7aa95248eea21c31c482a86077'
assert r['routes']['quickTunnel']['verified'] and r['routes']['quickTunnel']['badKeyCode']=='sync_transport'
assert r['routes']['quickTunnel']['endpoint']!=r['routes']['quickTunnel']['secondEndpoint']
assert not r['routes']['virtualNetwork']['verified']
names={x['name'] for x in r['checks']}
for prefix in ['tunnel','tunnel-new-hostname']:
 for suffix in [' host to client note',' client to host edit','-image.png remote read original SHA','-audio.wav remote read original SHA','-image.png export original SHA','-audio.wav export original SHA','-image.png separate managed file SHA','-audio.wav separate managed file SHA']:assert prefix+suffix in names
assert len(r['processes'])==4 and len(r['tunnels'])==2
for x in r['processes']:assert x['exit']=={'code':0,'signal':None} and not x['errors'] and x['pending']==0
assert r['tunnels'][0]['forced'] and r['tunnels'][0]['exit']=={'code':None,'signal':'SIGKILL'}
assert not r['tunnels'][1]['forced'] and r['tunnels'][1]['exit']=={'code':0,'signal':None}
for x in r['tunnels']:assert any(v['connected'] and v['closed'] for v in x['wsProbes']) and any(v['upgradeRequest'] and v['upgradeResponse'] and v['toHostBytes']>0 and v['fromHostBytes']>0 for v in x['originConnections'])
for x in r['processes']+r['tunnels']:
 try:os.kill(x['pid'],0)
 except ProcessLookupError:pass
 else:raise AssertionError('owned PID still live')
for row in r['files']:
 b=Path(row['path']).read_bytes();assert len(b)==row['size'] and sha(b)==row['sha256']
result={'status':'PASS-READONLY-CURRENT91-ROUTES02-EVIDENCE','resultSha256':sha(p.read_bytes()),'checks':r['checks'],'sourceAndBinarySameAsFailed01':True,'verifiedRealWssEndpoints':2,'wrongPskCode':r['routes']['quickTunnel']['badKeyCode'],'all22FilesHashed':True,'owned6PidsDead':True,'processes':[{'name':x['name'],'exit':x['exit']} for x in r['processes']],'tunnels':[{'name':x['name'],'exit':x['exit'],'forced':x['forced']} for x in r['tunnels']],'limits':['First route01 remains FAILED; route02 is unchanged separate fresh tunnel-only pass','Tunnel1 forced SIGKILL after existing grace retained; tunnel2 natural0','Virtual WG/EasyTier unverified','No device/runtime/new routes/DB queries by independent reviewer']}
(out/'routes02-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(r['checks']),'ownedDead':6,'filesHashed':len(r['files'])}))
