"""Build an isolated fixture from exact committed source; no application edit."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--candidate', required=True)
parser.add_argument('--target-dir', required=True)
parser.add_argument('--protoc', required=True)
args = parser.parse_args()
candidate = Path(args.candidate).resolve()
fixture = Path(__file__).resolve().parent
sha = subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert sha == '0805281ed14775c713de48da02fdd35cabcce141'
source = subprocess.check_output(['git','show',f'{sha}:src-tauri/src/account/mod.rs'],cwd=candidate,text=True)
logout = source[source.index('    async fn logout(&self)'):source.index('    async fn start_device(')]
with tempfile.TemporaryDirectory(prefix='account121-logout-fixture-') as temporary:
    root = Path(temporary)
    (root/'src').mkdir()
    (root/'src/main.rs').write_text((fixture/'logout-probe.rs').read_text().replace('    // EXACT_LOGOUT_METHOD', logout))
    (root/'Cargo.toml').write_text('\n'.join([
        '[package]', 'name="account121-review-logout"', 'version="0.0.0"', 'edition="2021"',
        '[workspace]', '[dependencies]',
        'notes-cyberbus={path='+json.dumps(str(candidate/'crates/notes-cyberbus'))+'}',
        'tokio={version="1.48",features=["rt-multi-thread","macros"]}',
        '[profile.dev]', 'debug=0', '',
    ]))
    env = {**os.environ,'CARGO_TARGET_DIR':args.target_dir,'PROTOC':args.protoc,'CARGO_PROFILE_DEV_DEBUG':'0'}
    command = ['cargo','run','--offline','--manifest-path',str(root/'Cargo.toml')]
    result = subprocess.run(command,cwd=root,env=env,capture_output=True,text=True,timeout=180)
    (fixture/'logout-results.json').write_text(result.stdout)
    (fixture/'logout-stderr.log').write_text(result.stderr)
    print(json.dumps({'baseline':sha,'command':command,'exit':result.returncode}))
    print(result.stdout)
    if result.returncode:
        print(result.stderr[-3000:])
    raise SystemExit(result.returncode)
