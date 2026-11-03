#!/usr/bin/env python3
"""Run only after root authorizes an exact unified candidate HEAD."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
parser = argparse.ArgumentParser()
parser.add_argument('expected_head', help='exact 40-character HEAD authorized by root')
parser.add_argument('output', type=Path)
parser.add_argument('--mode', choices=['freeze', 'guard', 'postbuild'], default='freeze')
args = parser.parse_args()
if args.mode == 'freeze' and args.output.exists():
    raise SystemExit('Refuse overwrite of frozen inputs: ' + str(args.output))
os.chdir(ROOT)
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
if len(args.expected_head) != 40 or head != args.expected_head:
    raise SystemExit('Refuse capture: HEAD differs from exact authorized candidate')
dirty = subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], text=True).splitlines()
if dirty:
    raise SystemExit('Refuse capture: tracked changes: ' + repr(dirty))
prefixes = ('src/', 'src-tauri/', 'scripts/', 'assets/', 'patches/', 'plugins/tauri-plugin-notes-ui/')
root_names = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'index.html', 'tsconfig.json', 'vite.config.ts', '.npmrc', '.cargo/config', '.cargo/config.toml', 'rust-toolchain', 'rust-toolchain.toml'}
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z']).decode().split('\0')
unexpected = [p for p in untracked if p and (p.startswith(prefixes) or p in root_names)]
if unexpected:
    raise SystemExit('Refuse capture: untracked source inputs: ' + repr(unexpected))
flags = {key: os.environ.get(key) for key in ['VITE_ACCESS_BOUNDARY_PROOF', 'TAURI_CONFIG', 'TAURI_ENV_PLATFORM', 'CARGO_BUILD_TARGET', 'CARGO_TARGET_DIR', 'RUSTFLAGS']}
if any(value is not None for value in flags.values()):
    raise SystemExit('Refuse default build capture: unexpected relevant environment: ' + repr(flags))
previous = json.loads((ROOT / 'docs/verification/f07-audio-integration/build-candidate02/source-inputs-before.json').read_text())
paths = {item['path'] for item in previous['files']}
tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
paths.update(p for p in tracked if p and (p.startswith(prefixes) or p in root_names))
required = [
    'src/App.tsx', 'src/bridge.ts', 'src/style.css',
    'src/search-selection.ts', 'src/search-editor-gate.ts', 'src/audio-playback.ts',
    'src/RecordingPanel.tsx', 'src/RecordingPanel.css', 'src/recording-clock.ts', 'src/recording-session.ts',
    'src/attachment-submission.ts', 'src/attachment-target.ts', 'src/save-queue.ts', 'src/trusted-synchronization.ts',
    'scripts/check-attachment-submission.mjs', 'scripts/check-attachment-cancellation.mjs', 'scripts/check-recording-panel-browser.mjs',
    'src-tauri/Info.plist', 'plugins/tauri-plugin-notes-ui/src/lib.rs', 'plugins/tauri-plugin-notes-ui/src/macos.rs',
    'plugins/tauri-plugin-notes-ui/macos/toolbar.m', 'plugins/tauri-plugin-notes-ui/macos/format.m',
]
paths.update(required)
missing = [path for path in sorted(paths) if not Path(path).is_file()]
if missing:
    raise SystemExit('Refuse capture: missing inputs: ' + repr(missing))
files = []
for path in sorted(paths):
    content = Path(path).read_bytes()
    files.append({'path': path, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
aggregate = hashlib.sha256(''.join(item['sha256'] + '  ' + item['path'] + '\n' for item in files).encode()).hexdigest()
sdk = os.environ.get('ANDROID_HOME') or str(Path.home() / 'Library/Android/sdk')
ndk_env = os.environ.get('NDK_HOME')
java_env = os.environ.get('JAVA_HOME')
effective = {
    'ANDROID_HOME': sdk,
    'NDK_HOME': ndk_env if ndk_env and Path(ndk_env).exists() else sdk + '/ndk/27.2.12479018',
    'JAVA_HOME': java_env if java_env and Path(java_env).exists() else '/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
}
result = {
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'headAtCapture': head, 'mode': args.mode,
    'scope': 'Listed tracked frontend/Rust/native-toolbar/Android/config/lock/assets/scripts plus candidate02 known generated Android and patched dependency inputs. Includes attachment helpers, RecordingPanel/CSS/clock and focus plugin; final tracked zero-result UI paths are included automatically. Not a complete dependency/SDK/OS reproducibility claim. Docs and runtime evidence are excluded.',
    'algorithm': 'SHA256 of ordered sha256 + two spaces + path + LF',
    'aggregate': aggregate, 'count': len(files), 'required': required,
    'missing': [], 'trackedDiffAtCapture': [], 'relevantEnvironment': flags,
    'androidEnvironment': {key: os.environ.get(key) for key in ['ANDROID_HOME', 'NDK_HOME', 'JAVA_HOME']},
    'effectiveAndroidScriptEnvironment': effective, 'files': files,
}
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('x' if args.mode == 'freeze' else 'w') as output:
    output.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['headAtCapture', 'mode', 'aggregate', 'count', 'missing', 'relevantEnvironment', 'effectiveAndroidScriptEnvironment']}, ensure_ascii=False, indent=2))
