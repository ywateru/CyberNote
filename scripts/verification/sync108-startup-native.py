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
import signal
import sqlite3
import subprocess
import tempfile
import time


def stop_owned(process, record, term_timeout=10, kill_timeout=5):
    """Stop one owned child once; retain the first cleanup facts on repeat calls."""
    if "cleanup" in record:
        return record["cleanup"]
    before = process.poll()
    cleanup = {"preExitCode": before, "unexpectedExit": before is not None,
               "sentSignals": [], "forcedKill": False, "termTimedOut": False, "errors": []}
    record["cleanup"] = cleanup
    if before is None:
        try:
            process.terminate()
            cleanup["sentSignals"].append("SIGTERM")
            process.wait(timeout=term_timeout)
        except subprocess.TimeoutExpired:
            cleanup["termTimedOut"] = True
        except Exception as error:
            cleanup["errors"].append(type(error).__name__)
        if process.poll() is None:
            try:
                process.kill()
                cleanup["sentSignals"].append("SIGKILL")
                cleanup["forcedKill"] = True
                process.wait(timeout=kill_timeout)
            except Exception as error:
                cleanup["errors"].append(type(error).__name__)
    cleanup["finalReturnCode"] = process.poll()
    record["exit"] = cleanup["finalReturnCode"]
    cleanup["passed"] = (not cleanup["unexpectedExit"] and not cleanup["forcedKill"]
                         and not cleanup["termTimedOut"] and not cleanup["errors"]
                         and cleanup["finalReturnCode"] in (0, -signal.SIGTERM))
    return cleanup


def finalize_report(report):
    report["passed"] = bool(
        report.get("checksComplete") and report.get("checks")
        and all(check.get("passed") for check in report["checks"])
        and not report.get("failure") and not report.get("cleanupErrors")
        and report.get("ownedCachesRemoved") and report.get("processes")
        and all(process.get("cleanup", {}).get("passed") for process in report["processes"])
    )


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--app", type=Path)
    source.add_argument("--binary", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    binary = args.binary.resolve() if args.binary else args.app.resolve() / "Contents/MacOS/notes-clone"
    assert binary.is_file(), binary
    if args.app:
        with open(args.app / "Contents/Info.plist", "rb") as file:
            identifier = plistlib.load(file)["CFBundleIdentifier"]
    else:
        identifier = json.loads(Path("src-tauri/tauri.conf.json").read_text())["identifier"]
    platform_cache = Path.home() / "Library/Caches" / identifier
    binary_bytes = binary.read_bytes()
    child_env = dict(os.environ)
    child_env.pop("NOTES_SYNC_E2E", None)  # Test startup only, without enabling stdin.
    report = {
        "boundary": "current native macOS processes; startup only, no UI/sync acceptance",
        "binary": str(binary),
        "binarySha256": hashlib.sha256(binary_bytes).hexdigest(),
        "binaryKind": "sync-e2e feature binary, not historical production-source startup App" if b"@@SYNC108_NATIVE@@" in binary_bytes else "ordinary native App",
        "runtimeDriverEnabled": False,
        "sourceBase": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "startupSourcesSha256": {
            str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in map(Path, ["src-tauri/src/lib.rs", "src-tauri/src/startup.rs", "src-tauri/src/startup_tests.rs"])
        },
        "checks": [], "processes": [], "checksComplete": False, "cleanupErrors": [],
    }
    children = []
    owned_caches = set()
    scratch_owner = tempfile.TemporaryDirectory(prefix="sync108-native-")
    with scratch_owner as scratch:
        scratch = Path(scratch)

        def rejected(arguments, code, marker):
            result = subprocess.run([str(binary), *arguments], capture_output=True, text=True, timeout=15, env=child_env)
            assert result.returncode == code, (arguments, result.returncode, result.stderr)
            assert "CyberNote startup rejected:" in result.stderr, result.stderr
            assert marker in result.stderr, result.stderr
            report["checks"].append({"case": arguments, "exit": result.returncode, "error": result.stderr.strip(), "passed": True})

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
            process = subprocess.Popen([str(binary), "--data-dir", str(root)], stdout=log, stderr=log, env=child_env)
            record = {"pid": process.pid, "root": str(root), "mediaCache": str(cache), "exit": None}
            children.append((process, log, record))
            report["processes"].append(record)
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    log.seek(0)
                    raise AssertionError((process.returncode, log.read()))
                if (root / "notes.sqlite3").exists():
                    listing = subprocess.run(["lsof", "-nP", "-p", str(process.pid), "-Fn"], capture_output=True, text=True,
                                             timeout=min(3, max(0.1, deadline - time.monotonic()))).stdout
                    if f"n{root}/notes.sqlite3\n" in listing and f"n{cache}\n" in listing and "127.0.0.1:" in listing:
                        record["openedSelectedSqlite"] = True
                        record["managedHttpListener"] = True
                        return process
                time.sleep(0.1)
            raise AssertionError(f"native startup timeout: {process.pid}")

        def stop(process):
            for child, _, record in children:
                if child is process:
                    return stop_owned(process, record)
            raise AssertionError("refuse to stop an unowned child")

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
            assert stop(first)["passed"], "first process cleanup failed"
            restarted = launch(a)
            assert restarted.pid != first.pid
            assert (a / "notes.sqlite3").stat().st_ino == inode
            with sqlite3.connect(f"file:{a}/notes.sqlite3?mode=ro", uri=True) as db:
                assert db.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").fetchall() == schema
            report["checks"].append({"case": "two native directories, isolated caches, same-dir and alias refusal, restart", "passed": True})
            report["checksComplete"] = True
        except Exception as error:
            report["failure"] = {"code": type(error).__name__}
        finally:
            for process, log, _ in children:
                try:
                    stop(process)
                except Exception as error:
                    report["cleanupErrors"].append({"stage": "process", "pid": process.pid, "code": type(error).__name__})
                try:
                    log.close()
                except Exception as error:
                    report["cleanupErrors"].append({"stage": "log", "code": type(error).__name__})
            for cache in owned_caches:
                try:
                    if cache.exists():
                        shutil.rmtree(cache)
                except Exception as error:
                    report["cleanupErrors"].append({"stage": "cache", "code": type(error).__name__})
            report["ownedCachesRemoved"] = all(not cache.exists() for cache in owned_caches)
            try:
                scratch_owner.cleanup()
            except Exception as error:
                report["cleanupErrors"].append({"stage": "scratch", "code": type(error).__name__})
            finalize_report(report)
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": report.get("passed", False), "report": str(args.out), "processes": len(children)}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
