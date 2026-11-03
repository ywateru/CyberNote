#!/usr/bin/env python3
"""Offline tests against symlinked production Store/Session, without Tauri UI builds.
The caller must hold exclusive use of CARGO_TARGET_DIR before invoking this.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
output = root / "artifacts/tags-rust"
harness = output / "harness"
if shutil.disk_usage(root).free < 2 * 1024**3:
    raise SystemExit("Less than 2 GiB available; no Rust output started.")
target = os.environ.get("CARGO_TARGET_DIR")
if not target or not Path(target).is_dir():
    raise SystemExit("Set CARGO_TARGET_DIR to an existing, exclusively released cache.")
(harness / "src").mkdir(parents=True, exist_ok=True)
for name in ("Cargo.toml", "Cargo.lock"):
    shutil.copyfile(root / "docs/verification/qa-fix-00/store-probes" / name, harness / name)
def link(path, destination):
    if path.is_symlink() and path.resolve() == destination.resolve():
        return
    if path.exists() or path.is_symlink():
        raise SystemExit(f"Refusing to replace unrelated harness path: {path}")
    path.symlink_to(destination)
for name in ("store.rs", "store", "session.rs", "session"):
    link(harness / "src" / name, root / "src-tauri/src" / name)
link(output / "docs", root / "docs")
(harness / "src/main.rs").write_text("mod store;\nmod session;\nfn main() {}\n")
command = ["cargo", "test", "--locked", "--offline", "--features", "rusqlite/hooks", "--manifest-path", str(harness / "Cargo.toml"), "--", "--nocapture"]
meta = {"sourceRoot": str(root), "target": target, "freeBefore": shutil.disk_usage(root).free, "command": command, "sources": {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in [root / "src-tauri/src/store.rs", root / "src-tauri/src/store/archive/document.rs", root / "src-tauri/src/session.rs"]}}
(output / "run-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
with (output / "store-session-tests.txt").open("wb") as log:
    result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
meta.update(exitCode=result.returncode, freeAfter=shutil.disk_usage(root).free)
(output / "run-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
print(f"Store/Session tests exit {result.returncode}; raw output: {output / 'store-session-tests.txt'}")
sys.exit(result.returncode)
