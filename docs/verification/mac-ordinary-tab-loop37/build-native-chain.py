from pathlib import Path
import subprocess,json,os,sys
root=Path.cwd();out=root/'docs/verification/mac-ordinary-tab-loop37';target=Path('/private/tmp/apple-notes-ordinary-tab-loop37-target-01/debug')
args=['rustc','--edition=2021','--crate-name','ordinary_native_chain37',str(out/'native-rust-chain.rs'),'-o',str(out/'native-rust-chain'),'-L','dependency='+str(target/'deps')]
fingerprints=list((target/'.fingerprint').glob('tauri-plugin-notes-ui-*/test-lib-tauri_plugin_notes_ui.json'))
metadata=json.loads(max(fingerprints,key=lambda p:p.stat().st_mtime).read_text())
expected={d[1]:d[3] for d in metadata['deps']}
for crate in ['tauri','serde','serde_json','uuid']:
 paths=[]
 for candidate in (target/'deps').glob('lib'+crate+'-*.rlib'):
  fingerprint=(target/'.fingerprint'/candidate.name[3:-5]/('lib-'+crate)).read_text()
  value=int.from_bytes(bytes.fromhex(fingerprint),'little')
  if value==expected[crate]:paths.append(candidate)
 assert len(paths)==1,(crate,paths)
 args+=['--extern',crate+'='+str(paths[0])]
libs=list((target/'build').glob('tauri-plugin-notes-ui-*/out/libnotes_ui_toolbar.a'))
latest=max(libs,key=lambda p:p.stat().st_mtime)
args+=['-L','native='+str(latest.parent),'-l','static=notes_ui_toolbar']
for framework in ['AppKit','Foundation','QuartzCore','WebKit']:args+=['-l','framework='+framework]
(out/'native-rust-compile-args.json').write_text(json.dumps(args,indent=2)+'\n')
env=dict(os.environ,CARGO_PKG_NAME='tauri-plugin-notes-ui',CARGO_MANIFEST_DIR=str(root/'plugins/tauri-plugin-notes-ui'))
with (out/('native-rust-compile-'+sys.argv[1]+'.log')).open('w') as log:r=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,env=env)
raise SystemExit(r.returncode)
