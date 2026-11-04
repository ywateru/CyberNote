#!/usr/bin/env python3
"""Only Python child processes and temporary output fixtures. No real build/sign/cache."""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch
import common as c

spec = importlib.util.spec_from_file_location('runner', Path(__file__).with_name('run-build.py'))
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)
spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-outputs.py'))
collector = importlib.util.module_from_spec(spec); spec.loader.exec_module(collector)


def child_after_leader(download=True):
    with tempfile.TemporaryDirectory(prefix='candidate06-fix-child-') as tmp:
        root=Path(tmp).resolve(); pidfile=root/'child.pid'
        code='''import os,time
pid=os.fork()
if pid:
    while not os.path.exists(%r):time.sleep(.005)
    os._exit(0)
print(%r,flush=True)
open(%r,'w').write(str(os.getpid()))
time.sleep(20)
''' % (str(pidfile), 'Downloading https://controlled.invalid' if download else 'CONTROLLED CHILD', str(pidfile))
        unrelated=subprocess.Popen([sys.executable,'-B','-c','import time;time.sleep(20)'],start_new_session=True)
        record={}; caught=None
        try:
            try:
                c.monitored([sys.executable,'-B','-c',code],root,os.environ.copy(),root/'command.txt',record,deadline=2,poll=.1)
            except RuntimeError as error:caught=repr(error)
            assert record['exitCode']==0 and record['stopReason']==('download-prompt' if download else 'orphaned-build-children'),record
            assert record['ownedGroupStopped'] and not record['remainingOwnedGroupMembers'],record
            assert record['terminationSignals'] and unrelated.poll() is None,record
            return {'record':record,'caught':caught,'unrelatedAlive':True,'log':(root/'command.txt').read_text()}
        finally:
            unrelated.terminate(); unrelated.wait(timeout=5)
            # Safety fallback touches only the just-created fixture group.
            if record.get('ownedProcessGroup'):
                try:os.killpg(record['ownedProcessGroup'],signal.SIGKILL)
                except (ProcessLookupError,PermissionError):pass


def provenance(stage, regenerate):
    with tempfile.TemporaryDirectory(prefix='candidate06-fix-provenance-') as tmp:
        root=Path(tmp).resolve();run=root/'docs/verification/unified-candidate06/controlled';run.mkdir(parents=True)
        a=dict(schema=1,stage=stage,root=str(root),sourceHead='a'*40,productAggregate='b'*64,
               productPaths=['src/a'],inputPaths=['src/a'],runDirectory=str(run),artifactDirectory=str(root/'artifacts/unified-candidate06/controlled'))
        old_app = root/('src-tauri/target/release/bundle/macos/备忘录.app/Contents/MacOS/notes-clone' if stage=='mac'
                        else 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk')
        old_app.parent.mkdir(parents=True);old_app.write_bytes(b'CONTROLLED IDENTICAL OUTPUT; NOT A REAL APPLICATION')
        old_dist=root/'dist/index.html';old_dist.parent.mkdir();old_dist.write_text('CONTROLLED IDENTICAL DIST')
        old_sha=c.sha_file(old_app);old_inode=old_app.stat().st_ino
        before={'at':'controlled','authorization':a,'aggregate':'c'*64,'effectiveBuildEnvironment':{},'supplementalInputs':{'controlled':True}}
        original_monitor=c.monitored;calls=[]
        code='from pathlib import Path\n'
        if regenerate:
            code+='p=Path(%r);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(%r)\n' % (str(old_app),old_app.read_bytes())
            code+='p=Path(%r);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(%r)\n' % (str(old_dist),old_dist.read_text())
        code+='print("CANDIDATE06_OFFLINE=true",flush=True)\n'
        def python_only(argv,cwd,env,log,result):
            calls.append({'requestedButNotExecuted':argv,'actual':[sys.executable,'-B','-c',code]})
            return original_monitor(calls[-1]['actual'],cwd,env,log,result,deadline=2,poll=.02)
        argv=['run-build.py','--authorization',str(root/'controlled.json'),'--freeze-sha256','d'*64,'--attempt','fresh' if regenerate else 'noop','--exclusive-target-and-cache']
        if stage=='android':argv.append('--allow-scoped-gradle-offline-init')
        cache=root/'controlled-cache';cache.mkdir()
        with patch.object(c,'authorization',return_value=a),patch.object(c,'frozen',return_value=before),patch.object(c,'capture',return_value=before),patch.object(c,'lock_build',return_value=contextlib.nullcontext()),patch.object(c,'monitored',side_effect=python_only),patch.object(c,'CACHE',cache),patch.object(sys,'argv',argv):
            try:runner.main()
            except SystemExit as error:exit_code=error.code
        attempt=run/(stage+'-'+('fresh' if regenerate else 'noop'))
        result=c.load(attempt/'result.json')
        prior=attempt/'prior-outputs/application'
        preserved_exe=prior/'Contents/MacOS/notes-clone' if stage=='mac' else prior
        assert c.sha_file(preserved_exe)==old_sha and preserved_exe.stat().st_ino==old_inode
        assert (attempt/'prior-outputs/dist/index.html').read_text()=='CONTROLLED IDENTICAL DIST'
        if regenerate:
            assert exit_code==0 and c.success(result),result
            assert c.sha_file(old_app)==old_sha and old_app.stat().st_ino!=old_inode
            collector.validate_built(a,before,'d'*64,attempt,result)
            old_dist.write_text('changed after build')
            try:collector.validate_built(a,before,'d'*64,attempt,result)
            except RuntimeError:pass
            else:raise AssertionError('Collector accepted changed generated output')
        else:
            assert exit_code==1 and not c.success(result) and not old_app.exists(),result
            try:collector.validate_built(a,before,'d'*64,attempt,result)
            except RuntimeError:pass
            else:raise AssertionError('Collector accepted no-op old output')
        return {'stage':stage,'regenerateIdenticalBytes':regenerate,'runnerExit':exit_code,'success':bool(c.success(result)),
                'priorBytesAndInodePreserved':True,'collectorProvenanceGateVerified':True,'result':result,'calls':calls}


def symlink_rejected():
    with tempfile.TemporaryDirectory(prefix='candidate06-fix-symlink-') as tmp:
        root=Path(tmp).resolve();outside=root/'outside';outside.write_text('untouched')
        bundle=root/'bundle';bundle.mkdir();(bundle/'external').symlink_to(outside)
        try:runner.output_snapshot(bundle,'directory')
        except RuntimeError:pass
        else:raise AssertionError('External output symlink accepted')
        assert outside.read_text()=='untouched'
        return {'externalSymlinkRejected':True,'externalBytesUntouched':True}


if __name__=='__main__':
    out=Path(sys.argv[1])
    if out.exists():raise RuntimeError('Refuse overwrite fix evidence')
    c.check_space(out.parent)
    result={'reviewCommit':'c4125411e09655eb14f6c1092e761d561403b798','sourceBase':'b5c0aef86edec3988691c73dfe5c83bd1dc0363f',
            'scope':'Pure Python/temporary fixtures only. Authorization/capture/lock isolated; requested pnpm never executed. No real target/cache/build/sign.'}
    try:
        result['leaderExitedChild']=child_after_leader()
        result['normalExitWithChild']=child_after_leader(download=False)
        result['provenance']=[provenance(stage,regenerate) for stage in ['mac','android'] for regenerate in [False,True]]
        result['symlink']=symlink_rejected()
        result['status']='pass'
    except BaseException as error:
        result['status']='fail';result['error']=repr(error)
        raise
    finally:c.record_new(out,result)
    print(json.dumps({'status':result['status'],'result':str(out)}))
