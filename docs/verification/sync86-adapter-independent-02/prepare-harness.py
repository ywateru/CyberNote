#!/usr/bin/env python3
"""Copy pinned git objects plus review tests into a new disposable harness."""
from pathlib import Path
import subprocess
import sys

repo = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
frozen = "17af6dfc148e5d84de924ac47b69611e627e5722"
evidence = Path(__file__).resolve().parent
output.mkdir(parents=True, exist_ok=False)

def read(path):
    return subprocess.check_output(["git", "show", f"{frozen}:{path}"], cwd=repo)

paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", frozen,
                                 "src-tauri/src"], cwd=repo, text=True).splitlines()
for path in paths:
    target = output / "current" / path.removeprefix("src-tauri/src/")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(read(path))
for name in ("Cargo.toml", "Cargo.lock"):
    (output / name).write_bytes(read("docs/verification/sync84-core-independent-01/runner/" + name))
(output / "root.rs").write_text('''#![allow(dead_code)]
#[path="current/session.rs"] mod session;
#[path="current/store.rs"] mod store;
#[path="current/sync.rs"] mod sync;
''')
p = output / "current/session.rs"
text = p.read_text()
needle = "#[cfg(test)]\nmod tests;"
assert text.count(needle) == 1
p.write_text(text.replace(needle, '#[cfg(test)]\n#[path="session/tests.rs"]\nmod tests;'))
for target, source in (("sync/adapter.rs", "independent-mutex-recheck.rs"),
                       ("sync/adapter.rs", "independent-retry-recheck.rs"),
                       ("store/synchronization/media.rs", "independent-proof-recheck.rs")):
    p = output / "current" / target
    p.write_text(p.read_text() + (evidence / source).read_text())
# Compile-time fixtures are immutable project evidence, not user data.
(output.parent / "docs").symlink_to(repo / "docs", target_is_directory=True)
print(output)
