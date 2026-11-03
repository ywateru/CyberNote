from pathlib import Path
import hashlib, json, subprocess
BASE='87e538c4577483c8756aa49445f47b24badd98ff'
out=Path(__file__).parent
products=['plugins/tauri-plugin-notes-ui/macos/toolbar.m','src/style.css']
protected=['src/App.tsx','src/native-toolbar-state.ts','src/native-toolbar-controller.ts','src/native-toolbar.ts','src/search-selection.ts','src/search-editor-gate.ts','src/trusted-synchronization.ts','src/Editor.tsx','src/editor-actions.ts','src/editor-schema.ts','src/RecordingPanel.tsx','src/RecordingPanel.css','src/recording-session.ts','src/recording-clock.ts','src/recording-playback.ts','src/OcrPanel.tsx','src/OcrPanel.css','src/ocr-host.ts','src/ocr-native.ts','src-tauri/src/lib.rs','src-tauri/src/main.rs','src-tauri/src/media_permission.rs','src-tauri/tauri.conf.json','src-tauri/Info.plist','src-tauri/capabilities/default.json','src-tauri/capabilities/macos-notes-ui.json','plugins/tauri-plugin-notes-ui/src/model.rs','plugins/tauri-plugin-notes-ui/src/macos.rs','plugins/tauri-plugin-notes-ui/guest-js/index.ts','plugins/tauri-plugin-notes-ui/macos/format.m','package.json','pnpm-lock.yaml']
protected+=subprocess.check_output(['git','ls-files','docs/research/mac-zero-roi-candidate03-01'],text=True).splitlines()
protected+=['docs/verification/mac-zero-same-geometry-before-01/08-original-zero.png','docs/verification/unified-candidate03-independent-01/mac/05-zero.png']
def sha(data): return hashlib.sha256(data).hexdigest()
def original(path): return subprocess.check_output(['git','show',BASE+':'+path])
entries=[]
for path in sorted(products):
    before=original(path);after=Path(path).read_bytes()
    start=0
    while start<min(len(before),len(after)) and before[start]==after[start]:start+=1
    end=0
    while end<min(len(before),len(after))-start and before[-end-1]==after[-end-1]:end+=1
    entries.append({'path':path,'beforeSha256':sha(before),'sha256':sha(after),'commonPrefixBytes':start,'commonPrefixSha256':sha(before[:start]),'commonSuffixBytes':end,'commonSuffixSha256':sha(before[len(before)-end:]),'changedBeforeByteRange':[start,len(before)-end],'changedAfterByteRange':[start,len(after)-end]})
manifest={'baseline':BASE,'productFiles':entries,'aggregateFormat':'sha256 of UTF-8 sorted lines: <sha256>  <path>\\n','aggregateSha256':sha(''.join(e['sha256']+'  '+e['path']+'\n' for e in entries).encode())}
(out/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
unchanged=[]
for path in sorted(set(protected)):
    before=original(path);after=Path(path).read_bytes()
    assert before==after,path
    unchanged.append({'path':path,'sha256':sha(after),'baselineEqual':True})
(out/'protected-boundaries.json').write_text(json.dumps({'baseline':BASE,'count':len(unchanged),'files':unchanged,'toolbarBoundary':'Only the final text frame region changed; review source diff for semantic scope. No AppKit runtime claim.','cssBoundary':'Only a dedicated section override added; shared CSS/font/accent bytes remain in common prefix/suffix.'},indent=2)+'\n')
print(json.dumps({'aggregateSha256':manifest['aggregateSha256'],'products':len(entries),'protectedFiles':len(unchanged)},indent=2))
