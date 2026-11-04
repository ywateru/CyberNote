"""Read frozen evidence only. No device, database, platform tool or source mutation."""
from pathlib import Path
import hashlib,json,struct,datetime,shutil
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
SRC=ROOT/'docs/verification/candidate06-android-runtime-01'
checks=[]
def verify(name,ok,detail=None):
    checks.append({'name':name,'pass':bool(ok),**({'detail':detail} if detail is not None else {})})
    if not ok: raise AssertionError(name)
def load(path): return json.loads(path.read_text())
def identity(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return {'path':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':h.hexdigest()}
def raw_row(stdout,attachment=False):
    rows=[]
    for line in stdout.strip().splitlines():
        cols=[bytes.fromhex(v).decode() for v in line.split('|')]
        rows.append(dict(id=cols[0],**({'note_id':cols[1]} if attachment else {'folder_id':cols[1]}),body=json.loads(cols[2]),**({} if attachment else {'revision':int(cols[3])})))
    return rows
m=load(SRC/'manifest.json');mi=identity(SRC/'manifest.json')
verify('source manifest exact frozen SHA',mi['sha256']=='3cd7652013d0bb176859da53426bb4bd7cafdd76702ed26b91bd464268fd3de3')
records=[]
for x in m['files']:
    p=SRC/x['path'];v=identity(p)
    verify('source file '+x['path'],v['bytes']==x['bytes'] and v['sha256']==x['sha256']);records.append(x)
actual=sorted(str(p.relative_to(SRC)) for p in SRC.rglob('*') if p.is_file() and p.name!='manifest.json')
verify('exact source file set',actual==sorted(x['path'] for x in records))
aggregate=hashlib.sha256(''.join(x['sha256']+'  '+x['path']+'\n' for x in sorted(records,key=lambda x:x['path'])).encode()).hexdigest()
verify('source aggregate/count/bytes',aggregate==m['aggregateSha256']=='63c4ac0c48f6878be5ebd9d057907f6da9a680cc104b436361d3ec45a71a8664' and len(records)==m['fileCount']==56 and sum(x['bytes'] for x in records)==m['totalBytes']==1807834)
baseline_path=ROOT/'docs/verification/candidate04-android-runtime-01/66-final-store.json'
b=load(baseline_path);old_audio_path=ROOT/'docs/verification/candidate04-android-runtime-01/67-final-new-audio-device.json';ba=load(old_audio_path)
expected_notes=b['syntheticNotes']+[b['newNote']];expected_attachments=b['syntheticAttachments']+b['newAttachments'];expected_files=[b['syntheticAudio'],{'path':ba['remote'],'bytes':ba['bytes'],'sha256':ba['sha256']}]
verify('baseline limited fixed count',len(expected_notes)==4 and len(expected_attachments)==2)
stages=[]
for name in ['01-before-upgrade.json','03-after-upgrade.json','14-old-data-after-cold.json','24-final-old-data-package.json']:
    x=load(SRC/name);stages.append(x)
    verify(name+' selected complete notes baseline equality',x['selected']['notes']==expected_notes)
    verify(name+' selected complete attachment baseline equality',x['selected']['attachments']==expected_attachments)
    verify(name+' device-side audio file baseline equality',x['selected']['audioFiles']==expected_files)
    notes=[];attachments=[]
    for ev in x['events']:
        args=ev.get('args',[]);s=' '.join(args)
        if 'sqlite3' in s:
            verify(name+' bounded readonly SELECT', '-readonly' in s and 'SELECT hex(id)' in s and ' WHERE id=' in s and ev['exitCode']==0 and ev['stderr']=='')
            if ' FROM notes ' in s:notes+=raw_row(ev['stdout'])
            elif ' FROM attachments ' in s:attachments+=raw_row(ev['stdout'],True)
            else:raise AssertionError('unexpected query')
    verify(name+' raw hex output equals declared note rows',notes==x['selected']['notes'])
    verify(name+' raw hex output equals declared attachment rows',attachments==x['selected']['attachments'])
    for f in expected_files:
        stat=[ev for ev in x['events'] if ev.get('args')==['shell','run-as','com.local.notesclone','stat','-c','%s',f['path']]]
        sha=[ev for ev in x['events'] if ev.get('args')==['shell','run-as','com.local.notesclone','sha256sum',f['path']]]
        verify(name+' raw audio stat/hash '+f['path'],len(stat)==len(sha)==1 and stat[0]['exitCode']==sha[0]['exitCode']==0 and int(stat[0]['stdout'])==f['bytes'] and sha[0]['stdout'].split()[0]==f['sha256'])
    apk=x['installedApk'];raw_sha=[ev for ev in x['events'] if ev.get('args')==['shell','sha256sum',apk['path']]];raw_stat=[ev for ev in x['events'] if ev.get('args')==['shell','stat','-c','%s',apk['path']]]
    verify(name+' actual installed APK raw identity',len(raw_sha)==len(raw_stat)==1 and raw_sha[0]['exitCode']==raw_stat[0]['exitCode']==0 and raw_sha[0]['stdout'].split()[0]==apk['sha256'] and int(raw_stat[0]['stdout'])==apk['bytes'])
    fields=x['packageFields'];raw_package=[ev for ev in x['events'] if ev.get('args')==['shell','dumpsys','package','com.local.notesclone']]
    verify(name+' raw package user/install identity',len(raw_package)==1 and raw_package[0]['exitCode']==0 and all(k+'='+v in raw_package[0]['stdout'] for k,v in fields.items()))
verify('package retains user/first install across upgrade',all(x['packageFields']['userId']==stages[0]['packageFields']['userId']=='10169' and x['packageFields']['firstInstallTime']==stages[0]['packageFields']['firstInstallTime']=='2026-11-03 22:09:17' for x in stages))
p=load(SRC/'package-provenance.json');apk=identity(ROOT/p['apk']['path'])
verify('current host APK exact SHA/bytes',apk['bytes']==p['apk']['bytes']==177445114 and apk['sha256']==p['apk']['sha256']=='d773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4')
verify('installed candidate06 identity all after stages',all(x['installedApk']['bytes']==apk['bytes'] and x['installedApk']['sha256']==apk['sha256'] for x in stages[1:]))
verify('pre-upgrade candidate04 identity',stages[0]['installedApk']['bytes']==304110831 and stages[0]['installedApk']['sha256']=='bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2')
i=load(SRC/'02-install-replace.json')
verify('actual install -r exact candidate command result',i['command'][-3:]==['install','-r',str(ROOT/p['apk']['path'])] and i['command'][1:3]==['-s','emulator-5580'] and i['exitCode']==0 and 'Success' in i['stdout'])
prior=identity(ROOT/p['independentResult']['path']);verify('prior independent provenance result identity',prior['bytes']==p['independentResult']['bytes'] and prior['sha256']==p['independentResult']['sha256'])
verify('APK source remains f18 candidate06',p['sourceHead']=='f18da0ccf8bb6e131e80e22b9752f0df2725245d' and all(x['apkSourceHead']==p['sourceHead'] for x in stages))
new=[]
for name in ['08-tag-saved.json','13-tag-after-cold.json','25-final-tag-note.json']:
    x=load(SRC/name);new.append(x['note'])
    verify(name+' readonly query/raw full row',x['exitCode']==0 and x['stderr']=='' and '-readonly' in ' '.join(x['command']) and raw_row(x['stdout'])==[x['note']])
    verify(name+' exact new row identity/revision',x['note']['id']=='ce2884c3-841a-44d6-bfb3-615cf2e1ab84' and x['note']['revision']==x['note']['body']['revision']==82)
    verify(name+' actual noteTag mark',x['noteTagMarks']==[{'attrs':{'name':'QA06Tag'},'type':'noteTag'}])
verify('full new row identical save/cold/final',new[0]==new[1]==new[2])
verify('new body exact input text',new[0]['body']['plainText']=='QA-CANDIDATE06-ANDROID-RUNTIME-20261104A\nTag #QA06Tag \nPersisted via Android input')
a=load(SRC/'07-tag-typed-actions.json');texts=[x['args'][3] for x in a if x['args'][:3]==['shell','input','text']]
verify('actual input actions title/tag/body with Enter',texts==['QA-CANDIDATE06-ANDROID-RUNTIME-20261104A','Tag%s#QA06Tag%s','Persisted%svia%sAndroid%sinput'] and sum(x['args']==['shell','input','keyevent','66'] for x in a)==2 and all(x['exitCode']==0 for x in a))
cold=load(SRC/'12-tag-cold-relaunch-actions.json')
verify('force-stop then COLD restart actual actions',cold[0]['args']==['shell','am','force-stop','com.local.notesclone'] and cold[0]['exitCode']==0 and cold[1]['args']==['shell','am','start','-W','-n','com.local.notesclone/.MainActivity'] and cold[1]['exitCode']==0 and 'LaunchState: COLD' in cold[1]['stdout'])
verify('fresh PID after force-stop',a[-1]['stdout'].strip()=='16275' and cold[-1]['stdout'].strip()==stages[2]['pidof']==stages[3]['pidof']=='16712')
pngs=[]
for path in sorted(SRC.glob('*-actions.json')):
    actions=load(path)
    for ev in actions:
        if ev['args']==['exec-out','screencap','-p']:
            png=path.with_name(path.name.replace('-actions.json','.png'));v=identity(png);hdr=png.read_bytes()[:24]
            verify(path.name+' PNG linked to raw action',ev['exitCode']==0 and v['bytes']==ev['stdout']['bytes'] and v['sha256']==ev['stdout']['sha256'] and hdr[:8]==b'\x89PNG\r\n\x1a\n')
            pngs.append({'path':png.name,'width':struct.unpack('>I',hdr[16:20])[0],'height':struct.unpack('>I',hdr[20:24])[0]})
for name in ['06-new-note','09-back-list','10-note-list','11-tag-selected']:
    a=load(SRC/(name+'-actions.json'));verify(name+' original dump exit137 retained',any(x['args'][:3]==['shell','uiautomator','dump'] and x['exitCode']==137 for x in a) and '137' in (SRC/(name+'.dump-error.txt')).read_text())
verify('old attachment metadata has no recordedAt',all('recordedAt' not in x['body'] for x in expected_attachments))
verify('readme preserves limits',all(t in (SRC/'README.md').read_text() for t in ['137','为空白','强停冷启不等于正常进程退出','中文输入法','仍partial']))
# Recheck all frozen bytes after analysis.
verify('frozen manifest stable at end',identity(SRC/'manifest.json')==mi)
verify('source files stable at end',all(identity(SRC/x['path'])['sha256']==x['sha256'] for x in records))
result={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'conclusion':'SUPPORTED LIMITED OBSERVATIONS; overall acceptance remains partial','sourceManifest':mi,'sourceAggregate':aggregate,'sourceCount':56,'sourceBytes':1807834,'assertionsPassed':len(checks),'checks':checks,'baselineIdentities':[identity(baseline_path),identity(old_audio_path)],'currentHostApk':apk,'priorIndependentResult':prior,'pngDimensions':pngs,'newNote':{'id':new[0]['id'],'revision':new[0]['revision'],'fullRowEqual':True},'manualImageObservations':['07 shows system keyboard, entered ASCII title/body and gold #QA06Tag','11 and 16 each show #QA06Tag and exactly 1 note;17 opens the full entered text after cold start','04 and12 are blank early screens;05 and15 show loaded folders; no launch latency claim','21 card: 新录音 / 音频 · 1:06;23 card: 新录音 / 音频 · 26秒; no recording date visible; top note dates excluded'],'scope':'Read existing frozen JSON/XML/PNG/scripts and current preserved APK bytes only. No ADB, GUI, DB, platform tool, target, build, install or product edit. Actions and device identity are recorded evidence, not a newly witnessed live session. No new signature crypto verification, playback/recording, IME/preedit, normal quit, iOS or pixel acceptance.','freeBytesAfter':shutil.disk_usage(ROOT).free}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assertionsPassed':len(checks),'conclusion':result['conclusion'],'pngCount':len(pngs),'sourceAggregate':aggregate,'freeBytesAfter':result['freeBytesAfter']}))
