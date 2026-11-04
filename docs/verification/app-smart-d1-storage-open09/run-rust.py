#!/usr/bin/env python3
"""Offline direct production Store/Session harness; each test attempt is retained."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
output = Path(__file__).resolve().parent
harness = output / "harness02"
target = root / "src-tauri/target"
if shutil.disk_usage(root).free < 2 * 1024**3:
    raise SystemExit("Less than 2 GiB available")
if not harness.exists():
    (harness / "src").mkdir(parents=True)
    for name in ("Cargo.toml", "Cargo.lock"):
        shutil.copyfile(root / "docs/verification/qa-fix-00/store-probes" / name, harness / name)
    for name in ("store.rs", "store", "session.rs", "session"):
        source = root / "src-tauri/src" / name
        (harness / "src" / name).symlink_to(source, target_is_directory=source.is_dir())
    (harness / "src/main.rs").write_text("mod store;\nmod session;\nfn main() {}\n")
    if not (output / "docs").exists():
        (output / "docs").symlink_to(root / "docs", target_is_directory=True)
attempt = output / sys.argv[1]
if attempt.exists():
    raise SystemExit("Fresh attempt required; preserve prior failures")
attempt.mkdir()
sources = [root / "src-tauri/src/store.rs", root / "src-tauri/src/session.rs"]
sources += sorted((root / "src-tauri/src/store").rglob("*"))
sources += sorted((root / "src-tauri/src/session").rglob("*"))
def hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources if p.is_file()}
command = ["cargo", "test", "--locked", "--offline", "--features", "rusqlite/hooks", "--manifest-path", str(harness / "Cargo.toml")]
command += sys.argv[2:] + ["--", "--nocapture"]
env = dict(os.environ, CARGO_NET_OFFLINE="true", CARGO_BUILD_JOBS="2", CARGO_TARGET_DIR=str(target))
record = {"sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
          "sourceBefore": hashes(), "directProductionModules": True,
          "command": command, "cwd": str(root), "target": str(target), "jobs": 2,
          "freeBefore": shutil.disk_usage(root).free,
          "harness": {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in harness.rglob("*") if p.is_file()}}
(attempt / "result.json").write_text(json.dumps(record, indent=2) + "\n")
start = time.monotonic()
with (attempt / "cargo-test.txt").open("wb") as log:
    result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
record.update(exitCode=result.returncode, seconds=round(time.monotonic()-start, 3),
              sourceAfter=hashes(), freeAfter=shutil.disk_usage(root).free)
record["sourceUnchanged"] = record["sourceBefore"] == record["sourceAfter"]
(attempt / "result.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({k: record[k] for k in ["exitCode", "seconds", "sourceUnchanged", "freeAfter"]}))
raise SystemExit(result.returncode)
