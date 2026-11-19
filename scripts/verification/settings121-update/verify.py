#!/usr/bin/env python3
"""Compile the actual updater modules in an isolated crate (no app/store access).
--commands also typechecks Tauri handlers and real generate_handler registration.
No updater is constructed against production directories; no live feed is used.
"""
import argparse
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import json

args = argparse.ArgumentParser()
args.add_argument('--commands', action='store_true')
args.add_argument('--identity-fixtures', action='store_true')
opt = args.parse_args()
root = Path(__file__).resolve().parents[3]
source = root / 'src-tauri/src/software_update'
version = json.loads((root / 'package.json').read_text())['version']
with tempfile.TemporaryDirectory(prefix='cybernote-update-proof-') as name:
    directory = Path(name)
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
    (directory / 'proof.rs').write_text(text)
    shutil.copyfile(root / 'src-tauri/Cargo.lock', directory / 'Cargo.lock')
    env = dict(os.environ, CARGO_TARGET_DIR='/tmp/cybernote-settings121-update-target')
    # Adapt the copied root lock to the tiny harness using only this host target.
    # Full metadata walks unrelated platform packages that may not be cached.
    subprocess.run(['cargo', 'test', '--offline', '--no-run', '--manifest-path', str(directory / 'Cargo.toml')], env=env, check=True)
    subprocess.run(['cargo', 'test', '--offline', '--locked', '--manifest-path', str(directory / 'Cargo.toml'), '--', '--test-threads=1'], env=env, check=True)

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
