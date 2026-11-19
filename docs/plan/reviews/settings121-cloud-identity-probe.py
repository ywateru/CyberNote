#!/usr/bin/env python3
"""Run only the adjacent probe against this tree's production modules, offline.

All app data, generated Cargo files and build output live in a private temporary
directory. This does not compile Tauri, invoke Cloud modules or access accounts.
"""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[3]
harness = root / "src-tauri/src/application/harness"
with tempfile.TemporaryDirectory(prefix="settings121-review-identity-") as temporary:
    probe = Path(temporary)
    (probe / "src").mkdir()
    # Retain the existing lean harness dependency resolution and package name.
    (probe / "Cargo.toml").write_bytes((harness / "Cargo.toml").read_bytes())
    (probe / "Cargo.lock").write_bytes((harness / "Cargo.lock").read_bytes())
    source = Path(__file__).with_suffix(".rs").read_text()
    (probe / "src/main.rs").write_text(source.replace("__ROOT__", str(root)))
    env = dict(os.environ, CARGO_TARGET_DIR=str(probe / "target"))
    subprocess.run(
        ["cargo", "run", "--offline", "--locked", "--quiet", "--manifest-path", str(probe / "Cargo.toml")],
        env=env, check=True,
    )
