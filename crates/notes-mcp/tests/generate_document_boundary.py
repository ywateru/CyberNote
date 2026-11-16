"""Generate real service boundary DTOs without changing/running the 111 worktree.

Extract the pinned production source from Git into a fresh temporary directory,
append only our test module, and run its actual application harness on temp SQLite.
No Tauri build, app, user database, credential, or real window is involved.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

CRATE = Path(__file__).resolve().parents[1]
REPO = CRATE.parents[1]
SOURCE = "eb9cee7d3ad1bf90a317ce9c286c653094512f90"
TARGET = "/tmp/evolve112-adapter-native-boundary-target"

if __name__ == "__main__":
    commit = subprocess.check_output(["git", "rev-parse", SOURCE], cwd=REPO, text=True).strip()
    fixture = CRATE / "tests/fixtures/document-boundary.json"
    with tempfile.TemporaryDirectory(prefix="e112-adapter-native-") as directory:
        root = Path(directory)
        archive = subprocess.Popen(["git", "archive", commit, "src-tauri/src", "src-tauri/tests", "docs/fixtures"],
                                   cwd=REPO, stdout=subprocess.PIPE)
        try:
            subprocess.run(["tar", "-x", "-C", str(root)], stdin=archive.stdout, check=True)
        finally:
            archive.stdout.close()
        if archive.wait() != 0:
            raise RuntimeError("git archive failed")
        test = CRATE / "tests/native/document_boundary.rs"
        tests = root / "src-tauri/src/application/tests.rs"
        with tests.open("a") as stream:
            stream.write("\n#[path = " + json.dumps(str(test)) + "]\nmod adapter_document_boundary;\n")
        env = dict(os.environ, CARGO_TARGET_DIR=TARGET, ADAPTER_DOCUMENT_FIXTURE=str(fixture))
        subprocess.run(["cargo", "test", "--locked", "--offline", "--manifest-path",
                        str(root / "src-tauri/src/application/harness/Cargo.toml"),
                        "adapter_document_node_and_depth_boundaries", "--", "--nocapture"],
                       env=env, check=True)
    source = {
        "sourceCommit": commit,
        "sourcePath": "src-tauri/src/application/document.rs",
        "sourceGitBlob": subprocess.check_output(["git", "rev-parse", commit + ":src-tauri/src/application/document.rs"], cwd=REPO, text=True).strip(),
        "generatorSha256": hashlib.sha256(test.read_bytes()).hexdigest(),
        "sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
        "independentF1FixtureSha256": "5966d0b580c459ba02e814f93853ba870a371674c9100372130bb7f12b1e1396",
        "description": "Actual create/update/read service DTOs and separately labeled resource-only checks; generated against pinned production source, not a running host or real windows."
    }
    fixture.with_suffix(".source.json").write_text(json.dumps(source, indent=2) + "\n")
    print(json.dumps(source, indent=2))
