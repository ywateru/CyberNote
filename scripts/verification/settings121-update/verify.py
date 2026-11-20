#!/usr/bin/env python3
"""Compile the actual updater modules in an isolated crate (no app/store access).
--commands also typechecks Tauri handlers and real generate_handler registration.
No updater is constructed against production directories. --live-release
additionally checks the public feed using the production HTTP client on this host.
"""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import json

args = argparse.ArgumentParser()
args.add_argument('--commands', action='store_true')
args.add_argument('--identity-fixtures', action='store_true')
args.add_argument('--source-ref', help='Compile updater modules from this exact Git revision')
args.add_argument('--live-download', action='store_true', help='Download and verify the live package in a temporary directory')
args.add_argument('--live-release', nargs=2, metavar=('INSTALLED', 'EXPECTED'))
opt = args.parse_args()
if opt.live_download and not opt.live_release:
    args.error('--live-download requires --live-release')
root = Path(__file__).resolve().parents[3]
source = root / 'src-tauri/src/software_update'
def source_file(path):
    if opt.source_ref:
        return subprocess.check_output(['git', 'show', '--end-of-options', f'{opt.source_ref}:{path}'], cwd=root)
    return (root / path).read_bytes()

version = json.loads(source_file('package.json'))['version']
with tempfile.TemporaryDirectory(prefix='cybernote-update-proof-') as name:
    directory = Path(name)
    if opt.source_ref:
        source = directory / 'software_update'
        source.mkdir()
        revision = subprocess.check_output(['git', 'rev-parse', '--verify', '--end-of-options', opt.source_ref + '^{commit}'], cwd=root, text=True).strip()
        entries = subprocess.check_output(['git', 'ls-tree', '--name-only', revision, 'src-tauri/src/software_update/'], cwd=root, text=True)
        for path in entries.splitlines():
            (source / Path(path).name).write_bytes(source_file(path))
    dependencies = '''serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
sha2 = "0.10"
flate2 = "1"
crc32fast = "1"
uuid = { version = "1", features = ["v4"] }
libc = "0.2"
tokio = { version = "1", features = ["rt-multi-thread", "net", "time", "sync", "macros", "io-util", "test-util"] }
'''
    if opt.commands:
        dependencies += 'tauri = { version = "2", default-features = false }\n'
    (directory / 'Cargo.toml').write_text(f'''[package]
name = "software-update-proof"
version = "{version}"
edition = "2021"
[lib]
path = "proof.rs"
[dependencies]
{dependencies}
[dev-dependencies]
tempfile = "3"
''')
    modules = ['archive', 'feed', 'install', 'network', 'service', 'storage', 'version']
    text = '\n'.join(f'#[path = "{source / (m + ".rs")}"]\nmod {m};' for m in modules)
    text += '\npub use service::{SoftwareUpdater,Status,UpdateScheduler};\npub use storage::PreferencePatch;\npub use install::{DenyInstall,InstallGuard,InstallLease};\n'
    if opt.commands:
        text += f'#[path = "{source / "commands.rs"}"]\nmod commands;\n'
        text += '''pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
 builder.invoke_handler(tauri::generate_handler![commands::software_update_status,commands::software_update_configure,commands::software_update_check,commands::software_update_download,commands::software_update_install])
}
'''
    if opt.live_release:
        installed, expected = (json.dumps(v) for v in opt.live_release)
        text += f'''
#[tokio::test]
async fn production_release_check() {{
    let directory = tempfile::tempdir().unwrap();
    let updater = SoftwareUpdater::new(directory.path().join("update"), std::sync::Arc::new(DenyInstall)).unwrap();
    assert_eq!(updater.status().current_version, {installed});
    let mut channels = vec![storage::Channel::Preview];
    if !{expected}.contains('-') {{ channels.push(storage::Channel::Stable); }}
    for channel in channels {{
        updater.configure(PreferencePatch {{ channel: Some(channel), ..Default::default() }}).unwrap();
        let status = updater.check().await.unwrap();
        assert_eq!(status.phase, "available");
        assert_eq!(status.downloaded, 0);
        let release = status.release.unwrap();
        assert_eq!(release.version, {expected});
        println!("production feed: {{}} → {{}} ({{}}, {{}} bytes)", status.current_version, release.version, release.package, release.size);
    }}
    if {str(opt.live_download).lower()} {{
        let status = updater.download().await.unwrap();
        assert_eq!(status.phase, "ready");
        println!("production package: {{}} bytes downloaded and verified", status.downloaded);
    }}
}}
'''
    (directory / 'proof.rs').write_text(text)
    (directory / 'Cargo.lock').write_bytes(source_file('src-tauri/Cargo.lock'))
    env = dict(os.environ, CARGO_TARGET_DIR='/tmp/cybernote-settings121-update-target')
    if opt.live_release:
        env['CYBERNOTE_RELEASE_VERSION'] = opt.live_release[0]
    # Adapt the copied root lock to the tiny harness using only this host target.
    # Full metadata walks unrelated platform packages that may not be cached.
    subprocess.run(['cargo', 'test', '--offline', '--no-run', '--manifest-path', str(directory / 'Cargo.toml')], env=env, check=True)
    tests = ['production_release_check'] if opt.live_release else []
    subprocess.run(['cargo', 'test', '--offline', '--locked', '--manifest-path', str(directory / 'Cargo.toml'), *tests, '--', '--test-threads=1', '--nocapture'], env=env, check=True)

if opt.identity_fixtures:
    # A tiny actual-source harness compiles each option_env variant without rebuilding the app.
    for identity in [None, '', '0.1.0-preview.1']:
        with tempfile.TemporaryDirectory(prefix='cybernote-update-identity-') as temp:
            directory=Path(temp)
            (directory/'Cargo.toml').write_text('[package]\nname="software-update-identity-proof"\nversion="'+version+'"\nedition="2021"\n[lib]\npath="proof.rs"\n')
            (directory/'proof.rs').write_text('#[path = "'+str(source/'version.rs')+'"] mod version;\n#[test] fn compiled_identity() { let expected="'+(identity or version)+'"; assert_eq!(version::current_version(),expected); let next="0.1.0-preview.2"; if expected=="0.1.0-preview.1" {assert!(version::validate_install_version(next,"0.1.0").is_ok());} else {assert!(version::validate_install_version(next,"0.1.0").is_err());} assert!(version::validate_install_version("0.1.0-preview.1","0.1.0").is_err()); assert!(version::validate_install_version("0.2.0","0.0.9").is_err()); }\n')
            fixture_env=dict(os.environ,CARGO_TARGET_DIR='/tmp/cybernote-settings121-update-target')
            fixture_env.pop('CYBERNOTE_RELEASE_VERSION',None)
            if identity is not None:fixture_env['CYBERNOTE_RELEASE_VERSION']=identity
            subprocess.run(['cargo','test','--offline','--manifest-path',str(directory/'Cargo.toml')],env=fixture_env,check=True)
