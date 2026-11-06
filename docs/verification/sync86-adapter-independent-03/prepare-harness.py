#!/usr/bin/env python3
"""Create an isolated pinned-source resolve review harness (no checkout edits)."""
from pathlib import Path
import subprocess
import sys

repo = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
baseline = len(sys.argv) > 3 and sys.argv[3] == "baseline"
frozen = ("17af6dfc148e5d84de924ac47b69611e627e5722" if baseline else
          "cd334bc88513a89c490788d2e2e27c7967575f4a")
package = "notes-sync86-independent-resolve-" + ("baseline" if baseline else "review")
output.mkdir(parents=True, exist_ok=False)

def read(path):
    return subprocess.check_output(["git", "show", frozen + ":" + path], cwd=repo)

paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", frozen,
                                 "src-tauri/src"], cwd=repo, text=True).splitlines()
for path in paths:
    p = output / "current" / path.removeprefix("src-tauri/src/")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(read(path))
for name in ("Cargo.toml", "Cargo.lock"):
    (output / name).write_bytes(read("docs/verification/sync84-core-independent-01/runner/" + name))
p = output / "Cargo.toml"
p.write_text(p.read_text().replace('name = "notes-sync84-store-tests"', f'name = "{package}"'))
(output / "root.rs").write_text('''#![allow(dead_code)]
#[path="current/session.rs"] mod session;
#[path="current/store.rs"] mod store;
#[path="current/sync.rs"] mod sync;
''')
p = output / "current/session.rs"
p.write_text(p.read_text().replace("#[cfg(test)]\nmod tests;",
                                 '#[cfg(test)]\n#[path="session/tests.rs"]\nmod tests;'))
(output / "current/sync/adapter_resolve_tests.rs").write_bytes(
    Path(__file__).with_name("reviewer-resolve-fixture.rs").read_bytes())
if baseline:
    p = output / "current/sync/adapter.rs"
    p.write_text(p.read_text() + '\n#[cfg(test)]\n#[path="adapter_resolve_tests.rs"]\nmod resolve_tests;\n')
(output.parent / "docs").symlink_to(repo / "docs", target_is_directory=True)
print(output)
