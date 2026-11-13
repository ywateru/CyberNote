# Exact fifteen-path cache cleanup

**PASS — only the fifteen explicitly authorized generated-cache directories were removed.** All fifteen passed preflight before deletion began. Each path was rechecked immediately before its own deletion. Exact paths, inode/device identities, checks and measurements are in receipt.json; cleanup.py preserves the executed procedure.

Every requested path resolved to itself and every ancestor was an actual directory, with no symlink components. Each subtree had zero tracked files and was gitignored. Process argument references and cwd references to each candidate worktree were zero; lsof +D found no open files under each selected directory. Raw process command lines, cwd inventories and lsof payloads were kept in memory and not archived. These are bounded point observations, not a global filesystem lock or a promise of future inactivity.

| Measurement | Before | After | Difference |
| --- | ---: | ---: | ---: |
| Selected paths, allocated (`du -sk -P`) | 1,027,026,944 bytes (979.45 MiB) | 0 bytes; all paths absent | 979.45 MiB removed from selected-path accounting |
| Filesystem available (`df -kP /private/tmp`) | 19,553,488,896 bytes (18.211 GiB) | 20,104,085,504 bytes (18.723 GiB) | +550,596,608 bytes (+525.09 MiB) |

The df delta is a separate filesystem-wide observation during this interval. Concurrent work, APFS sharing and hardlinks can change available space; it is not an attribution of the entire delta to these deletions. No equality between allocated totals and released physical space is claimed.

The authorized set consists of the old auth crate's incremental directory, delivery/server standalone node_modules, and four named Android compiler-cache subdirectories in each of three historical Android worktrees. No whole worktree, dist, deps/build tree, APK output, candidate binary, original test data, evidence or sealed DRAFT was selected. The shared `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` was neither traversed nor modified. Active author/reviewer working directories were excluded. No product/source edit, App, ADB, network, build, install or test occurred.

Only this new docs record was added in the existing isolated codex/account109-test-audit worktree. SHA256SUMS covers every record file except itself. The record commit is for parent cherry-pick; no main staging or commit was performed.
