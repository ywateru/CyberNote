# Manifest recovery pins: independent review

Result: **semantic/hash PASS; CONDITIONAL APPROVE for manifest only**.

Reviewed commit `4a5cdf8d1b61a482d0317967936fa93c33b5014d`, whose sole parent is `43b977c578e7ddb79fc624b1e5282e5d67d825ec`. The entire commit changes only `scripts/publish/manifest.json`. Verification ran on 2026-11-13, 06:28:52–06:29:05 UTC, using committed source rather than working-tree source or uncommitted author changes.

**Approval depends on Cicero approving the native/UI source at `43b977c578e7ddb79fc624b1e5282e5d67d825ec`. This review establishes exact pins and export policy compliance; it does not replace that source review or assert that Cicero has completed it.**

## Semantic and source boundaries

- Exactly 11 existing file hashes change. The only added path is the exact regular source file `src-tauri/src/account/recovery.rs`; no paths are removed. Inventory grows from 1,767 to 1,768 entries.
- All fields outside `files` are identical, including schema, policy text, ownership declarations, third-party provenance/licenses, and runtime assets. The sole `SELF` exception remains the manifest itself. No wildcard or directory-copy scope, new runtime asset, process evidence, report, store, baseline, grant, or credential path is introduced.
- All 12 changed/added pins match the exact SHA256 of the committed blobs at both parent and candidate. The manifest commit changes no product source.
- Three alias pins match independently approved `72b397a334494acf2fb12f1d12c6325c4f602f32` exactly: `config.rs`, `enrollment.rs`, `transport.rs`.
- Three auth pins match independently approved `29412dfb1fb1ed4281cdd14d7a5a5db1fe5a9f24` exactly: crate `lib.rs`, `tests.rs`, `types.rs`. Historical review01 P1 evidence and review02/03 scopes remain intact.
- Six native/UI pins match parent source exactly: account `mod.rs`, `provider.rs`, `types.rs`, `recovery.rs`, plus `src/account-client.ts` and `src/AccountSettings.tsx`. Their behavioral/security approval remains Cicero's responsibility.

The existing export policy scanner and dependency/license/runtime closure checks passed for the full committed inventory. This is the scanner's bounded result, not a claim that matching a hash proves source correctness or that a new independent exhaustive secret audit was performed. No process material was copied into this archive.

## Exact validation

Candidate manifest SHA256:

```text
7a8f7950b87facb6b65598eda9eb8ddb1f8cf9dc013439e361d7588d83b7cf75
```

Parent manifest SHA256:

```text
32dc5fa080f151ff2696c926e561edf89cfc3eec72d7e8ac375ee4a7b494cfb4
```

The executed CLI and transitive local tool inputs (`manifest.mjs`, `export.mjs`, `policy.mjs`, `history.mjs`, `package-transform.mjs`) were byte-identical in the working tree, parent, and candidate before invocation. Exact per-tool hashes and the 12 per-source hashes are in `semantics-and-hashes.json`.

Both commands ran once, with exit 0 and empty stderr:

```text
node scripts/publish/manifest.mjs --ref 4a5cdf8d1b61a482d0317967936fa93c33b5014d
node scripts/publish/export.mjs --ref 4a5cdf8d1b61a482d0317967936fa93c33b5014d
```

Manifest dry-run returned `changes: []`. Export validation returned `dryRun: true`, **1,772 files / 95,227,982 bytes**, and `initializedNewHistory: false`. The four generated public template paths explain the difference from the 1,768 manifest inputs. Full finite CLI outputs are `manifest.stdout.txt`, `manifest.stderr.txt`, `export.stdout.txt`, and `export.stderr.txt`; timestamps, argv, exit codes, durations, and output hashes are in `command-receipts.json`.

No `--write`, extension, target, `--apply`, or `--init` was used. No sealed root was created or accessed, no remote operation occurred, and the 19 publishing tests were not repeated. This task did not operate an app, ADB, original store, or network. Product, manifest, runner, and existing evidence files were not edited. Only this new review directory was written; no commit was made.

## Archive

`manifest.diff.txt` is the exact committed manifest diff. `review.py.txt` records the verification procedure executed for this review. All evidence uses ordinary archiveable `.txt`/`.json`/`.md` names, including empty stderr files. `SHA256SUMS` covers every archive file except itself; verification is performed from this directory. This archive records manifest review and validation only, with no device acceptance, authentication recovery, network restoration, source publication, or seal assertion.
