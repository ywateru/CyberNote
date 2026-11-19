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
    subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(directory / 'Cargo.toml'), '--', '--test-threads=1'], env=env, check=True)
