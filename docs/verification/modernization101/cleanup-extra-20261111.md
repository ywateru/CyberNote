# Exact closed-test thumbnail cache cleanup —2026-11-11

Parent authorized only the200 PNGs enumerated by the independent candidate report. Deleted **200 files**, **122,600,070 logical bytes**, **123,035,648 recorded allocated bytes** (117.3MiB). No directories were deleted; both exact media-cache roots remain, empty. No items were skipped.

Fresh scoped executable checks found no Cargo/rustc/Gradle/java or owned measurement command matches. Exact `lsof +D` checks for both directories returned exit1 with empty stdout/stderr. The existing firstparty esbuild `--service` process was observed and left untouched; no application/global cache was included. These checks are point-in-time scoped guards, not a universal inactivity proof.

Each path was required to remain under the two exact allowed roots and retain regular-file type, device, inode, size, nanosecond mtime, nlink1 and recorded allocation matching the frozen list. Parent directories were verified ordinary directories; PNG signature and a second exact stat were checked immediately before unlink. Only individual listed paths were unlinked. The production cache generator is `src-tauri/src/attachment_media/thumbnail.rs::get`, using attachment identity/version/pixel PNG keys; runtime constructs ThumbnailCache. Closed-run configurations and existing independent reviews establish these roots as generated derivatives. They are distinct from original attachment hardlinks and saved raw HTTP PNG/ROI evidence.

DB/attachments entries and sibling raw files retained identical pre/post stat snapshots. Original fixture/media, packages, actual entries, codegen/frontends, shared dependencies and all other caches were outside the allowlist. No installation-package rehash or UI/device/build/test was performed.

Available filesystem bytes changed by **123,277,312B** during the operation. This net observation is not asserted as exclusive physical space freed; concurrent filesystem activity/APFS accounting may differ from recorded allocation.

Exact expected/before/after per-file data, source-list SHA, process/open-handle guards, protected snapshots, timestamps and free-space readings: `artifacts/modernization101/cleanup-extra-executed-20261111.json`.
