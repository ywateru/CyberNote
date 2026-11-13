# Workspace audit — 2026-11-13

Read-only inventory taken approximately 11:38–11:41 +08:00 (Asia/Shanghai). The only audit write is this report. No staging, commits, resets, cleanup, pruning, builds, runtime/device operations, network calls, or remote writes were performed. Remote state was not queried; absence of remote writes here describes this audit, not other agents' activity.

**Finding:** all 20 valid existing worktrees had zero tracked modifications. Main had no uncommitted live product or verification-script changes. Its eight untracked files were another reviewer's recovery evidence under docs. Two historical worktrees had 279 untracked generated/dependency files in total; no first-party implementation integration candidate was identified among those paths.

## Evidence and limits

- Used local `git worktree list --porcelain`, `git status --porcelain=v1 -z --untracked-files=all`, `git ls-files --others --ignored --exclude-standard --directory --no-empty-directory -z`, and main HEAD/log metadata, with `GIT_OPTIONAL_LOCKS=0`.
- Registry contained 62 entries: 20 valid existing worktrees and 42 prunable registrations. Five prunable directories were missing; 37 still existed as directory remnants. Prunable entries were excluded from the table, even when their directories remained. Nothing was pruned or removed.
- Classification uses Git status and path metadata only. No secret/auth/grant files, credentials, private runtime artifacts, or ignored-file contents were opened. Generated directories were inventoried by names, without content inspection.
- Other agents were active, so this is a bounded, non-atomic snapshot. Main advanced from `e037eddec32a0dfdd1f178fa09430c43a4751136` at the initial observation through `bc86a8ca5eaa` to `dedc6964b5258bf6876b45e0918f2bf5657109d0` at 11:40:43 +08:00. A transient tracked edit to `docs/verification/account109/WORKSPACE-COMMITS.md` disappeared as main advanced; the final main check had no tracked changes.
- After this report was written, main advanced again to `e5fb6eab5e4c8729bd498a1e56615d3f3c9150a1`. The closing status showed only this report as untracked: the recovery-review evidence was no longer pending. The table preserves the earlier inventory rather than attributing concurrent integration to this audit.
- This inventories working files; it does not establish whether every historical branch commit has been integrated, inspect ignored contents for unpublished source, or inventory standalone target directories outside registered worktrees. No size, ownership, retention, or deletion decision is inferred from cache names.

## Existing valid worktrees

All rows have **0 tracked modifications**. `Ignored` is the number of Git-reported ignored path entries, with directories collapsed; it is not a file count or byte size. Worktrees use their registered paths below, including detached checkouts.

| Worktree | HEAD observed | Untracked files | Ignored | Path classification |
|---|---|---:|---:|---|
| `/Users/water/work/2026/Apple-Notes-Clone` (main) | `dedc6964b525` | 8 | 118 | Recovery review docs/evidence; ignored builds, dependencies, logs and historical artifacts |
| `/private/tmp/cybernote-account109-android` | `6537b74bf2c9` | 0 | 21 | Android/build/dependency/artifact residue |
| `/private/tmp/cybernote-account109-android-90b8b28b-01` (detached) | `9263ea87b5f6` | 0 | 21 | Android/build/dependency/artifact residue |
| `/private/tmp/cybernote-account109-android-d69-debug` | `d69ffbce2ad1` | 0 | 21 | Android/build/dependency/artifact residue |
| `/private/tmp/cybernote-account109-auth` | `9ec4172c82c4` | 0 | 1 | Rust target directory |
| `/private/tmp/cybernote-account109-coordination-diagnostics` | `b396582a6f45` | 0 | 2 | Dependencies/native generated files |
| `/private/tmp/cybernote-account109-delivery` | `bb4d4ef3548a` | 0 | 2 | Dependencies/native generated files |
| `/private/tmp/cybernote-account109-jwks-errors` | `d3c0ea8e2853` | 0 | 1 | Service dependencies |
| `/private/tmp/cybernote-account109-mac-ec4348c6-01` (detached) | `ec4348c6df15` | 0 | 4 | Frontend/native build output and dependencies |
| `/private/tmp/cybernote-account109-native` | `9103dbc99693` | 0 | 5 | Native/plugin generated files, dependencies, artifacts |
| `/private/tmp/cybernote-account109-server` | `9a0c7f152f42` | 0 | 2 | Service dependencies and static deployment output |
| `/private/tmp/cybernote-account109-test-audit` | `9059a4650d71` | 0 | 0 | Clean |
| `/private/tmp/cybernote-account109-ui` | `97cd013cb919` | 0 | 68 | Frontend dependencies/output, ignored UI evidence and logs |
| `/private/tmp/cybernote-android-manifest103` | `6578613a40d3` | 0 | 0 | Clean |
| `/private/tmp/cybernote-delivery` | `5b15ce1d96ef` | 0 | 70 | Frontend dependencies/output, historical artifacts and logs |
| `/private/tmp/cybernote-interface-settings` | `988ade3b185c` | 168 | 42 | 139 Android build files plus 29 Tauri dependency files; other ignored outputs |
| `/private/tmp/cybernote-svg104` | `59cbbf74822c` | 0 | 3 | Historical review logs |
| `/private/tmp/cybernote-sync108` | `9d72db2fb060` | 0 | 4 | Frontend dependencies/output and generated schemas |
| `/private/tmp/cybernote-sync108-android` | `7000cdde141d` | 111 | 22 | Android build files; other ignored outputs/dependencies |
| `/private/tmp/cybernote-sync108-driver` | `fe10afa6df7b` | 0 | 1 | Dependencies |

## Paths requiring integration or retention decisions

**Main documentation evidence:** the only pre-existing untracked main paths were under `docs/verification/account109/macos/recovery-runner-review01/`: `checks.json`, `inputs.json`, and six source snapshots under `source/` (`account109-desktop-helpers.mjs`, `account109-desktop-helpers.test.mjs`, `account109-desktop-recovery.mjs`, `account109-desktop-recovery.test.mjs`, `sync108-native-driver.mjs`, `sync108-native-driver.test.mjs`). These are review evidence copies, not live `scripts/verification/` modifications. Leave them to the owning reviewer/parent for content review and explicit archival integration. None were opened, staged, or changed by this audit. This report is the audit's additional documentation candidate.

**Historical generated files reported as untracked:** all 111 files in `/private/tmp/cybernote-sync108-android` are beneath `plugins/tauri-plugin-notes-media/android/build/`. In `/private/tmp/cybernote-interface-settings`, 139 are beneath that same relative build path and 29 beneath `plugins/tauri-plugin-notes-media/android/.tauri/tauri-api/`. The latter contains copied Tauri dependency sources/build metadata, including Kotlin files; its source extensions do not make it first-party pending implementation. The build files include Gradle intermediates, Kotlin caches/classes, transformed outputs and logs. Preserve with their historical worktrees pending an owner retention decision; do not stage as product changes.

**Ignored historical output:** path inventory includes `node_modules/`, `dist/`, Rust targets, `src-tauri/gen/schemas/`, Android Gradle/build directories, generated Android assets/JNI libraries/Tauri files, `*.tsbuildinfo`, service `.vercel-static/`, probe `.build/`, logs, `artifacts/`, `tmp/`, `output/`, ignored UI evidence, and older `docs/verification/**/prior-outputs/` and runtime/fixture directories. These are output/dependency/evidence categories, not an automatic cleanup list. Private artifacts remain excluded from content review. External shared target directories and their reservations were not touched.

No uncommitted first-party product or live runner code requiring integration was found within the inspected Git status scope. All remote writes remained absent from this audit.
