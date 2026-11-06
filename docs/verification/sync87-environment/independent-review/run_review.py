from pathlib import Path
import datetime, gzip, hashlib, importlib.util, json, os, shlex, stat, subprocess, time
from types import SimpleNamespace
from unittest.mock import Mock, patch

W=Path('/private/tmp/apple-notes-sync87-environment')
OUT=Path('/private/tmp/sync87-environment-independent-review-01')
E=W/'docs/verification/sync87-environment'; K=E/'key-link-repair'
R=Path('/private/tmp/apple-notes-sync87-environment-01')
SOURCE='62ca1cf0bb8faf05eadd79a873d8df227085b168'
HEAD='ba6ef94a3c27a4567bee4018356e51623a9b1f78'
SCRIPTS=['scripts/debug/sync87-environment/lifecycle.py','scripts/debug/sync87-environment/check_guards.py']
sha=lambda b:hashlib.sha256(b).hexdigest()
commands=[json.loads(x) for x in (OUT/'commands-first-run.jsonl').read_text().splitlines()]
def run(argv,name,expected=0):
    started=time.monotonic()
    p=subprocess.run(argv,cwd=W,capture_output=True,env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1'),timeout=60)
    (OUT/(name+'.stdout.txt')).write_bytes(p.stdout); (OUT/(name+'.stderr.txt')).write_bytes(p.stderr)
    commands.append(dict(argv=argv,cwd=str(W),natural_exit=p.returncode if p.returncode>=0 else None,signal=-p.returncode if p.returncode<0 else None,wall_seconds=round(time.monotonic()-started,6),stdout_file=name+'.stdout.txt',stderr_file=name+'.stderr.txt'))
    (OUT/'commands.jsonl').write_text(''.join(json.dumps(c)+'\n' for c in commands))
    assert p.returncode==expected,(argv,p.returncode,p.stderr.decode())
    return p.stdout

def fp():
    return {p:sha((W/p).read_bytes()) for p in SCRIPTS}
before=fp()
head=run(['git','rev-parse','HEAD'],'01-head').decode().strip(); assert head==HEAD
assert run(['git','status','--porcelain=v1'],'02-clean')==b''
for p in SCRIPTS:
    assert sha(run(['git','show',SOURCE+':'+p],'03-'+Path(p).stem+'-frozen'))==before[p]
# Reuse the single successful independent guard run; no guard or emulator rerun.
assert b'Ran 17 tests' in (OUT/'04-guards.stderr.txt').read_bytes()

checks=[]
def manifest(path,base,historical=None):
    rows=[]
    for line in path.read_text().splitlines():
        expected,name=line.split('  ',1); target=base/name
        assert target.resolve().is_relative_to(base.resolve())
        if historical:
            actual=sha(subprocess.run(['git','show',historical+':'+str(target.relative_to(W))],cwd=W,check=True,capture_output=True).stdout)
        else: actual=sha(target.read_bytes())
        assert actual==expected,(path,name,actual,expected)
        rows.append(name)
    checks.append(dict(manifest=str(path.relative_to(W)),entries=len(rows),historical_commit=historical,passed=True))
    return rows
manifest(E/'files.sha256',E)
manifest(K/'files.sha256',K)
old_names=manifest(K/'previous-files.sha256',E,'b16a4524')
old_unchanged=[]
for name in old_names:
    if name=='README.md': continue
    original=subprocess.run(['git','show','b16a4524:docs/verification/sync87-environment/'+name],cwd=W,capture_output=True,check=True).stdout
    assert (E/name).read_bytes()==original,name
    old_unchanged.append(name)

events=[json.loads(x) for x in (K/'owned-events.jsonl').read_text().splitlines()]
previous=(E/'owned-events.jsonl').read_bytes(); assert (K/'owned-events.jsonl').read_bytes().startswith(previous)
starts=[x for x in events if x['kind']=='emulator_started']; exits=[x for x in events if x['kind']=='emulator_exit']; ready=[x for x in events if x['kind']=='ready']
assert len(starts)==3 and len(exits)==3 and len(ready)==1
assert all(x['serial']=='emulator-5584' and x['avd']=='notes-sync87-isolated' and x['root']==str(R) for x in starts+exits+ready)
assert all(x['emulator_natural_exit']==0 and x['emulator_signal'] is None for x in exits)
assert ready[0]['ready_wall_seconds']==18.751 and ready[0]['sdk']=='30' and ready[0]['abi']=='arm64-v8a'
allowed={('emu','avd','name'),('get-state',),('shell','getprop','sys.boot_completed'),('shell','getprop','ro.build.version.sdk'),('shell','getprop','ro.product.cpu.abi'),('emu','kill')}
adb=[]; versions=[]
for event in events:
    if event['kind']!='command':continue
    argv=event['argv']
    if Path(argv[0]).name=='adb':
        if argv[1:]==['version']: versions.append(event);continue
        assert argv[1:3]==['-s','emulator-5584'] and tuple(argv[3:]) in allowed,argv
        adb.append(event)
assert len(adb)==366
assert all('-no-audio' in x['argv'] and '-no-snapshot' in x['argv'] and x['argv'][x['argv'].index('-data')+1]==str(R/'data/userdata-qemu.img') for x in starts)
assert not [x for x in events if x['kind']=='signal_sent']
for x in [x for x in events if x['kind']=='owned_awake_exit']: assert x['natural_exit'] is None and x['signal']==15
kernel=[]
for p in sorted(E.glob('emulator-*.gz'))+[K/'emulator-20261106T080900.log.gz']:
    text=gzip.decompress(p.read_bytes()).decode(errors='replace')
    import re
    row=dict(file=str(p.relative_to(W)),missing_super=text.count('realpath failed: /dev/block/by-name/super'),init_fatal=text.count('init: InitFatalReboot:'),boot_devices=sorted(set(re.findall(r'androidboot.boot_devices=([^\s]+)',text))))
    kernel.append(row)
assert kernel[1]['missing_super']==33 and kernel[1]['init_fatal']==33
assert kernel[2]['missing_super']==0 and kernel[2]['init_fatal']==0 and kernel[2]['boot_devices']==['a003600.virtio_mmio']
oldcmd=[json.loads(x) for x in (E/'commands.jsonl').read_text().splitlines()]
newcmd=[json.loads(x) for x in (K/'commands.jsonl').read_text().splitlines()]
cycles=[x for x in oldcmd+newcmd if len(x['argv'])>2 and x['argv'][2]=='cycle']
assert [x['natural_exit'] for x in cycles]==[2,2,0]
assert [x['wall_seconds'] for x in cycles]==[181.699,184.139,21.715]
# Read only this task's synthetic resource. Do not launch lifecycle or ADB.
paths=[R,R/'avd-home',R/'avd-home/notes-sync87-isolated.avd',R/'data',R/'android-user',R/'emulator-home',R/'tmp',R/'owner.json',R/'state.json',R/'events.jsonl',R/'lifecycle.lock',R/'data/userdata-qemu.img',R/'data/cache.img',R/'data/encryptionkey.img']
pathaudit=[]
for p in paths:
    s=p.lstat(); assert not stat.S_ISLNK(s.st_mode) and p.resolve(strict=True)==p
    pathaudit.append(dict(path=str(p),mode=oct(stat.S_IMODE(s.st_mode)),device=s.st_dev,inode=s.st_ino,logical_bytes=s.st_size,allocated_bytes=s.st_blocks*512))
key=R/'data/encryptionkey.img'; link=R/'avd-home/notes-sync87-isolated.avd/encryptionkey.img'
assert link.is_symlink() and os.readlink(link)==str(key) and link.samefile(key)
assert sha(key.read_bytes())=='522bd0b6a2c92e37de465059bb9487bb9597a9aae032b469a8ebe0b38146d8c3'
state=json.loads((R/'state.json').read_text()); owner=json.loads((R/'owner.json').read_text())
assert state==json.loads((K/'owned-state.json').read_text()) and state['status']=='stopped' and state['owner_token']==owner['token']
u_before=json.loads((K/'userdata-before.json').read_text()); u_after=json.loads((K/'userdata-after.json').read_text()); s=(R/'data/userdata-qemu.img').stat()
assert u_before==u_after and (s.st_dev,s.st_ino,s.st_size)==(u_after['device'],u_after['inode'],u_after['logical_bytes'])
primary=[]
for row in json.loads((K/'primary-source-hashes.json').read_text()):
    p=Path(row['local_path']); assert sha(p.read_bytes())==row['sha256']; primary.append(dict(path=str(p),sha256=row['sha256'],matches=True))
run(['/bin/ps','-p','97439,98641,1735,98599,1636','-o','pid=,lstart=,command='],'05-owned-pids-stopped',expected=1)
run(['/usr/sbin/lsof','-nP','-iTCP:5584','-iTCP:5585','-sTCP:LISTEN'],'06-new-ports-free',expected=1)
run(['df','-k','/private/tmp'],'07-disk')
run(['du','-sk',str(R)],'08-owned-allocation')
# Mock-only probes cover cleanup side effects without touching any process or resource.
spec=importlib.util.spec_from_file_location('independent_lifecycle',W/SCRIPTS[0]); life=importlib.util.module_from_spec(spec); spec.loader.exec_module(life)
probes=[]
with patch.object(life,'identity',side_effect=life.Refused('reused PID')),patch.object(life,'adb') as a,patch.object(life.os,'kill') as kill:
    try:life.stop_owned({'pid':123})
    except life.Refused:pass
    else:raise AssertionError('must refuse stale identity')
    a.assert_not_called();kill.assert_not_called();probes.append('stale identity refuses all cleanup side effects')
with patch.object(life,'identity',side_effect=[None,life.Refused('identity changed')]),patch.object(life,'adb',side_effect=life.Refused('console unavailable')),patch.object(life.os,'kill') as kill,patch.object(life,'emit'):
    try:life.stop_owned({'pid':123})
    except life.Refused:pass
    else:raise AssertionError('must recheck identity before fallback signal')
    kill.assert_not_called();probes.append('fallback signal requires fresh matching identity')
for code in (0,-15):
    teststate={'pid':123}; child=Mock();child.poll.return_value=code;child.returncode=code
    with patch.object(life,'identity') as identity,patch.object(life.os,'kill') as kill,patch.object(life,'save_state'),patch.object(life,'emit'):
        life.stop_owned(teststate,child);identity.assert_not_called();kill.assert_not_called()
    assert teststate['emulator_natural_exit']==(0 if code==0 else None) and teststate['emulator_signal']==(15 if code==-15 else None)
    probes.append('already exited child code '+str(code)+' preserves natural/signal accounting')
after=fp();assert before==after
result=dict(status='PASS_ENVIRONMENT_READY_ONLY',time_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),reviewed_head=head,source_commit=SOURCE,source_fingerprint_before=before,source_fingerprint_after=after,manifests=checks,historical_files_preserved=len(old_unchanged),historical_readme_updated_only=True,events_old_prefix_preserved=True,events_total=len(events),targeted_adb_commands=len(adb),version_only_adb_commands=len(versions),new_review_device_commands=0,new_review_boots=0,starts=len(starts),emulator_exits=[x['emulator_natural_exit'] for x in exits],ready=ready[0],cycle_wrapper_records=cycles,kernels=kernel,owned_path_audit=pathaudit,key_link=dict(path=str(link),target=os.readlink(link),samefile=link.samefile(key),sha256=sha(key.read_bytes())),userdata_before=u_before,userdata_after=u_after,userdata_allocation_note='base userdata allocated_bytes unchanged in before/after; total directory allocation grew, exact responsible file not proven by these snapshots',primary_sources=primary,independent_cleanup_mock_probes=probes)
(OUT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(status=result['status'],manifest_entries=[x['entries'] for x in checks],historical_files_preserved=len(old_unchanged),guards=17,cleanup_mock_probes=len(probes),targeted_adb_commands=len(adb),new_review_device_commands=0,new_review_boots=0,source_unchanged=before==after)))
