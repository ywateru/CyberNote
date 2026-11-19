#!/usr/bin/env python3
"""Run the production replacement helper ONLY against temporary fake apps.
The opener is inert. A fake sleep accelerates timeout; mv failure injection
exercises both rollback paths. No /Applications or user app/data are used.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[3]
helper = root / 'src-tauri/src/software_update/replace.sh'
checks = []
for case in ['success', 'open_failure', 'ack_timeout', 'stage_move_failure', 'rollback_failure', 'changed_live', 'changed_stage', 'abort', 'symlink_target', 'exit_veto']:
    with tempfile.TemporaryDirectory(prefix='cybernote-update-replace-proof-') as tmp:
        base = Path(tmp)
        work = base / 'private staging'
        work.mkdir()
        target = base / 'CyberNote $() space.app'
        stage = work / 'CyberNote.app'
        backup = base / 'old.app'
        for app, data in [(target, b'old fixture'), (stage, b'new fixture')]:
            (app / 'Contents/MacOS').mkdir(parents=True)
            (app / 'Contents/MacOS/fixture').write_bytes(data)
        live_hash = hashlib.sha256(b'old fixture').hexdigest()
        stage_hash = hashlib.sha256(b'new fixture').hexdigest()
        bin_dir = base / 'bin'
        bin_dir.mkdir()
        (bin_dir / 'sleep').symlink_to('/usr/bin/true')
        opener = base / 'inert-opener'
        opener.write_text(f'''#!{sys.executable}
import os
from pathlib import Path
work=Path(os.environ['PROOF_WORK'])
body=(Path(__import__('sys').argv[2])/'Contents/MacOS/fixture').read_bytes()
with (work/'opens').open('ab') as f: f.write(body+b'\\n')
if body==b'new fixture':
 if os.environ['PROOF_CASE']=='open_failure': raise SystemExit(1)
 if os.environ['PROOF_CASE']!='ack_timeout': (work/'ack').write_text('fixture initialized')
''')
        opener.chmod(0o700)
        mover = bin_dir / 'mv'
        mover.write_text(f'''#!{sys.executable}
import os,sys
case=os.environ['PROOF_CASE']
if case in ['stage_move_failure','rollback_failure'] and sys.argv[1]==os.environ['PROOF_STAGE']: raise SystemExit(1)
if case=='rollback_failure' and sys.argv[1]==os.environ['PROOF_BACKUP']: raise SystemExit(1)
os.execv('/bin/mv',['mv']+sys.argv[1:])
''')
        mover.chmod(0o700)
        if case == 'changed_live':
            (target / 'Contents/MacOS/fixture').write_bytes(b'intervening edit')
        if case == 'changed_stage':
            (stage / 'Contents/MacOS/fixture').write_bytes(b'intervening edit')
        if case == 'abort':
            (work / 'abort').touch()
        if case == 'symlink_target':
            real = base / 'real.app'
            target.rename(real)
            target.symlink_to(real, target_is_directory=True)
        env = dict(os.environ, PATH=f'{bin_dir}:/usr/bin:/bin', PROOF_WORK=str(work), PROOF_CASE=case, PROOF_STAGE=str(stage), PROOF_BACKUP=str(backup))
        result = subprocess.run(['/bin/sh', str(helper), str(os.getpid() if case == 'exit_veto' else 2 ** 30), str(stage), str(target), str(backup), str(work), 'fixture', live_hash, str(opener), stage_hash], env=env, capture_output=True, timeout=20)
        phase = (work / 'phase').read_text().strip()
        if case == 'success':
            assert result.returncode == 0 and phase == 'complete'
            assert (target / 'Contents/MacOS/fixture').read_bytes() == b'new fixture'
            assert (backup / 'Contents/MacOS/fixture').read_bytes() == b'old fixture'
        elif case in ['open_failure', 'ack_timeout']:
            assert result.returncode != 0 and phase == 'recovery_required', (case,phase,result.stderr)
            assert (target / 'Contents/MacOS/fixture').read_bytes() == b'new fixture'
            assert (backup / 'Contents/MacOS/fixture').read_bytes() == b'old fixture'
            assert (work/'opens').read_bytes() == b'new fixture\n'
        elif case == 'stage_move_failure':
            assert result.returncode != 0 and phase == 'rolled_back', (case, phase, result.stderr)
            assert (target / 'Contents/MacOS/fixture').read_bytes() == b'old fixture'
            if case != 'stage_move_failure':
                assert (work / 'failed.app/Contents/MacOS/fixture').read_bytes() == b'new fixture'
        elif case == 'exit_veto':
            assert result.returncode != 0 and phase == 'cancelled'
            assert (target / 'Contents/MacOS/fixture').read_bytes() == b'old fixture'
            assert not backup.exists()
        elif case == 'rollback_failure':
            assert result.returncode != 0 and phase == 'rollback_failed'
            assert (backup / 'Contents/MacOS/fixture').read_bytes() == b'old fixture'
            assert not target.exists()
        else:
            assert result.returncode != 0 and phase == 'unchanged', (case, phase)
            assert not backup.exists()
            assert (target / 'Contents/MacOS/fixture').read_bytes() == (b'intervening edit' if case == 'changed_live' else b'old fixture')
        checks.append({'case': case, 'phase': phase})
print(json.dumps({'checks': checks, 'boundary': 'Temporary fake bundles and inert opener only; no installed application was replaced.'}, indent=2))
