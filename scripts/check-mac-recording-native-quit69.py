#!/usr/bin/env python3
"""Compile the real ObjC bridge and exercise it without NSApplication/GUI/audio."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
cases = ["missing-app", "missing-delegate", "unknown-class", "unknown-method",
         "unknown-signature", "worker-thread", "missing-callback", "refresh-exception",
         "install-route", "exact-repeat", "conflicting-context", "changed-delegate",
         "changed-implementation", "callback-exception", "callback-error", "nested-request",
         "drop-during-callback", "repeated-quit", "drop-and-reinstall"]
with tempfile.TemporaryDirectory(prefix="notes-native-quit69-") as temporary:
    binary = Path(temporary) / "controlled-native69"
    command = ["clang", "-fobjc-arc", "-fobjc-arc-exceptions", "-fblocks", "-Wall", "-Wextra",
               "-Werror", "-mmacosx-version-min=12.0", "scripts/check-mac-recording-native-quit69.m",
               "-framework", "AppKit", "-framework", "Foundation", "-o", str(binary)]
    compile_result = subprocess.run(command, cwd=root, capture_output=True, text=True)
    (args.output / "native-compile.stdout.log").write_text(compile_result.stdout)
    (args.output / "native-compile.stderr.log").write_text(compile_result.stderr)
    if compile_result.returncode:
        raise SystemExit(compile_result.stderr)
    results = []
    for case in cases:
        result = subprocess.run([str(binary), case], capture_output=True, text=True, timeout=15)
        (args.output / f"native-{case}.stdout.log").write_text(result.stdout)
        (args.output / f"native-{case}.stderr.log").write_text(result.stderr)
        if result.returncode:
            raise SystemExit(f"{case}: {result.returncode}\n{result.stdout}\n{result.stderr}")
        results.append(json.loads(result.stdout))
    sources = ["plugins/tauri-plugin-notes-ui/macos/termination.m",
               "scripts/check-mac-recording-native-quit69.m", "scripts/check-mac-recording-native-quit69.py"]
    report = {"status": "PASS", "groups": len(results), "results": results,
              "boundary": "controlled Foundation host/delegate; production bridge except NSApp lookup; no GUI/audio/terminate",
              "sources": {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in sources}}
    (args.output / "native-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "groups": len(results)}))
