#!/usr/bin/env python3
"""U1/U3: run behavioral regressions on frozen cfde3810 and current modules.
Private source mirrors permit private admission probe; production files unchanged.
No Tauri app, installed bundle, credentials, service, or note library is accessed.
"""
import json,os,shutil,subprocess,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[3];source=root/'src-tauri/src/software_update'
result=[]
with tempfile.TemporaryDirectory(prefix='update-blocking-native-') as temp:
 base=Path(temp)
 for version in ['cfde3810','current']:
  d=base/version;d.mkdir()
  for name in ['archive','feed','install','network','service','storage','version','tests','archive_tests']:
   p=source/(name+'.rs')
   if version!='current' and name=='archive_tests':continue
   text=p.read_text() if version=='current' else subprocess.check_output(['git','show',f'{version}:src-tauri/src/software_update/{name}.rs'],cwd=root,text=True)
   (d/(name+'.rs')).write_text(text)
  shutil.copyfile(source/'replace.sh',d/'replace.sh')
  (d/'Cargo.toml').write_text('''[package]
name="software-update-blocking-proof"
version="0.1.0"
edition="2021"
[lib]
path="proof.rs"
[dependencies]
serde={version="1",features=["derive"]}
serde_json="1"
reqwest={version="0.12",default-features=false,features=["json","rustls-tls"]}
sha2="0.10"
flate2="1"
crc32fast="1"
uuid={version="1",features=["v4"]}
libc="0.2"
tokio={version="1",features=["rt-multi-thread","net","time","sync","macros","io-util","test-util"]}
[dev-dependencies]
tempfile="3"
''')
  shutil.copyfile(root/'src-tauri/Cargo.lock',d/'Cargo.lock')
  tests='\n'.join(f'mod {name};' for name in ['archive','feed','install','network','service','storage','version'])
  # Real deflate stream from Python ZIP writer with only the central expansion understated.
  archive=d/'understated.zip'
  with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('CyberNote.app/Contents/file',bytes(8*1024*1024))
  b=bytearray(archive.read_bytes());c=b.index(b'PK\x01\x02');b[c+24:c+28]=(1).to_bytes(4,'little');archive.write_bytes(b)
  extra=d/'zip64-extra.zip'
  with zipfile.ZipFile(extra,'w') as z:
   info=zipfile.ZipInfo('CyberNote.app/file');info.extra=b'\x01\x00\x00\x00';z.writestr(info,b'x')
  tests+='\n#[test] fn regression_zip_actual_expansion() {assert!(archive::validate_zip(std::path::Path::new('+json.dumps(str(archive))+')).is_err(),"lying central header accepted");}\n'
  tests+='\n#[test] fn regression_zip64_extra() {assert!(archive::validate_zip(std::path::Path::new('+json.dumps(str(extra))+')).is_err(),"ZIP64 extra accepted");}\n'
  (d/'proof.rs').write_text(tests)
  lease='Some(Box::new(Lease(released.clone())))' if version!='current' else 'Some(HeldInstall{_lease:Box::new(Lease(released.clone())),transaction:install::pending_identity(&base).unwrap()})'
  with(d/'service.rs').open('a')as file:file.write('''
#[cfg(test)]mod blocking_admission_regression{
use super::*;
#[test]fn regression_install_native_admission(){
struct Lease(Arc<AtomicBool>);impl InstallLease for Lease{fn exit(&mut self)->Result<(),String>{Ok(())}}
impl Drop for Lease{fn drop(&mut self){self.0.store(true,Ordering::SeqCst);}}
let d=tempfile::tempdir().unwrap();let base=fs::canonicalize(d.path()).unwrap();
let u=SoftwareUpdater::create(base.clone(),Arc::new(install::DenyInstall),Network::production().unwrap(),Target{platform:"macos".into(),architecture:"arm64".into()},"0.1.0".into()).unwrap();
let work=base.join(format!(".CyberNote-update-{}",uuid::Uuid::new_v4()));fs::create_dir(&work).unwrap();
let p=serde_json::json!({"target":base.join("CyberNote.app"),"backup":base.join("old.app"),"executable":"fixture","native_hash":"a".repeat(64),"ack":work.join("ack"),"work":work});fs::write(base.join("pending.json"),serde_json::to_vec(&p).unwrap()).unwrap();
let released=Arc::new(AtomicBool::new(false));*u.install_lease.lock().unwrap()='''+lease+''';
u.inner.lock().unwrap().status.phase="restarting".into();fs::write(work.join("phase"),b"waiting_exit\\n").unwrap();
assert_eq!(u.configure(PreferencePatch{channel:Some(Channel::Preview),..Default::default()}).unwrap_err(),"update_busy");
// Simulate a view mutation separately: cancellation ownership must not depend on it.
u.inner.lock().unwrap().status.phase="idle".into();fs::write(work.join("phase"),b"cancelled\\n").unwrap();assert_eq!(u.status().phase,"error");assert!(released.load(Ordering::SeqCst));assert_eq!(u.inner.lock().unwrap().status.phase,"error");
}}
''')
  env=dict(os.environ,CARGO_TARGET_DIR='/tmp/cybernote-settings121-update-target')
  run=subprocess.run(['cargo','test','--offline','--manifest-path',str(d/'Cargo.toml'),'regression_','--','--test-threads=1'],env=env,capture_output=True,text=True)
  log=run.stdout+run.stderr
  assert ('test result: FAILED' in log) if version!='current' else run.returncode==0,log
  result.append({'source':version,'exit':run.returncode,'expected':'3 behavior regressions fail on frozen source' if version!='current' else '3 behavior regressions pass on fix','tests':next(line for line in run.stdout.splitlines()if line.startswith('test result:'))})
  for line in run.stdout.splitlines():
   if line.startswith('test ') or line.startswith('test result:'):print(version+': '+line)
print(json.dumps({'results':result,'boundary':'Temporary source mirrors and synthesized ZIPs/transactions; no app build or installed bundle.'},indent=2))
