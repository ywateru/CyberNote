# Scoped derived cleanup 01

Completed **2026-11-13** (UTC `2026-11-13T15:05:59.270295+00:00`). Authorized filesystem maintenance only; no source edits, builds, App/ADB, network, credential/DB/grant reads, or extra cleanup.

## Scope and guards

Receipt author worktree: `/private/tmp/cybernote-account109-login-surfaces-ui` at `560106a759d5eab5ec7b9f8be873662dbbdc3424`. Preflight main was `63218a29c2c23d3f71c924d6199df47840dd4556`; postflight main was `e7f398fb92c96d04a5e568811bec5e8c9af63652`. Main progressed independently; this operation did not change its worktree, branch, or commits.

All three worktrees were clean before and after cleanup, with identical HEADs. The six paths introduced by `560106a759d5eab5ec7b9f8be873662dbbdc3424` matched main Git blobs and the author worktree both before and after. Exact paths/blob IDs are in `receipt.json`; no source content was copied.

UI docs were narrowed only through `git sparse-checkout set --cone --stdin`. Every existing tracked product top-level tree remains included, plus `docs/plan`, `docs/architecture`, `docs/ui`, `docs/verification/account109`, and cone-included root/ancestor files. No tracked file was removed with filesystem deletion. The index/sparse configuration changed only in this author worktree; Git source history was retained.

Each of the 12 generated directories was rechecked immediately before removal: canonical path, no symlink in path or subtree, regular files/directories only, zero tracked files, Git ignored, no `lsof +D` output (exit 1, empty stdout/stderr), and no matching build/runtime executable in the process snapshot. Process checks used executable names rather than archiving command arguments. These checks establish observations at deletion time, not a global process lease.

## Measured reductions

Sizes below are allocated `du -sk` observations, before receipt files were created; 1 MiB = 1024 KiB.

| Root | Before KiB | After KiB | Reduction KiB |
|---|---:|---:|---:|
| `/private/tmp/cybernote-account109-login-surfaces-ui` | 1,109,660 | 166,964 | 942,696 |
| `/private/tmp/cybernote-account109-android-72513d12-01` | 200,260 | 172,948 | 27,312 |
| `/private/tmp/cybernote-account109-login-surfaces` | 201,112 | 173,824 | 27,288 |

UI `docs`: **956,364 → 13,668 KiB**. Sparse excluded **19,360** tracked regular files with **920,970,026 logical bytes** and **965,320,704 allocated bytes** (920.60 MiB). Count and path-list hash are retained, rather than a large historical file list.

The 12 generated directories contributed **54,600 KiB (53.32 MiB)**. Combined root `du` reduction: **997,296 KiB (973.92 MiB)**. Combined removed regular-file logical sizes: **967,022,937 bytes**; logical lengths and allocated blocks are different measures.

Filesystem `df -k` Available: **21,842,720 → 22,802,900 KiB**, an observed increase of **960,180 KiB (937.68 MiB)**. Immediate post-sparse and generated-cleanup observations are retained in JSON. These are filesystem-wide observations; concurrent writes, APFS shared extents and filesystem accounting prevent assigning the entire change exclusively to this operation. No exclusive physical-reclamation figure is claimed.

## Exact generated-directory removals

| Removed directory | Allocated KiB before |
|---|---:|
| `/private/tmp/cybernote-account109-android-72513d12-01/plugins/tauri-plugin-notes-auth/android/.tauri` | 8,048 |
| `/private/tmp/cybernote-account109-android-72513d12-01/plugins/tauri-plugin-notes-media/android/.tauri` | 8,048 |
| `/private/tmp/cybernote-account109-android-72513d12-01/plugins/tauri-plugin-notes-scan/android/.tauri` | 8,048 |
| `/private/tmp/cybernote-account109-android-72513d12-01/src-tauri/gen/android/.gradle` | 2,068 |
| `/private/tmp/cybernote-account109-android-72513d12-01/src-tauri/gen/android/app/build/kotlin` | 940 |
| `/private/tmp/cybernote-account109-android-72513d12-01/src-tauri/gen/android/app/build/tmp` | 160 |
| `/private/tmp/cybernote-account109-login-surfaces/plugins/tauri-plugin-notes-auth/android/.tauri` | 8,048 |
| `/private/tmp/cybernote-account109-login-surfaces/plugins/tauri-plugin-notes-media/android/.tauri` | 8,048 |
| `/private/tmp/cybernote-account109-login-surfaces/plugins/tauri-plugin-notes-scan/android/.tauri` | 8,048 |
| `/private/tmp/cybernote-account109-login-surfaces/src-tauri/gen/android/.gradle` | 2,044 |
| `/private/tmp/cybernote-account109-login-surfaces/src-tauri/gen/android/app/build/kotlin` | 940 |
| `/private/tmp/cybernote-account109-login-surfaces/src-tauri/gen/android/app/build/tmp` | 160 |

## Preserved boundaries

Both checkout `dist` directories and both `src-tauri/gen/android/app/build/outputs/logs` directories remain present with identical filename/SHA-256 inventories. Their compact inventories are included in JSON. No whole `app/build` directory was removed.

The prior two ~724 MiB cleanup results were not counted again: both roots' `app/build/intermediates` and `app/build/outputs/apk` were absent before and remain absent.

All candidate packages/wrappers/platform-dist copies, original stores, failed run/build evidence, private snapshots, authorization data, dependency symlinks and Gradle cache roots remain outside this cleanup. The sole shared target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` was not traversed or changed; its directory existence was checked only.

This receipt is a docs-only commit in the existing author worktree for parent cherry-pick. Source/HEAD clean checks refer to the point after cleanup and before adding this receipt. No product tests were run for filesystem maintenance.
