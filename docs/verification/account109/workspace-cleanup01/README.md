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

## Separately authorized old publish incremental cleanup

At `2026-11-13T10:33:03.142979+00:00`, removed only `/private/tmp/account109-publish-cargo/debug/incremental` after rechecking exact canonical realpath, no symlink components, current-UID ownership (directory and all entries), no compiler processes, no publish-target process arguments/cwds and no open files (`lsof` exit 1, empty output/stderr). Allocated before was **1,349,832,704 bytes** (1.257 GiB), after **0 / directory absent**. Actual `df -kP /private/tmp` available was **13,412,503,552 → 14,298,886,144 bytes**, delta **+886,382,592 bytes** (+0.826 GiB); this independent filesystem-wide observation is not equated with du accounting or exclusively attributed to this cleanup. Sibling `deps` and `build` remain present with identical inode/device identities. No source, candidate, evidence, store, DRAFT or shared native target was selected. GUI checkout retirement was checked separately below. No new controller/cache/test was created.

## Separately authorized completed GUI checkout retirement

At `2026-11-13T10:35:58.110710+00:00`, retired only `/private/tmp/cybernote-account109-gui-startup-9e7c46d2-01` with normal `git worktree remove` (**no force**) after Huygens explicitly confirmed no current references: GUI build and DRAFT export were complete, and current UI work uses an independent checkout. The retired checkout was detached at exact `9e7c46d2fcc8ed31bf1210ce4272f73edffe9143`, reachable from main, with empty nonignored status. Canonical path/ancestor non-symlink checks and current-UID ownership passed. Its 15 ignored entries were generated dist/schema/tsbuildinfo files and the node_modules symlink. Compiler count, process-argument/cwd references and open files were all zero; process details remained in memory. The directory and worktree registration are now absent; the source commit remains present and reachable from main. No branch/ref deletion or prune was requested.

Allocated before was **1,137,381,376 bytes**, after **0 / directory absent**. Separate filesystem available observations were **14,195,544,064 → 15,347,220,480 bytes**, delta **+1,151,676,416 bytes**; this filesystem-wide delta is not equated with allocated accounting or attributed entirely to removal. All **35 files** in the independent candidate artifact and build/package-review/live02/independent-live02-review archives retained their exact SHA256 hashes across retirement. Candidate SHA256 remains `3fa9a3851e610348352f5594f976f145e2d344fd97a9f0d27124566f458ce65c`. Historical receipt paths remain provenance, not live dependencies. External shared target was neither traversed nor modified; artifacts, records, old GUI checkouts, original stores and sealed DRAFTs were not selected. No build, test, App, ADB or network operation occurred.

## Separately authorized three completed GUI source checkouts

At `2026-11-13T10:48:47.863960+00:00`, retired only the three source copies below. All passed preflight, then canonical path/ancestor non-symlink, exact detached source, empty nonignored status and exact-path process/cwd/open-file checks again immediately before ordinary `git worktree remove`; all three commands exited 0 **without force**. Subtree ownership was current UID. Each contained 15 ignored generated entries (dist, schema JSON, tsbuildinfo and the node_modules symlink), with no uncommitted nonignored content. Unrelated compiler processes were not a rejection criterion. No raw process inventory was saved.

| Removed checkout under `/private/tmp/` | Exact source | Allocated before (bytes) |
| --- | --- | ---: |
| `cybernote-account109-gui-explicit-login-01` | `920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11` | 1,135,996,928 |
| `cybernote-account109-gui-token-diagnostics-01` | `d1a6eadfd62ac45ba4ecb82e39dd3bd61fd4f5b4` | 1,135,816,704 |
| `cybernote-account109-gui-reauth-01` | `10814415ca088273bacc311d192b9605bda16775` | 1,134,489,600 |

All three directories and worktree registrations are absent. All three source objects remain present and reachable from main; no branches/refs were deleted. Total selected-path allocated accounting fell **3,406,303,232 → 0 bytes**. Separate `df -kP /private/tmp` available observations were **15,011,274,752 → 18,425,548,800 bytes**, delta **+3,414,274,048 bytes**; this filesystem-wide delta is not equated with du or attributed wholly to the removals.

Before removal, each independent artifact build-record matched the exact source/root and known actual candidate SHA256 (`bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd`, `bb45bfe591463c4197e8f856090daf666b6b22031bc240b6c52f10b28b5cc5b5`, `b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f`, respectively). Independent main build/review archive files were committed exact bytes; all five available archive SHA256SUMS verified. All **67 files** across the three artifact directories and six independent build/review archives retained exact hashes afterward. Historical checkout paths remain provenance. Candidate binaries, records, shared target, original stores and sealed source roots were not selected; shared target was neither traversed nor modified. No controller, build, test, App, ADB or network operation was added.
