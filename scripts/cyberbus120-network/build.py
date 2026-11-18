#!/usr/bin/env python3
"""Build without copying or modifying core; share core target and Cargo's lock."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import evidence

HERE = Path(__file__).resolve().parent

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--core', type=Path, default=HERE.parents[1] / 'crates/notes-cyberbus')
    p.add_argument('--target-dir', type=Path)
    args = p.parse_args()
    core = args.core.resolve()
    if not (core / 'Cargo.toml').is_file():
        p.error('core is not integrated; supply --core with its read-only checkout')
    if core != (evidence.REPO/'crates/notes-cyberbus').resolve():
        p.error('source closure requires the integrated core checkout')
    build = HERE / '.build'
    build.mkdir(exist_ok=True)
    manifest = (HERE / 'Cargo.toml').read_text().replace(
        '"../../crates/notes-cyberbus"', json.dumps(str(core))).replace(
        'path = "node.rs"', 'path = ' + json.dumps(str(HERE / 'node.rs')))
    (build / 'Cargo.toml').write_text(manifest)
    lock = HERE / 'Cargo.lock'
    if lock.exists():
        (build / 'Cargo.lock').write_bytes(lock.read_bytes())
    source_hash=hashlib.sha256((HERE / 'node.rs').read_bytes()).hexdigest()
    core_revision=subprocess.check_output(['git','-C',str(evidence.REPO),'log','-1','--format=%H','--',
        'crates/notes-cyberbus','vendor/cyberbus'],text=True).strip()
    digest=hashlib.sha256()
    for path in sorted((core/'src').rglob('*.rs')):
        digest.update(str(path.relative_to(core)).encode()+b'\0'+path.read_bytes())
    # Bind the local Rust/Backend/production source superset and controller to this binary.
    # External dependency content is separately pinned by Cargo.lock checksums/revisions.
    entries=[{'path':str(p.relative_to(evidence.REPO)),'sha256':evidence.sha(p)} for p in evidence.sources()]
    env = dict(os.environ, CARGO_TARGET_DIR=str(args.target_dir or core / 'target'),
               CYBERBUS_HARNESS_SOURCE_SHA256=source_hash,
               CYBERBUS_HARNESS_CORE_REVISION=core_revision,
               CYBERBUS_HARNESS_LOCAL_CLOSURE_SHA256=evidence.aggregate(entries),
               CYBERBUS_HARNESS_CORE_SHA256=digest.hexdigest())
    result = subprocess.run(['cargo', 'build', '--manifest-path', str(build / 'Cargo.toml'), '-j', '2'], env=env)
    if result.returncode == 0:
        lock.write_bytes((build / 'Cargo.lock').read_bytes())
    return result.returncode

if __name__ == '__main__':
    raise SystemExit(main())
