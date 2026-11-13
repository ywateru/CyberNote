# Scoped derived cleanup 01 — independent review

**APPROVE**. Read-only verification on 2026-11-13 against main `66177e902952f1847a21e9575260feb6e216e1e4`, reviewing author `5f1febfbad4e9bd747ffcdb060abc0590b0078dc`. No blocking findings.

## Independently checked

- Both entries in the original `SHA256SUMS` match the exact committed README/JSON bytes. The author commit adds only those three receipt files, equals main's receipt bytes, and has pre-cleanup UI `560106a7` as its parent.
- All 12 exact generated-directory paths are absent, including dangling-link checks. The previously removed `intermediates` and `outputs/apk` paths remain absent in both build roots and are not counted again.
- Both preserved `dist` inventories (9 files each) and both `outputs/logs` inventories (1 file each) exactly match receipt filenames and SHA-256 hashes: 20 files total. Receipt JSON contains compact independently computed inventory hashes using sorted-key compact JSON.
- Two archived Android APKs (`88b2dabe`, `72513d12`) and the archived macOS `72513d12` executable retain their expected byte lengths and SHA-256 values; exact public artifact paths/hashes are in this review JSON. The sole shared target directory exists; its contents were not traversed.
- UI cone sparse scopes exactly equal the authorized list, including every tracked non-doc top-level tree and `docs/plan`, `docs/architecture`, `docs/ui`, `docs/verification/account109`. Git-tree metadata independently yields 19,360 excluded regular files / 920,970,026 logical bytes and 1,400 retained prior tracked docs. Both original path-list hashes reproduce using sorted relative paths joined by LF without a trailing LF. All excluded paths are absent and retained prior docs exist. An additional 44 excluded Git symlink entries are absent, checked without following their destinations; these are outside the receipt's regular-file counts and byte totals.
- The six named UI receipt/runner files retain matching Git blobs across UI pre-cleanup HEAD, author HEAD, main preflight/postflight and reviewed main; materialized UI bytes match too.
- All three scoped worktrees were clean before writing this independent review. Old build HEAD remains `72513d12`; this reviewer started at `76fe3dfd`. UI HEAD is now `5f1febfb`, the allowed receipt-only successor to `560106a7`. This does not contradict the author's clean/unchanged-HEAD observations made before adding their receipt. This new review is likewise a docs-only successor in the existing reviewer worktree.

## Measurement meaning and limits

The receipt arithmetic checks: allocated root `du -sk` decreases total **997,296 KiB = 973.92 MiB**, including generated directories **54,600 KiB = 53.32 MiB**. Removed regular-file logical lengths total **967,022,937 bytes**. The 973.92 MiB figure is allocated `du`, not logical byte length.

Recorded filesystem-wide `df` Available moves **21,842,720 → 22,802,900 KiB**, or **960,180 KiB = 937.68 MiB**. This is a concurrent observation, not proof of exclusively reclaimed physical space or a causal attribution to cleanup. Historical before/after measurements, deletion-time canonical/ignored/open-file/process guards, and statements that no out-of-scope paths were mutated remain author evidence; this review does not recreate those past conditions or claim a global lease. No fresh `du`/`df` measurement was substituted for the recorded interval.

No private snapshots, stores, DB, grant or credential contents were read. No App/device/network/build/deletion or shared-target traversal occurred. Preservation checks are bounded to the exact dist/log inventories, three explicit archived candidate files and target-directory existence; they do not purport to hash every excluded artifact or private store.

## Review receipt

`receipt.json` records immutable refs, observed clean heads, finite check results, hashes and limits. `SHA256SUMS` covers this README and JSON. Validation: direct Git/blob and filesystem/hash assertions, arithmetic, `git diff --check`, receipt checksum verification. No product build or test was needed for this filesystem-maintenance review.
