#!/usr/bin/env python3
import datetime, hashlib, json, os, subprocess, sys
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone')
os.chdir(root)
mode=sys.argv[1] if len(sys.argv)>1 else 'preflight'
output=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/private/tmp/notes-f07-audio-build-preflight-01/inputs-preflight.json')
previous=json.loads(Path('docs/verification/app-002-media/android-candidate01/source-inputs-before.json').read_text())
paths={item['path'] for item in previous['files']}
tracked=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
root_names={'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','index.html','tsconfig.json','vite.config.ts','.npmrc','.cargo/config','.cargo/config.toml','rust-toolchain','rust-toolchain.toml'}
for path in tracked:
 if path and (path.startswith(('src/','src-tauri/','scripts/','assets/','patches/','plugins/tauri-plugin-notes-ui/')) or path in root_names): paths.add(path)
# Include these required integration inputs explicitly, even before the pending
# audio integration arrives. A final build freeze refuses any missing input.
required=['src/search-selection.ts','src/search-editor-gate.ts','src/audio-playback.ts','scripts/check-audio-playback.mjs','scripts/check-audio-playback-browser.mjs','src-tauri/Info.plist','plugins/tauri-plugin-notes-ui/macos/toolbar.m','plugins/tauri-plugin-notes-ui/macos/format.m']
paths.update(required)
files=[];missing=[]
for path in sorted(paths):
 p=Path(path)
 if not p.is_file(): missing.append(path);continue
 content=p.read_bytes();files.append({'path':path,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
aggregate=hashlib.sha256(''.join(item['sha256']+'  '+item['path']+'\n' for item in files).encode()).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
source_diff=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
flags={key:os.environ.get(key) for key in ['VITE_ACCESS_BOUNDARY_PROOF','TAURI_CONFIG','TAURI_ENV_PLATFORM','CARGO_BUILD_TARGET','CARGO_TARGET_DIR','RUSTFLAGS']}
result={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headAtCapture':head,'mode':mode,'scope':'Listed tracked frontend/Rust/native-toolbar/Android/config/lock/assets/scripts plus prior known generated Android and patched dependency inputs; no complete dependency or toolchain reproducibility claim. Build outputs, docs and verification runtime data are not build inputs. Includes Mac Info.plist/icons and both search helpers plus audio helper explicitly.','algorithm':'SHA256 of ordered sha256 + two spaces + path + LF','aggregate':aggregate,'count':len(files),'required':required,'missing':missing,'trackedDiffAtCapture':source_diff,'relevantEnvironment':flags,'files':files}
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['headAtCapture','mode','aggregate','count','missing','trackedDiffAtCapture','relevantEnvironment']},ensure_ascii=False,indent=2))
if mode=='freeze' and (missing or source_diff): raise SystemExit('Final input freeze refused: missing required inputs or tracked changes')
