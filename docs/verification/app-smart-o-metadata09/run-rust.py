#!/usr/bin/env python3
"""Bounded offline tests importing the production Store and Session modules."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
HARNESS = OUT / "harness"
TARGET = ROOT / "src-tauri/target"
OLD = [ROOT / "docs/verification" / name for name in (
    "app-smart-d2-durable-rules09", "app-smart-d2-durable-rules09-independent", "app-smart-d2-name-boundary-fix09")]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def sources():
    paths = [ROOT / "src-tauri/src" / name for name in ("store.rs", "session.rs", "lib.rs")]
    for name in ("store", "session"):
        paths.extend((ROOT / "src-tauri/src" / name).rglob("*"))
    return {str(p.relative_to(ROOT)): sha(p) for p in sorted(paths) if p.is_file()}

def sealed_evidence():
    # Do not follow the old harness symlinks into mutable production sources.
    result = {}
    for directory in OLD:
        for parent, dirs, files in os.walk(directory, followlinks=False):
            dirs[:] = sorted(d for d in dirs if not (Path(parent) / d).is_symlink())
            for name in sorted(files):
                path = Path(parent) / name
                if not path.is_symlink():
                    result[str(path.relative_to(ROOT))] = sha(path)
    return result

if shutil.disk_usage(ROOT).free < 2 * 1024**3:
    raise SystemExit("Less than 2 GiB available")
if not HARNESS.exists():
    (HARNESS / "src").mkdir(parents=True)
    previous = OLD[0] / "harness02"
    for name in ("Cargo.toml", "Cargo.lock"):
        shutil.copyfile(previous / name, HARNESS / name)
    for name in ("store.rs", "store", "session.rs", "session"):
        source = ROOT / "src-tauri/src" / name
        (HARNESS / "src" / name).symlink_to(source, target_is_directory=source.is_dir())
    (HARNESS / "src/main.rs").write_text("mod store;\nmod session;\nfn main() {}\n")
    (OUT / "docs").symlink_to(ROOT / "docs", target_is_directory=True)

attempt = OUT / sys.argv[1]
attempt.mkdir()  # Refuse to overwrite a previous attempt.
command = ["cargo", "test", "--bin", "notes-qa-fix-store", "--locked", "--offline", "--features", "rusqlite/hooks",
           "--manifest-path", str(HARNESS / "Cargo.toml")]
command += sys.argv[2:] + ["--", "--nocapture"]
record = {"sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
          "sourceBefore": sources(), "sealedEvidenceBefore": sealed_evidence(),
          "command": command, "cwd": str(ROOT), "target": str(TARGET), "jobs": 2,
          "timeoutSeconds": 600, "freeBefore": shutil.disk_usage(ROOT).free,
          "directProductionModules": True,
          "harnessFiles": {name: sha(HARNESS / name) for name in ("Cargo.toml", "Cargo.lock", "src/main.rs")}}
(attempt / "result.json").write_text(json.dumps(record, indent=2) + "\n")
env = dict(os.environ, CARGO_NET_OFFLINE="true", CARGO_BUILD_JOBS="2", CARGO_TARGET_DIR=str(TARGET))
start = time.monotonic()
try:
    with (attempt / "cargo-test.txt").open("xb") as log:
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
    code = result.returncode
except subprocess.TimeoutExpired:
    code = 124
record.update(exitCode=code, seconds=round(time.monotonic() - start, 3),
              sourceAfter=sources(), sealedEvidenceAfter=sealed_evidence(),
              freeAfter=shutil.disk_usage(ROOT).free)
record["sourceUnchanged"] = record["sourceBefore"] == record["sourceAfter"]
record["sealedEvidenceUnchanged"] = record["sealedEvidenceBefore"] == record["sealedEvidenceAfter"]
(attempt / "result.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({key: record[key] for key in (
    "exitCode", "seconds", "sourceUnchanged", "sealedEvidenceUnchanged", "freeAfter")}))
raise SystemExit(code)
