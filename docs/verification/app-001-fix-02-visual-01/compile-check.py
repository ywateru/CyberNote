#!/usr/bin/env python3
"""Compile the actual Objective-C inputs without Cargo, GUI, devices, or shared target."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent


def run(args):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    return {"argv": args, "exitCode": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr}


def fingerprint(path):
    content = path.read_bytes()
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}


sdk_result = run(["xcrun", "--show-sdk-path"])
if sdk_result["exitCode"]:
    raise SystemExit(sdk_result)
sdk = Path(sdk_result["stdout"].strip())
plugin = ROOT / "plugins/tauri-plugin-notes-ui"
inputs = [plugin / "macos" / name for name in ("toolbar.m", "format.m", "format.h")]
inputs += [plugin / "build.rs"]
inputs += [sdk / "System/Library/Frameworks/AppKit.framework/Headers" / name
           for name in ("NSButtonCell.h", "NSSearchFieldCell.h", "NSControl.h", "NSFont.h")]
before = [fingerprint(path) for path in inputs]
checks = []
with tempfile.TemporaryDirectory(prefix="notes-toolbar-visual-01-", dir="/private/tmp") as temp:
    for source in inputs[:2]:
        object_path = Path(temp) / (source.stem + ".o")
        check = run(["xcrun", "clang", "-arch", "arm64", "-isysroot", str(sdk),
                     "-fobjc-arc", "-fblocks", "-mmacosx-version-min=12.0",
                     "-Wall", "-Wextra", "-c", str(source), "-o", str(object_path)])
        if object_path.exists():
            check["temporaryObject"] = fingerprint(object_path)
        checks.append(check)
report = {
    "readAt": datetime.now(timezone.utc).isoformat(),
    "worktree": str(ROOT), "head": run(["git", "rev-parse", "HEAD"])["stdout"].strip(),
    "compiler": run(["xcrun", "clang", "--version"]),
    "sdk": sdk_result, "host": run(["uname", "-ms"]),
    "inputs": before,
    "inputAggregate": hashlib.sha256("".join(
        f"{entry['path']}\0{entry['sha256']}\n" for entry in before
    ).encode()).hexdigest(),
    "inputsUnchangedAfterCheck": before == [fingerprint(path) for path in inputs],
    "checks": checks,
    "scope": "Compile actual build.rs Objective-C translation units with ARC/blocks/minimum12. "
             "No Rust/frontend build, link, app launch, runtime interaction, or pixel validation. "
             "Temporary object directory was removed after recording its metadata."
}
(OUT / "compile-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"results": [item["exitCode"] for item in checks],
                  "inputAggregate": report["inputAggregate"],
                  "inputsUnchangedAfterCheck": report["inputsUnchangedAfterCheck"]}))
raise SystemExit(0 if all(check["exitCode"] == 0 for check in checks) else 1)
