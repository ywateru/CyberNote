from pathlib import Path
import sys, shutil, subprocess, hashlib, json, time

assert len(sys.argv) == 4, 'build-probe.py SOURCE_ROOT FRESH_OUTPUT CARGO_TARGET_DIR'
root, out, target = (Path(p).resolve() for p in sys.argv[1:])
started = time.monotonic()
out.mkdir()
harness = out / 'harness'
harness.mkdir()
sources = [root / 'src-tauri/src/store.rs', root / 'src-tauri/src/session.rs']
for name in ['store', 'session']:
    sources.extend(p for p in (root / 'src-tauri/src' / name).rglob('*') if p.is_file())
sources.extend(root / 'scripts/debug/rust' / name for name in ['Cargo.toml', 'Cargo.lock', 'transport.rs'])
digest = lambda b: hashlib.sha256(b).hexdigest()
before = [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': digest(p.read_bytes())} for p in sorted(sources)]
for name in ['Cargo.toml', 'Cargo.lock', 'transport.rs']:
    shutil.copy2(root / 'scripts/debug/rust' / name, harness / name)
(harness / 'current').mkdir()
for name in ['store.rs', 'session.rs', 'store', 'session']:
    source, destination = root / 'src-tauri/src' / name, harness / 'current' / name
    if source.is_dir(): shutil.copytree(source, destination)
    else: shutil.copy2(source, destination)
transport = (harness / 'transport.rs').read_text()
anchor = '        "debug_access_finish" => {'
assert transport.count(anchor) == 1
arm = (Path(__file__).parent / 'finish-event-arm.rs.txt').read_text()
(harness / 'transport.rs').write_text(transport.replace(anchor, arm + '\n' + anchor))
manifest = (harness / 'Cargo.toml').read_text().replace('name = "notes-current-attachment-transport"', 'name = "notes-independent-data79-transport"')
(harness / 'Cargo.toml').write_text(manifest)
import os
env = dict(os.environ, CARGO_TARGET_DIR=str(target), CARGO_BUILD_JOBS='2')
argv = ['cargo', 'build', '--locked', '--offline', '--manifest-path', str(harness / 'Cargo.toml')]
began = time.monotonic()
p = subprocess.run(argv, cwd=root, env=env, capture_output=True)
(out / 'build.stdout.txt').write_bytes(p.stdout)
(out / 'build.stderr.txt').write_bytes(p.stderr)
result = {'root': str(root), 'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip(), 'target': str(target), 'inputs': before, 'command': argv, 'naturalExitCode': p.returncode, 'buildWallSeconds': time.monotonic() - began}
after = [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': digest(p.read_bytes())} for p in sorted(sources)]
result['sourceUnchanged'] = before == after
assert before == after
if p.returncode == 0:
    binary = out / 'notes-independent-data79-transport'
    shutil.copy2(target / 'debug/notes-independent-data79-transport', binary)
    result['binary'] = {'path': str(binary), 'bytes': binary.stat().st_size, 'sha256': digest(binary.read_bytes())}
result['completeWallSeconds'] = time.monotonic() - started
(out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k:v for k,v in result.items() if k != 'inputs'}, indent=2))
assert p.returncode == 0, 'see preserved build.stderr.txt'
