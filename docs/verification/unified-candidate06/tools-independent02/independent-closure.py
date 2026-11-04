"""Independent exception/rename closure; only Python children and temporary fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
PREP = HERE.parent / 'preparation'
sys.path.insert(0, str(PREP))
import common as c
spec = importlib.util.spec_from_file_location('runner', PREP/'run-build.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def exception_group_cleanup():
    with tempfile.TemporaryDirectory(prefix='independent06-exception-') as tmp:
        root=Path(tmp).resolve(); marker=root/'child-ready'
        code='''import os,time
if os.fork()==0:
    open(%r,'w').write(str(os.getpid()))
    time.sleep(10)
else:
    time.sleep(10)
''' % str(marker)
        unrelated=subprocess.Popen([sys.executable,'-B','-c','import time;time.sleep(10)'],start_new_session=True)
        record={}; caught=None
        def free(path):
            available=c.check_space(path)
            if marker.exists(): raise ValueError('CONTROLLED monitor read failure')
            return available
        try:
            try:
                c.monitored([sys.executable,'-B','-c',code],root,os.environ.copy(),root/'command.txt',record,deadline=2,free=free,poll=.02)
            except ValueError as error:
                caught=repr(error)
            assert caught and record['ownedGroupStopped'] and record['remainingOwnedGroupMembers']==[],record
            assert unrelated.poll() is None
            return {'record':record,'caught':caught,'unrelatedAliveAfterCleanup':True}
        finally:
            unrelated.terminate(); unrelated.wait(timeout=5)
            if record.get('ownedProcessGroup'):
                try:os.killpg(record['ownedProcessGroup'],signal.SIGKILL)
                except ProcessLookupError:pass


def atomic_directory_identity():
    with tempfile.TemporaryDirectory(prefix='independent06-rename-') as tmp:
        root=Path(tmp).resolve(); attempt=root/'attempt';attempt.mkdir()
        a={'root':str(root),'stage':'mac'}
        app=runner.output_paths(a)[0][1];app.mkdir(parents=True)
        (app/'payload').write_text('same bytes')
        (app/'empty').mkdir(mode=0o750)
        (app/'inside-link').symlink_to('payload')
        dist=root/'dist';dist.mkdir();(dist/'index.html').write_text('same dist')
        before=runner.output_snapshot(app,'directory');result={}
        runner.isolate_outputs(a,attempt,result)
        assert not app.exists() and not dist.exists()
        preserved=attempt/'prior-outputs/application'
        assert runner.output_snapshot(preserved,'directory')==before
        assert (preserved/'empty').is_dir() and (preserved/'inside-link').read_text()=='same bytes'
        # No regenerated output must be rejected; retained prior bytes alone are insufficient.
        try:runner.generated_outputs(a,attempt,result['outputIsolation'])
        except RuntimeError as error:missing=repr(error)
        else:raise AssertionError('Missing new application accepted')
        return {'atomicPriorSnapshotEqual':True,'oldRootInodePreserved':before['inode']==preserved.stat().st_ino,
                'internalRelativeSymlinkAndEmptyDirectoryPreserved':True,'originalFixedPathsAbsent':True,
                'missingNewOutputRejected':missing}


out=HERE/'independent-closure-result.json'
result={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'exceptionGroupCleanup':exception_group_cleanup(),
        'atomicDirectoryIdentity':atomic_directory_identity(),
        'scope':'No actual build/version/Gradle/cargo/signing/GUI/target/cache. Temporary fake output paths only.'}
with out.open('x') as stream:json.dump(result,stream,ensure_ascii=False,indent=2);stream.write('\n')
print(json.dumps({'result':str(out),'status':'pass'}))
