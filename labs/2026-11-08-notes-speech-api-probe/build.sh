#!/bin/sh
set -eu
lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
probe_output=${1:-"$lab_dir/.build"}
mkdir -p "$probe_output"
xcrun swiftc -parse-as-library -O -target arm64-apple-macos26.0 \
  "$lab_dir/SpeechProbe.swift" -o "$probe_output/SpeechProbe"
codesign --force --sign - "$probe_output/SpeechProbe"
python3 - "$lab_dir" "$probe_output" <<'PY'
import plistlib, shutil, sys
from pathlib import Path
lab, out = map(Path, sys.argv[1:])
for name, identifier in [("SpeechProbe", "com.local.cybernote.speech-probe"),
                         ("SpeechProbeSandbox", "com.local.cybernote.speech-probe-sandbox")]:
    contents = out / (name + ".app") / "Contents"
    (contents / "MacOS").mkdir(parents=True, exist_ok=True)
    (contents / "Resources").mkdir(parents=True, exist_ok=True)
    shutil.copy2(out / "SpeechProbe", contents / "MacOS/SpeechProbe")
    fixture = lab / "fixtures/zh.wav"
    if fixture.exists():
        shutil.copy2(fixture, contents / "Resources/zh.wav")
    info = {"CFBundleIdentifier": identifier, "CFBundleExecutable": "SpeechProbe",
            "CFBundleName": name, "CFBundlePackageType": "APPL", "CFBundleVersion": "1",
            "CFBundleShortVersionString": "1.0", "LSMinimumSystemVersion": "26.0",
            "LSUIElement": True}
    (contents / "Info.plist").write_bytes(plistlib.dumps(info))
PY
codesign --force --sign - "$probe_output/SpeechProbe.app"
codesign --force --sign - --entitlements "$lab_dir/Sandbox.entitlements" "$probe_output/SpeechProbeSandbox.app"
printf '%s\n' "$probe_output/SpeechProbe"
