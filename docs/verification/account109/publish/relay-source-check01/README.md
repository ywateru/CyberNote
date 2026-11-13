# Relay source publishing validation

PASS — 2026-11-13 UTC. Exact committed source: `ec4147b6fdd7656a794f126d5860ca60eec891b6`. Parent advanced HEAD to `c43e708ca64ef87517b30d1be9ba95e629d5c716` during preparation; the delta from the requested source contains only docs/live evidence. The initial HEAD-equality preflight guard stopped before tests/export/snapshots; after confirming the docs-only delta, the guard was scoped to the requested source. Each requested test suite and export command ran once.

## Exact source and manifest

- Reviewed cherry-pick: `f84bb9e15921ccea45dc1cdadd2244d02a23d94b`.
- Author commit: `d3a5f10e000aa24936d21e1aeaf6df980191f666`.
- Committed `vendor/cybergrid-sdk/src/tests.rs` bytes match both commits; SHA-256 `c45f8ce2cce31da0643ff5c7835ad8ac30ab3c5853c58c11a2957a2b64d196c2`.
- `ec4147b6` changes only `scripts/publish/manifest.json`. Its entire semantic change is the existing tests.rs pin from `2a3d1ce9c5b322a37b969fb7f36d789094ed669cc18460fc600ddf85b458dedf` to `c45f8ce2cce31da0643ff5c7835ad8ac30ab3c5853c58c11a2957a2b64d196c2`. No inventory paths or other manifest fields changed. Exact diff: `manifest.diff`.
- Full committed manifest SHA-256: `32dc5fa080f151ff2696c926e561edf89cfc3eec72d7e8ac375ee4a7b494cfb4`. The supplied `c45f…96c2` is the tests.rs entry hash, not the full manifest hash.
- Every publishing JavaScript tool, staging Python tool and build-info helper used here matched the requested commit. Individual hashes: `source-review.json`. Node: `v22.16.0`.

## Executed checks

```sh
node --test scripts/publish/*.test.mjs
node scripts/publish/export.mjs --ref ec4147b6
```

Six test files were passed explicitly in sorted order, equivalent to the glob above. **19 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**, exit 0. Tests create and remove disposable synthetic local Git fixtures, including fixture exports; they do not create delivery/sealed roots or contact remotes.

Export exited 0: `dryRun=true`, `initializedNewHistory=false`, **1,771 files / 95,195,176 bytes**. It read committed blobs and validated inventory hashes, retained dependencies, policy and explicit public transforms. No target/apply/init option was supplied; the plan remained in memory. Full summary and removed package-script list: `export.stdout.txt` and `result.json`.

## Preservation and scope

All **8** existing `/private/tmp/account109-source-*` directories have identical before/after aggregate snapshots including `.git`: **60,084 entries** total. Snapshot fields: sorted relative paths, entry types, modes, sizes, mtime/ctime nanoseconds, regular-file SHA-256 and symlink-target SHA-256. Access times are excluded because inspection reads files. No Git command was run inside an old sealed root and no file was written there. Per-root counts and digests: `precondition.json` and `postcondition.json`.

The three recent prepared roots (`f7a2a0a6`, `2b0bd7e2`, `3192943d`) and five earlier snapshot roots were covered. **34** publishing/helper and pre-existing documentation/live-evidence files retained exact hashes. This check wrote only its new archive directory. Product, runner, manifest and prior evidence were not edited; no commit was made.

No live SDK test, build, desktop/Android app, store, browser, network probe, remote operation or new sealed delivery export was invoked. Both Node commands completed and the Python audit exited normally. This establishes publishing source validation; live/device acceptance remains separate evidence.

`audit.py` retains the exact audit logic. Command records include arguments, UTC timestamps, durations and finite timeout limits. `SHA256SUMS` binds every archive file except itself.

After execution, the four finite stdout/stderr outputs were renamed from `.log` to `.txt` because `.gitignore` excludes `*.log`. Their bytes and SHA-256 values are unchanged. The executed `audit.py` is retained byte-for-byte and therefore retains the original output filenames in its code. Tests and export were not rerun. All current archive files are eligible for ordinary directory staging.
