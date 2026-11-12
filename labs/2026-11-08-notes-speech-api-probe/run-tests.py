#!/usr/bin/env python3
"""Build and exercise public Speech APIs; all speech is a retained synthetic fixture.

No Notes launch, microphone capture, private API, or cloud fallback.
--prepare-model explicitly allows AssetInventory installation when needed.
"""

import argparse
import hashlib
import json
import plistlib
import subprocess
import time
from pathlib import Path


LAB = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def execute(name, argv, output, timeout=55):
    started = time.monotonic()
    try:
        result = subprocess.run(argv, capture_output=True, timeout=timeout)
        record = {"argv": argv, "exitCode": result.returncode, "timedOut": False,
                  "stdout": result.stdout.decode(errors="replace"),
                  "stderr": result.stderr.decode(errors="replace")}
    except subprocess.TimeoutExpired as error:
        record = {"argv": argv, "exitCode": None, "timedOut": True,
                  "stdout": (error.stdout or b"").decode(errors="replace"),
                  "stderr": (error.stderr or b"").decode(errors="replace")}
    record["elapsedSeconds"] = time.monotonic() - started
    (output / f"{name}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return record


def events(record):
    return [json.loads(line) for line in record["stdout"].splitlines() if line.startswith("{")]


def success(record, require_bundle=None, streaming=False):
    items = events(record)
    completed = next((item for item in items if item["event"] == "completed"), None)
    env = next((item for item in items if item["event"] == "environment"), {})
    audio = next((item for item in items if item["event"] == "input"), {})
    partials = [item for item in items if item["event"] == "result" and not item["final"]]
    finals = [item for item in items if item["event"] == "result" and item["final"]]
    spans = [span for item in finals for span in item.get("timeSpans", [])]
    expected = ["苹果笔记", "私人录音", "星期五", "整理资料", "编写程序", "检查结果"]
    matched = [word for word in expected if completed and word in completed["finalText"]]
    checks = {
        "exitZero": record["exitCode"] == 0,
        "finalTextReturned": bool(completed and completed["finalText"].strip()),
        "syntheticFixtureKeywords": len(matched) >= 5,
        "timeSpansReturned": bool(spans),
        "timeSpansInsideAudio": bool(spans) and all(
            span["startSeconds"] >= 0 and span["durationSeconds"] >= 0
            and span["startSeconds"] + span["durationSeconds"] <= audio.get("durationSeconds", 0) + 0.25
            for span in spans),
        "oldSpeechAuthorizationUnchanged": "speechAuthorizationStatus" in env
            and bool(completed and completed["speechAuthorizationStatus"] == env["speechAuthorizationStatus"]),
    }
    if require_bundle:
        checks["ownBundleIdentity"] = env.get("bundleIdentifier") == require_bundle
    if streaming:
        checks["partialBeforeEndOfInput"] = bool(partials) and partials[0]["elapsedSeconds"] < audio.get("durationSeconds", 0)
    return {"passed": all(checks.values()), "checks": checks, "matchedKeywords": matched,
            "finalText": completed["finalText"] if completed else None,
            "partialCount": len(partials), "finalCount": len(finals), "timeSpanCount": len(spans),
            "firstPartialSeconds": partials[0]["elapsedSeconds"] if partials else None,
            "recognitionElapsedSeconds": completed["elapsedSeconds"] if completed else None,
            "processElapsedSeconds": record["elapsedSeconds"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="NEW directory for immutable run results")
    parser.add_argument("--prepare-model", action="store_true")
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()
    output = args.out.resolve()
    output.mkdir(parents=True, exist_ok=False)
    if not args.no_build:
        built = execute("build", ["sh", str(LAB / "build.sh")], output)
        if built["exitCode"] != 0:
            raise SystemExit("Build failed; see build.json")
    binary = LAB / ".build/SpeechProbe"
    own_app = LAB / ".build/SpeechProbe.app/Contents/MacOS/SpeechProbe"
    sandbox_app = LAB / ".build/SpeechProbeSandbox.app"
    sandbox_binary = sandbox_app / "Contents/MacOS/SpeechProbe"
    fixture = LAB / "fixtures/zh.wav"
    if not fixture.exists():
        text = (LAB / "fixtures/zh.txt").read_text().strip()
        subprocess.run(["say", "-v", "Tingting", "-r", "155", "-o", str(LAB / ".build/zh.aiff"), text], check=True)
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@24000", "-c", "1",
                        str(LAB / ".build/zh.aiff"), str(fixture)], check=True)
        # The apps also need the newly generated bundled fixture.
        subprocess.run(["sh", str(LAB / "build.sh")], check=True)
    install = ["--install-model"] if args.prepare_model else []
    summary = {"investigationDate": "2026-11-08", "cases": {},
               "sourceSHA256": sha(LAB / "SpeechProbe.swift"), "binarySHA256": sha(binary),
               "fixtureSHA256": sha(fixture), "fixtureTextSHA256": sha(LAB / "fixtures/zh.txt"),
               "modelInstallationAllowed": args.prepare_model,
               "limits": "App Sandbox constrains this application, not all system speech services. "
                         "No system-wide offline test or network capture was performed. "
                         "This is synthetic file/PCM input, not microphone or Notes runtime observation."}
    inspect = execute("inspect", [str(binary), "--locale", "zh-CN"], output)
    summary["cases"]["inspect"] = {"passed": inspect["exitCode"] == 0}
    for name, program, extra, bundle in [
        ("own-app-file", own_app, ["--bundled-fixture"], "com.local.cybernote.speech-probe"),
        ("pcm-paced", binary, ["--file", str(fixture), "--stream", "--pace"], None),
        ("sandbox-app-file", sandbox_binary, ["--bundled-fixture"], "com.local.cybernote.speech-probe-sandbox"),
    ]:
        run = execute(name, [str(program), "--locale", "zh-CN", *extra, *install], output)
        summary["cases"][name] = success(run, require_bundle=bundle, streaming=name == "pcm-paced")
        print(f"{name}: {summary['cases'][name]['passed']}", flush=True)
    unsupported = execute("unsupported-locale", [str(binary), "--locale", "xx-XX"], output)
    summary["cases"]["unsupported-locale"] = {"passed": unsupported["exitCode"] == 1
        and any(e["event"] == "error" and "Unsupported locale" in e["message"] for e in events(unsupported))}
    missing = execute("missing-file", [str(binary), "--locale", "zh-CN", "--file", str(output / "absent.wav")], output)
    summary["cases"]["missing-file"] = {"passed": missing["exitCode"] == 1
        and any(e["event"] == "error" for e in events(missing))
        and not any(e["event"] == "completed" for e in events(missing))}
    sign = execute("sandbox-signature", ["codesign", "-d", "--entitlements", ":-", str(sandbox_app)], output)
    try:
        entitlements = plistlib.loads(sign["stdout"].encode())
    except (ValueError, plistlib.InvalidFileException):
        entitlements = {}
    summary["sandboxEntitlements"] = entitlements
    summary["cases"]["sandbox-no-network-entitlement"] = {"passed": entitlements == {"com.apple.security.app-sandbox": True}}
    for name, command in [("toolchain", ["xcrun", "swiftc", "--version"]),
                          ("sdk", ["xcrun", "--show-sdk-path"]),
                          ("public-imports", ["nm", "-u", str(binary)])]:
        execute(name, command, output)
    summary["passed"] = all(case["passed"] for case in summary["cases"].values())
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    raise SystemExit(0 if summary["passed"] else 1)


if __name__ == "__main__":
    main()
