#!/usr/bin/env python3
"""Independent read-only raw audit. No author metric/population helper imports,
no browser/transport startup, sample bytes scan, build, or fixture mutations."""
import collections, hashlib, json, math, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT/'docs/plan/reviews/app-media-after99m-result.json'
BEFORE = ROOT/'artifacts/media99-baseline-run4'
AFTER = ROOT/'artifacts/media99m-after-run1'
FIXTURE = ROOT/'artifacts/media99-fixture'
read = lambda p: json.loads(p.read_text())
lines = lambda p: [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = []
def eq(actual, expected, label):
    assert actual == expected, (label, actual, expected)
def passed(label): checks.append(label)
def integer(n): return type(n) is int and 0 <= n <= 2**53-1
COUNTERS = ['bytesRead','readOperations','originalBytesRead','originalReadOperations','thumbnailBytesRead','thumbnailReadOperations','thumbnailGenerationAttempts','thumbnailSourceLogicalBytes','thumbnailOutputBytes','thumbnailGenerations','thumbnailHits']
GAUGES = ['peakReadBlock','activeStreams','activeLeases','cacheBytes','cacheFiles','cacheQuota']
def valid(v):
    eq(v['schema'], 2, 'schema')
    assert all(integer(v.get(k)) for k in COUNTERS+GAUGES)
    assert isinstance(v['scope'], str)
def percentile(v,q): return sorted(v)[math.floor((len(v)-1)*q)] if v else None
summary = read(ROOT/'docs/verification/modernization101/media99m-after-data.json')
config = {key:read(path/'configuration.json') for key,path in [('before',BEFORE),('after',AFTER)]}
raw_hashes = {}; calculated = {}
for key,directory in [('before',BEFORE),('after',AFTER)]:
    result = read(directory/'result.json'); phases = read(directory/'phases.json'); memory = lines(directory/'memory.jsonl')
    eq(len(phases),10,key+' phases')
    raw_hashes[key] = {p.name:sha(p) for p in directory.iterdir() if p.is_file() and p.suffix in ['.json','.jsonl','.mjs','.ipc','.png']}
    for name,h in summary[key]['rawSHA256'].items(): eq(raw_hashes[key][name],h,key+' raw SHA '+name)
    eq(result['configuration'],config[key],key+' configuration duplicate')
    eq(summary['configuration'][key],config[key],key+' published configuration')
    for row in memory:
        processes=row['chromeProcesses']
        eq(sum(p['rssBytes'] for p in processes),row['chromeTotalRSS'],'Chrome total recompute')
        eq(sum(p['rssBytes'] for p in processes if p['role']=='renderer'),row['chromeRendererRSS'],'renderer recompute')
        browsers=[p['pid'] for p in processes if p['role']=='browser'];eq(len(browsers),1,'owned browser root')
        owned={browsers[0]}
        for _ in processes:
            owned.update(p['pid'] for p in processes if p['ppid'] in owned)
        assert all(p['pid'] in owned for p in processes)
    output=[]
    for phase in phases:
        name=phase['name']; recorded=next(x for x in result['metrics'] if x['name']==name)
        published=next(x for x in summary[key]['phases'] if x['name']==name)
        mem=[x for x in memory if x['phase']==name]
        frames=[x['delta'] for x in phase['snapshot']['frames'] if x['phase']==name]
        tasks=[x['duration'] for x in phase['snapshot']['longTasks'] if x['phase']==name]
        value={'name':name,'wallMs':phase['end']-phase['start'],
          'frames':{'count':len(frames),'p50':percentile(frames,.5),'p95':percentile(frames,.95),'max':max(frames) if frames else None},
          'longTasks':{'count':len(tasks),'totalMs':sum(tasks),'maxMs':max(tasks) if tasks else 0}}
        for dest,field in [('peakJSHeap','jsHeapUsed'),('peakChromeRendererRSS','chromeRendererRSS'),('peakChromeTotalRSS','chromeTotalRSS'),('peakRustRSS','rustRSS'),('peakNodeBridgeRSS','nodeBridge')]:
            values=[x[field]['rss'] if field=='nodeBridge' else x[field] for x in mem]
            value[dest]=max(values) if values and all(isinstance(n,(int,float)) and math.isfinite(n) for n in values) else None
        for k in value:
            if k!='name': eq(value[k],recorded[k],key+':'+name+':result '+k);eq(value[k],published[k],key+':'+name+':report '+k)
        value['workspaceReadyMs']=phase['snapshot']['readyAt'];eq(value['workspaceReadyMs'],published['workspaceReadyMs'],name+' ready')
        value['firstVisibleImage']=phase['snapshot']['firstVisibleImage'];eq(value['firstVisibleImage'],published['firstVisibleImage'],name+' image')
        value['images']=phase['snapshot']['images'];eq(value['images'],published['images'],name+' images')
        value['retention']=[dict(label=x['label'],jsHeapUsed=x['jsHeapUsed'],chromeRendererRSS=x['chromeRendererRSS'],rustRSS=x['rustRSS'],nodeRSS=x['nodeBridge']['rss']) for x in mem if x['label'] not in ['periodic','phase-start','phase-end']]
        eq(value['retention'],published['retention'],name+' retention')
        if key=='after':
            start,end=phase['runtimeStart'],phase['runtimeEnd'];valid(start);valid(end)
            value['counters']={k:end[k]-start[k] for k in COUNTERS};assert min(value['counters'].values())>=0
            eq(value['counters'],recorded['runtimeDelta']['counters'],name+' result counters')
            eq(value['counters'],published['runtime']['counters'],name+' report counters')
        output.append(value)
    eq(min(x['freeBytes'] for x in memory),summary[key]['minimumFreeBytes'],key+' disk minimum')
    assert min(x['freeBytes'] for x in memory)>2.5*1024**3
    calculated[key]=output
    passed(key+': all10 phase walls/quantiles/longtasks/heap/separate RSS/retention/raw hashes verified')
# Frozen shared inputs: hash small metadata/SQLite only. Do not reread originals.
fixture_hashes={n:sha(FIXTURE/n) for n in ['manifest.json','store-map.json','store-baseline.sqlite3']}
expected=['3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351','7e2e17411a078e0d38b9819ec2c8f2efe41968303d89ed59963100ca5f61f27c','67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf']
eq(list(fixture_hashes.values()),expected,'frozen metadata SHA')
mapping=read(FIXTURE/'store-map.json'); attachments={x['id']:x for x in mapping['attachments']}
eq(len(attachments),503,'population');eq(len(mapping['notes']),103,'notes');eq(sum(x['bytes'] for x in attachments.values()),715371216,'original logical bytes')
for key,c in config.items():
    eq(c['browser']['version'],'156.0.8078.80',key+' Chrome');eq(c['viewport'],{'width':1440,'height':1000},key+' viewport');eq(c['scrollStepMs'],100,key+' scroll')
    eq(c['fixtureManifestSha256'],expected[0],key+' manifest');eq(c['store']['sqliteSha256'],expected[2],key+' SQLite');eq(c['store']['attachmentHardlinks'],503,key+' links')
    eq(c['store']['newOriginalBytes'],0,key+' new bytes');eq(c['originalBytes'],715371216,key+' originals')
    js='\n'.join(p.read_text() for p in (pathlib.Path(c['frontend'])/'assets').glob('*.js'))
    assert 'jsx(React.StrictMode, { children:' in js and 'createRoot(document.getElementById("root")).render(' in js
    eq(read(pathlib.Path(c['frontend'])/'source.json')['source'],c['frontendMetadata']['source'],key+' frozen frontend identity')
passed('same frozen metadata/SQLite hashes,503/715371216B/103notes,Chrome156,1440x1000,StrictMode debug bundles and100ms cadence')
# Match completed source calls to raw IPC starts/ends and metrics checkpoints.
trace=lines(AFTER/'media.jsonl'); ipc=lines(AFTER/'media.jsonl.ipc'); network=read(AFTER/'network.json')
starts={x['id']:x for x in ipc if x['event']=='start'};ends={x['id']:x for x in ipc if x['event']=='end'}
eq(len(starts),len(trace),'IPC starts');eq(len(ends),len(trace),'IPC ends')
for row in trace:
    eq(starts[row['id']]['command'],row['command'],'start command');eq(ends[row['id']]['command'],row['command'],'end command');eq(ends[row['id']]['ok'],row['ok'],'end ok')
    eq(starts[row['id']].get('phase'),row.get('phase'),'phase attribution')
metric_rows=[x['metrics'] for x in trace if x['command']=='perf_metrics'];assert len(metric_rows)==21
phases=read(AFTER/'phases.json')
for phase in phases:
    assert phase['runtimeStart'] in metric_rows and phase['runtimeEnd'] in metric_rows
last=phases[-1]['runtimeEnd'];first=phases[0]['runtimeStart']
totals={k:sum(x['counters'][k] for x in calculated['after']) for k in COUNTERS}
eq(totals,{k:last[k]-first[k] for k in COUNTERS},'telescoping totals');eq(totals,summary['after']['totalCounters'],'published totals')
eq(totals['originalBytesRead']+totals['thumbnailBytesRead'],totals['bytesRead'],'purpose bytes sum')
eq(totals['originalReadOperations']+totals['thumbnailReadOperations'],totals['readOperations'],'purpose reads sum')
eq(last['peakReadBlock'],65536,'peak block');eq(last['activeLeases'],6,'final leases');eq(last['activeStreams'],0,'final streams')
eq(last['cacheBytes'],116440314,'cache bytes');eq(last['cacheFiles'],178,'cache files')
assert not any(x['command']=='read_attachment' for x in trace+ipc)
passed('949 source calls paired with1898 IPC events;21 required metric checkpoints and all phase counter sums match')
# Reconstruct derivatives from actual grants and frozen size map, NOT metric deltas.
grants=[x for x in trace if x['command']=='acquire_attachment_source'];seen=set();logical=published_output=hits=failures=0
trace_phases=collections.defaultdict(collections.Counter)
for row in grants:
    if row.get('purpose')!='thumbnail': continue
    key=(row['attachmentId'],row['pixels'])
    q=trace_phases[row['phase']]
    if not row['ok']:
        failures+=1;logical+=attachments[row['attachmentId']]['bytes']
        q['attempts']+=1;q['input']+=attachments[row['attachmentId']]['bytes']
    elif key in seen: hits+=1;q['hits']+=1
    else:
        seen.add(key);logical+=attachments[row['attachmentId']]['bytes'];published_output+=row['registeredBytes']
        q['attempts']+=1;q['gen']+=1;q['input']+=attachments[row['attachmentId']]['bytes'];q['output']+=row['registeredBytes']
eq(len(seen),totals['thumbnailGenerations'],'unique successful cache keys');eq(hits,totals['thumbnailHits'],'repeat successful keys')
eq(len(seen)+failures,totals['thumbnailGenerationAttempts'],'first-success+failed attempts')
eq(logical,totals['thumbnailSourceLogicalBytes'],'attempt logical input from frozen sizes');eq(published_output,totals['thumbnailOutputBytes'],'published output from unique grants')
for phase in calculated['after']:
    for key,field in [('attempts','thumbnailGenerationAttempts'),('gen','thumbnailGenerations'),('hits','thumbnailHits'),('input','thumbnailSourceLogicalBytes'),('output','thumbnailOutputBytes')]:
        eq(trace_phases[phase['name']][key],phase['counters'][field],phase['name']+' independent trace '+key)
passed('independent grant cache-key and frozen-size reconstruction:391 attempts/178gen/175hit/388726486 logical input/116440314 output')
def category(a):
    if not a:return 'unmapped'
    return 'svg' if a['mime']=='image/svg+xml' else 'raster' if a['mime'].startswith('image/') else 'audio' if a['mime'].startswith('audio/') else 'video' if a['mime'].startswith('video/') else 'file'
coverage={}
for kind in ['raster','svg','audio','video','file','unmapped']:
    population=[x for x in attachments.values() if category(x)==kind];g=[x for x in grants if category(attachments.get(x['attachmentId']))==kind]
    observed={x['attachmentId'] for x in g};success={x['attachmentId'] for x in g if x['ok']};failed={x['attachmentId'] for x in g if not x['ok']}
    value=dict(registeredSamples=len(population),acquireRequests=len(g),successfulAcquires=sum(x['ok'] for x in g),uniqueAttemptedAttachments=len(observed),uniqueSuccessfulAttachments=len(success),uniqueFailedOnlyAttachments=len(failed-success),unattemptedSamples=len(population)-len(observed),errors=dict(collections.Counter(x.get('error','unknown') for x in g if not x['ok'])))
    for k,v in value.items():eq(v,summary['after']['coverage'][kind][k],'coverage '+kind+':'+k)
    def traffic(http):
        known=[x['encodedDataLength'] for x in http if isinstance(x.get('encodedDataLength'),(float,int)) and x['encodedDataLength']>=0]
        return dict(httpRequests=len(http),httpEncodedBytesIncludingHeaders=None if len(http)!=len(known) else sum(known),httpKnownEncodedBytesIncludingHeaders=sum(known),httpUnknownEncodedLengthRequests=len(http)-len(known))
    http=[x for x in network if x['kind']=='loopback-media' and category(attachments.get(x.get('attachmentId')))==kind]
    for k,v in traffic(http).items():eq(v,summary['after']['coverage'][kind][k],kind+' network '+k)
    value.update(traffic(http));value['byPurpose']={}
    for purpose in ['original','thumbnail']:
        selected=[x for x in g if x['purpose']==purpose]
        success_ids={x['attachmentId'] for x in selected if x['ok']};observed_ids={x['attachmentId'] for x in selected};failed_ids={x['attachmentId'] for x in selected if not x['ok']}
        sub=dict(acquireRequests=len(selected),successfulAcquires=sum(x['ok'] for x in selected),uniqueAttemptedAttachments=len(observed_ids),uniqueSuccessfulAttachments=len(success_ids),uniqueFailedOnlyAttachments=len(failed_ids-success_ids),unattemptedSamples=len(population)-len(observed_ids),errors=dict(collections.Counter(x.get('error','unknown') for x in selected if not x['ok'])))
        sub.update(traffic([x for x in http if x.get('purpose')==purpose]));eq(sub,summary['after']['coverage'][kind]['byPurpose'][purpose],kind+' purpose '+purpose)
        value['byPurpose'][purpose]=sub
    coverage[kind]=value
unmapped=[x for x in network if x['kind']=='loopback-media' and not x.get('attachmentId')]
eq(len(unmapped),7,'unmapped network');assert all(x.get('mime')=='image/svg+xml' and x.get('encodedDataLength')==0 for x in unmapped)
unknown=[x for x in network if x['kind']=='loopback-media' and x.get('encodedDataLength') is None]
eq(len(unknown),sum(x['httpUnknownEncodedLengthRequests'] for x in summary['after']['coverage'].values()),'unknown encoded lengths')
legacy=[x for x in lines(BEFORE/'transport.jsonl') if x.get('event')=='end' and x['command']=='read_attachment']
eq(len(legacy),1917,'baseline reads');eq(sum(x.get('originalBytes',0) for x in legacy),2608262764,'baseline IPC bytes')
eq(len({x['attachmentId'] for x in legacy}),503,'baseline coverage')
for p in calculated['before']:
    reads=[x for x in legacy if x['phase']==p['name']]
    recorded=next(x for x in summary['before']['phases'] if x['name']==p['name'])
    eq(len(reads),recorded['legacyReads'],'baseline phase reads');eq(sum(x.get('originalBytes',0) for x in reads),recorded['legacyOriginalIPCBytes'],'baseline phase bytes')
passed('coverage independently counted;baseline1917 reads/2608262764B/all503;7 unmapped zero-encoded SVG events remain unattributed')
media={}
for name in ['audio-90min','video-faststart','video-tail']:
    value=read(AFTER/(name+'.json'));eq(value,summary['after']['media'][name]['after'],name+' result copy')
    eq(value['ok'],True,name+' ok');eq(value['activation']['beforeOriginalAcquires'],0,name+' preactivation');eq(value['activation']['afterOriginalAcquires'],1,name+' activation')
    eq(value['duration'],5400 if name=='audio-90min' else 96,name+' duration');eq(value['playing'],True,name+' auto progression')
    eq(value['seek']['target'],value['duration']*.9,name+' target');assert value['seek']['advanced']>value['seek']['target'];eq(value['seek']['error'],None,name+' seek error')
    events=[x for x in grants if x['attachmentId']==value['attachmentId'] and x['purpose']=='original'];eq(len(events),1,name+' actual original count');eq(events[0]['phase'],name,name+' phase')
    media[name]=value
result=read(AFTER/'result.json');eq(result['failures'],[],'runner failures');eq(result['pageErrors'],[],'page errors');eq(result['completedPhaseCount'],10,'completed')
eq(result['sourceUnchanged'],True,'product identity unchanged')
runner=AFTER/'measured-runner.mjs';eq(sha(runner),config['after']['toolSources']['run-media.mjs'],'measured runner hash')
for path,h in config['after']['toolSources'].items():eq(sha(ROOT/'scripts/performance'/path),h,'after tool source '+path)
passed('three saved real media outcomes,one activation original each,full durations and90% seek advancement;runner and source hashes match')
report={'ok':True,'reviewScope':'Independent read-only raw-data audit; not a performance rerun or whole product acceptance. No original sample rescan or old-baseline identity-on-new-source audit.',
'checks':checks,'phases':calculated,'totalCounters':totals,'grantReconstruction':dict(generations=len(seen),hits=hits,failedAttempts=failures,logicalInput=logical,output=published_output),
'tracePhaseReconstruction':dict(trace_phases),'coverage':coverage,'unmappedNetworkEvents':unmapped,'unknownEncodedLengthRequests':len(unknown),'media':media,'fixtureMetadataSHA256':fixture_hashes,'rawSHA256':raw_hashes,
'limitations':['281 raster lack backend acquire; no frontend queued-withdraw reason log.','50 SVG all unsupported; mixed RSS is not equal-function450-raster-only result.','scroll2 has70 new generations,not fully warm.','6 final leases/0streams;release rows lack lease identity,owner inventory unreconstructable.','7 unmapped SVG encoded0 remain unattributed; canceled HTTP unknown encoded lengths stay unknown.','Counter source reads/logical generation input/encoded output/network sizes are distinct;not physical IO.','StrictMode debug Chrome+Rust harness,not Mac Tauri/Android packages or device RSS.']}
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'ok':True,'checks':len(checks),'totals':totals,'output':str(OUT)},ensure_ascii=False))
