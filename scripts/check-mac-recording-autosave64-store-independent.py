#!/usr/bin/env python3
"""Freeze and exercise exact backend source in an isolated offline native harness."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
expected = sys.argv[1]
run_name = sys.argv[2]
head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
if head != expected:
    raise SystemExit(f"Expected exact HEAD {expected}; observed {head}")
target = Path(os.environ["CARGO_TARGET_DIR"]).resolve()
if not target.is_dir():
    raise SystemExit("Existing exclusively allocated Cargo cache required")
if shutil.disk_usage(root).free < 2 * 1024**3:
    raise SystemExit("Less than 2 GiB free")
evidence = root / "docs/verification/mac-recording-autosave64-independent" / run_name
artifacts = root / "artifacts/mac-recording-autosave64-independent" / run_name
if evidence.exists() or artifacts.exists():
    raise SystemExit("Fresh attempt required; all old attempts remain untouched")
evidence.mkdir(parents=True)
harness = artifacts / "harness"
(harness / "src").mkdir(parents=True)
hash_bytes = lambda b: hashlib.sha256(b).hexdigest()
source_paths = sorted([root / "src-tauri/src/store.rs", root / "src-tauri/src/session.rs", *[p for d in ("store", "session") for p in (root / "src-tauri/src" / d).rglob("*") if p.is_file()]])
sources = {str(p.relative_to(root)): hash_bytes(p.read_bytes()) for p in source_paths}
for name in ("store.rs", "store", "session.rs", "session"):
    source = root / "src-tauri/src" / name
    destination = harness / "src" / name
    if source.is_dir():
        shutil.copytree(source, destination)
    else:
        shutil.copyfile(source, destination)
for name in ("Cargo.toml", "Cargo.lock"):
    data = (root / "docs/verification/qa-fix-00/store-probes" / name).read_bytes()
    (harness / name).write_bytes(data.replace(b"notes-qa-fix-store", b"notes-autosave64-independent-store"))
probe = root / "scripts/check-mac-recording-autosave64-store-independent.rs"
shutil.copyfile(probe, harness / "src/main.rs")
meta = {"expectedHead":expected,"observedHead":head,"sourceRoot":str(root),"target":str(target),"sources":sources,"probeSha256":hash_bytes(probe.read_bytes()),"runnerSha256":hash_bytes(Path(__file__).read_bytes()),"freeBefore":shutil.disk_usage(root).free,"commands":[],"claim":"Exact unchanged backend only; task 64 frontend not tested"}
def record():
    (evidence / "metadata.json").write_text(json.dumps(meta, indent=2)+"\n")
record()
env = dict(os.environ, CARGO_TARGET_DIR=str(target), CARGO_BUILD_JOBS="2")
build = ["cargo", "build", "--locked", "--offline", "--manifest-path", str(harness / "Cargo.toml")]
start = time.monotonic()
with (evidence / "build.txt").open("wb") as log:
    compiled = subprocess.run(build, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=180)
meta["commands"].append({"command":build,"exitCode":compiled.returncode,"elapsedSeconds":time.monotonic()-start})
record()
if compiled.returncode:
    raise SystemExit(compiled.returncode)
binary = target / "debug/notes-autosave64-independent-store"
meta["binary"] = {"path":str(binary),"sha256":hash_bytes(binary.read_bytes()),"size":binary.stat().st_size}
command = [str(binary), str(artifacts / "databases")]
start = time.monotonic()
run = subprocess.run(command, cwd=root, env=env, capture_output=True, timeout=60)
(evidence / "probe-stdout.txt").write_bytes(run.stdout)
(evidence / "probe-stderr.txt").write_bytes(run.stderr)
meta["commands"].append({"command":command,"exitCode":run.returncode,"elapsedSeconds":time.monotonic()-start})
meta["sourceHashesUnchanged"] = sources == {str(p.relative_to(root)):hash_bytes(p.read_bytes()) for p in source_paths}
meta["endingHead"] = subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()
meta["freeAfter"] = shutil.disk_usage(root).free
if run.returncode == 0:
    result = json.loads(run.stdout)
    (evidence / "result.json").write_text(json.dumps(result, indent=2)+"\n")
    meta["resultStatus"] = result["status"]
    meta["checkCount"] = result["checkCount"]
record()
if run.returncode:
    raise SystemExit(run.returncode)
assert meta["sourceHashesUnchanged"] and meta["endingHead"] == expected
print(json.dumps({"status":meta["resultStatus"],"checkCount":meta["checkCount"],"evidence":str(evidence),"binary":meta["binary"],"commands":meta["commands"]},indent=2))
