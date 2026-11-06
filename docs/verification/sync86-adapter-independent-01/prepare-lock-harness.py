#!/usr/bin/env python3
"""Reconstruct the review-only harness; never modify repository product sources."""
from pathlib import Path
import shutil
import sys

repo = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=False)
shutil.copytree(repo / "src-tauri/src", output / "current")
for filename in ("Cargo.toml", "Cargo.lock"):
    shutil.copy2(repo / "docs/verification/sync84-core-independent-01/runner" / filename,
                 output / filename)
(output / "root.rs").write_text('''#![allow(dead_code)]
#[path="current/session.rs"] mod session;
#[path="current/store.rs"] mod store;
#[path="current/sync.rs"] mod sync;
''')
session = output / "current/session.rs"
text = session.read_text()
needle = "#[cfg(test)]\nmod tests;"
assert text.count(needle) == 1
session.write_text(text.replace(needle, '#[cfg(test)]\n#[path="session/tests.rs"]\nmod tests;'))
adapter = output / "current/sync/adapter.rs"
adapter.write_text(adapter.read_text() + "\n" +
                   Path(__file__).with_name("independent-mutex-review.rs").read_text())
# Compile-time include_str paths in copied production tests resolve here.
(output.parent / "docs").symlink_to(repo / "docs", target_is_directory=True)
print(output)
