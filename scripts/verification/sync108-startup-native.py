#!/usr/bin/env python3
"""Owned native-process startup smoke; no UI driver, network API or SQL writes.

Run after `pnpm tauri build --debug --bundles app --ci --no-sign` with the
same CARGO_TARGET_DIR. Only fresh temporary workspaces and child PIDs are used.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import sqlite3
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    binary = args.app.resolve() / "Contents/MacOS/notes-clone"
    assert binary.is_file(), binary
    with open(args.app / "Contents/Info.plist", "rb") as file:
        identifier = plistlib.load(file)["CFBundleIdentifier"]
    platform_cache = Path.home() / "Library/Caches" / identifier
    report = {
        "boundary": "current native macOS processes; startup only, no UI/sync acceptance",
        "binary": str(binary),
        "binarySha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "sourceBase": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "startupSourcesSha256": {
            str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in map(Path, ["src-tauri/src/lib.rs", "src-tauri/src/startup.rs", "src-tauri/src/startup_tests.rs"])
        },
        "checks": [], "processes": [],
    }
    children = []
    owned_caches = set()
    with tempfile.TemporaryDirectory(prefix="sync108-native-") as scratch:
        scratch = Path(scratch)

        def rejected(arguments, code, marker):
            result = subprocess.run([str(binary), *arguments], capture_output=True, text=True, timeout=15)
            assert result.returncode == code, (arguments, result.returncode, result.stderr)
            assert "CyberNote startup rejected:" in result.stderr, result.stderr
            assert marker in result.stderr, result.stderr
            report["checks"].append({"case": arguments, "exit": result.returncode, "error": result.stderr.strip()})

        def launch(root):
            # Workspace::open canonicalizes an existing/created root before hashing.
            root.mkdir(mode=0o700, parents=True, exist_ok=True)
            root = root.resolve()
            key = hashlib.sha256(os.fsencode(root)).hexdigest()
            cache_parent = platform_cache / "workspaces" / key
            if cache_parent not in owned_caches:
                assert not cache_parent.exists(), "refuse to use a preexisting cache"
                owned_caches.add(cache_parent)
            cache = cache_parent / "attachment-thumbnails-v1"
            log = open(scratch / f"process-{len(children)}.log", "w+")
            process = subprocess.Popen([str(binary), "--data-dir", str(root)], stdout=log, stderr=log)
            record = {"pid": process.pid, "root": str(root), "mediaCache": str(cache), "exit": None}
            children.append((process, log, record))
            report["processes"].append(record)
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    log.seek(0)
                    raise AssertionError((process.returncode, log.read()))
                if (root / "notes.sqlite3").exists():
                    listing = subprocess.run(["lsof", "-nP", "-p", str(process.pid), "-Fn"], capture_output=True, text=True).stdout
                    if f"n{root}/notes.sqlite3\n" in listing and f"n{cache}\n" in listing and "127.0.0.1:" in listing:
                        record["openedSelectedSqlite"] = True
                        record["managedHttpListener"] = True
                        return process
                time.sleep(0.1)
            raise AssertionError(f"native startup timeout: {process.pid}")

        def stop(process):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            for child, _, record in children:
                if child is process:
                    record["exit"] = process.returncode
                    record["cleanup"] = "owned SIGTERM; waited for exit"

        try:
            for arguments in [["--data-dir"], ["--data-dir", ""], ["--data-dir", "relative"], ["--unknown"]]:
                rejected(arguments, 2, "argument" if arguments == ["--unknown"] else "absolute path")
            untouched = scratch / "must-not-exist"
            rejected(["--data-dir", str(untouched), "--data-dir", str(scratch / "other")], 2, "once")
            rejected(["--data-dir", str(untouched), "--unknown"], 2, "unknown")
            assert not untouched.exists()
            blocked = scratch / "blocked"
            blocked.write_text("not a directory")
            rejected(["--data-dir", str(blocked)], 1, "startup rejected")

            a, b = scratch / "desktop-a", scratch / "desktop-b"
            first, second = launch(a), launch(b)
            assert first.poll() is None and second.poll() is None
            assert first.pid != second.pid
            for root in [a, b]:
                key = hashlib.sha256(os.fsencode(root.resolve())).hexdigest()
                assert (platform_cache / "workspaces" / key / "attachment-thumbnails-v1").is_dir()
                assert not (root / ".cache").exists()
                assert root.stat().st_mode & 0o777 == 0o700
                assert (root / "attachments").stat().st_mode & 0o777 == 0o700
            rejected(["--data-dir", str(a)], 1, "already in use")
            alias = scratch / "alias-a"
            alias.symlink_to(a, target_is_directory=True)
            rejected(["--data-dir", str(alias)], 1, "already in use")
            inode = (a / "notes.sqlite3").stat().st_ino
            with sqlite3.connect(f"file:{a}/notes.sqlite3?mode=ro", uri=True) as db:
                schema = db.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").fetchall()
            stop(first)
            restarted = launch(a)
            assert restarted.pid != first.pid
            assert (a / "notes.sqlite3").stat().st_ino == inode
            with sqlite3.connect(f"file:{a}/notes.sqlite3?mode=ro", uri=True) as db:
                assert db.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").fetchall() == schema
            report["checks"].append({"case": "two native directories, isolated caches, same-dir and alias refusal, restart", "passed": True})
            report["passed"] = True
        finally:
            for process, log, _ in children:
                stop(process)
                log.close()
            for cache in owned_caches:
                if cache.exists():
                    shutil.rmtree(cache)
            report["ownedCachesRemoved"] = all(not cache.exists() for cache in owned_caches)
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": report.get("passed", False), "report": str(args.out), "processes": len(children)}))


if __name__ == "__main__":
    main()
