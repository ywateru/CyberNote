"""APP94 Mac32-only build. Running this file requires the root's build admission.

Keep the raw bundle and all command output; explicitly preserve and inspect the
Apple Events entitlement when deriving the local ad-hoc signed deliverable.
"""
import hashlib
import json
import os
import plistlib
import subprocess
import sys
import time
from pathlib import Path

APPROVED = None  # Exact integrated main commit is supplied at admitted execution.
PRODUCT_PATHS = ["src", "src-tauri", "plugins", "assets", "package.json",
                 "pnpm-lock.yaml", "vite.config.ts", "tsconfig.json",
                 "tsconfig.app.json", "tsconfig.node.json", "index.html", ".cargo"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    global APPROVED
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != "--finalize-original"):
        raise SystemExit("Usage after build admission: python3 build-editor94-mac.py EXACT_MAIN_ROOT APPROVED_MAIN_HEAD [--finalize-original]")
    APPROVED = sys.argv[2]
    if len(APPROVED) != 40 or any(c not in "0123456789abcdef" for c in APPROVED):
        raise SystemExit("Approved main source must be a full lowercase Git commit ID")
    finalize = len(sys.argv) == 4
    root = Path(sys.argv[1]).resolve(strict=True)
    out = root / ("docs/verification/editor94/mac-build-finalize02" if finalize
                  else "docs/verification/editor94/mac-build")
    artifact = root / "artifacts/editor94"
    if out.exists():
        raise SystemExit("Refuse overwrite existing Mac32 build evidence")
    for name in (["备忘录.app", "备忘录-Mac32.zip", "mac-dist"] if finalize else
                 ["mac-original.app", "备忘录.app", "备忘录-Mac32.zip", "mac-dist"]):
        if (artifact / name).exists():
            raise SystemExit("Refuse overwrite existing Mac32 artifact: " + name)

    def git(args):
        return subprocess.check_output(["git", *args], cwd=root)

    # Discover the entire tracked product set, including UI assets; no old fixed
    # count or Android package equality assertion applies to this Mac feature.
    frozen = sorted(filter(None, git(["ls-tree", "-r", "--name-only", "-z", APPROVED,
                                     "--", *PRODUCT_PATHS]).decode().split("\0")))
    current = sorted(filter(None, git(["ls-files", "-z", "--", *PRODUCT_PATHS]).decode().split("\0")))
    if not frozen or current != frozen:
        raise RuntimeError("Current product input path set differs from approved source")

    def inputs():
        if sorted(filter(None, git(["ls-files", "-z", "--", *PRODUCT_PATHS]).decode().split("\0"))) != frozen:
            raise RuntimeError("Tracked product input path set changed")
        if git(["status", "--porcelain", "--untracked-files=all", "--", *PRODUCT_PATHS]).strip():
            raise RuntimeError("Product source has tracked or untracked changes")
        rows = []
        for relative in frozen:
            path = root / relative
            if path.is_symlink() or not path.is_file():
                raise RuntimeError("Missing or nonregular tracked product input: " + relative)
            data = path.read_bytes()
            if data != git(["show", APPROVED + ":" + relative]):
                raise RuntimeError("Product input differs from approved source: " + relative)
            rows.append({"path": relative, "bytes": len(data), "sha256": sha(data)})
        return rows

    before = inputs()
    previous = None
    if finalize:
        prior_path = root / "docs/verification/editor94/mac-build/result.json"
        previous = json.loads(prior_path.read_text())
        if (previous.get("status") != "failed" or previous.get("approvedProductHead") != APPROVED
                or previous.get("inputBefore") != before or previous.get("inputAfterBuild") != before
                or not previous.get("originalFiles")
                or not any(c["name"] == "mac-build" and c["exitCode"] == 0 for c in previous.get("commands", []))
                or not any(c["name"] == "copy-original" and c["exitCode"] == 0 for c in previous.get("commands", []))):
            raise RuntimeError("Cannot finalize an unverified original build stage")
    entitlements = root / "src-tauri/Entitlements.plist"
    expected_entitlements = plistlib.loads(entitlements.read_bytes())
    if expected_entitlements.get("com.apple.security.automation.apple-events") is not True:
        raise RuntimeError("Approved Apple Events entitlement is absent")
    expected_usage = plistlib.loads((root / "src-tauri/Info.plist").read_bytes()).get("NSAppleEventsUsageDescription")
    if not isinstance(expected_usage, str) or not expected_usage.strip():
        raise RuntimeError("Approved Apple Events usage description is absent")
    out.mkdir(parents=True)
    artifact.mkdir(parents=True, exist_ok=True)
    (out / "build-driver.py").write_bytes(Path(__file__).read_bytes())
    result = {"head": git(["rev-parse", "HEAD"]).decode().strip(), "buildCwd": str(root),
              "approvedProductHead": APPROVED, "driverSha256": sha(Path(__file__).read_bytes()), "inputBefore": before,
              "inputCount": len(before), "inputPathsDynamic": True,
              "expectedEntitlements": expected_entitlements, "expectedUsageDescription": expected_usage,
              "artifactDirectory": str(artifact), "commands": []}
    if finalize:
        result["continuationOf"] = str(prior_path)
        result["priorResultSha256"] = sha(prior_path.read_bytes())
        result["compileReused"] = True

    def save():
        (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")

    def run(name, args, env=None, required=True, capture=False):
        started = time.monotonic()
        with (out / (name + ".stdout.log")).open("wb") as stdout, (out / (name + ".stderr.log")).open("wb") as stderr:
            completed = subprocess.run(args, cwd=root, env=env, stdout=stdout, stderr=stderr)
        row = {"name": name, "command": args, "exitCode": completed.returncode,
               "wallSeconds": round(time.monotonic() - started, 3)}
        result["commands"].append(row)
        save()
        print(json.dumps(row, ensure_ascii=False), flush=True)
        if required and completed.returncode:
            raise RuntimeError(name + " failed; original output retained")
        return (out / (name + ".stdout.log")).read_bytes() if capture else row

    def manifest(folder):
        return [{"path": str(p.relative_to(folder)), "bytes": p.stat().st_size,
                 "sha256": sha(p.read_bytes())} for p in sorted(folder.rglob("*"))
                if p.is_file() and not p.is_symlink()]

    def inspect_bundle(label, app, require_expected):
        # Verify the actual signed entitlement blob, never infer it from config.
        signed = run("entitlements-" + label,
                     ["codesign", "-d", "--entitlements", ":-", str(app)], capture=True)
        actual = plistlib.loads(signed) if signed.strip() else None
        if require_expected and actual != expected_entitlements:
            raise RuntimeError(label + " actual signature entitlements differ from approved plist")
        info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
        if info.get("NSAppleEventsUsageDescription") != expected_usage:
            raise RuntimeError(label + " actual bundle usage description differs from approved source")
        result[label + "BundleInfo"] = {"entitlements": actual,
                                       "signedEntitlementsPresent": bool(signed.strip()),
                                       "entitlementsMatchExpected": actual == expected_entitlements,
                                       "NSAppleEventsUsageDescription": info["NSAppleEventsUsageDescription"],
                                       "CFBundleExecutable": info.get("CFBundleExecutable"),
                                       "infoSha256": sha((app / "Contents/Info.plist").read_bytes())}
        run("inspect-" + label, ["codesign", "-dv", "--verbose=4", str(app)])
        save()

    try:
        raw, derived = artifact / "mac-original.app", artifact / "备忘录.app"
        archive = artifact / "备忘录-Mac32.zip"
        if finalize:
            result["originalFiles"] = manifest(raw)
            if result["originalFiles"] != previous["originalFiles"]:
                raise RuntimeError("Original bundle differs from preserved first build")
            result["inputAfterBuild"] = inputs()
        else:
            env = {**os.environ, "CARGO_NET_OFFLINE": "true"}
            # APP94 uses the explicitly handed-off existing shared cache. Never
            # allocate a fresh native target or touch an Android build/device.
            target = Path("/private/tmp/apple-notes-sync84-target")
            if not target.is_dir():
                raise RuntimeError("The handed-off native cache must already exist")
            env["CARGO_TARGET_DIR"] = str(target)
            result["buildEnvironment"] = {"CARGO_NET_OFFLINE": "true", "CARGO_TARGET_DIR": str(target)}
            run("mac-build", ["pnpm", "mac:build"], env=env)
            result["inputAfterBuild"] = inputs()
            if result["inputAfterBuild"] != before:
                raise RuntimeError("Build inputs changed")
            source = target / "release/bundle/macos/备忘录.app"
            run("copy-original", ["ditto", str(source), str(raw)])
            result["originalFiles"] = manifest(raw)
        run("verify-original", ["codesign", "--verify", "--deep", "--strict", "--verbose=4", str(raw)], required=False)
        # Preserve and describe the bundler/linker signature honestly; only the
        # derived deliverable is required to contain the approved entitlements.
        inspect_bundle("original", raw, require_expected=False)
        run("copy-derived", ["ditto", str(raw), str(derived)])
        run("sign-derived", ["codesign", "--force", "--sign", "-", "--timestamp=none",
                             "--entitlements", str(entitlements), str(derived)])
        run("verify-derived", ["codesign", "--verify", "--deep", "--strict", "--verbose=4", str(derived)])
        inspect_bundle("derived", derived, require_expected=True)
        result["derivedFiles"] = manifest(derived)
        first = {p["path"]: p for p in result["originalFiles"]}
        second = {p["path"]: p for p in result["derivedFiles"]}
        result["changedPaths"] = [p for p in sorted(set(first) | set(second)) if first.get(p) != second.get(p)]
        if not set(result["changedPaths"]) <= {"Contents/MacOS/notes-clone", "Contents/_CodeSignature/CodeResources"}:
            raise RuntimeError("Unexpected derived signed resource changes")
        result["originalUnchanged"] = manifest(raw) == result["originalFiles"]
        if not result["originalUnchanged"]:
            raise RuntimeError("Original bundle copy changed")
        run("archive", ["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(derived), str(archive)])
        result["archive"] = {"path": str(archive), "bytes": archive.stat().st_size, "sha256": sha(archive.read_bytes())}
        executable = derived / "Contents/MacOS/notes-clone"
        result["executable"] = {"path": str(executable), "sha256": sha(executable.read_bytes())}
        run("copy-frontend", ["ditto", str(root / "dist"), str(artifact / "mac-dist")])
        result["frontendFiles"] = manifest(artifact / "mac-dist")
        result["frontendSnapshot"] = str(artifact / "mac-dist")
        result["inputAfterPackaging"] = inputs()
        if result["inputAfterPackaging"] != before:
            raise RuntimeError("Packaging inputs changed")
        result["status"] = "pass"
        result["limits"] = ["Local arm64 ad-hoc build; no notarization or runtime automation/TCC acceptance claim.",
                            "Dynamic approved input provenance and actual signature/Info checks; not a hermetic toolchain/dependency reproducibility proof."]
    except Exception as failure:
        result["status"], result["error"] = "failed", str(failure)
        save()
        raise
    save()
    print(json.dumps({"status": result["status"], "archive": result["archive"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
