# account109 provenance-corrected source preparation

2026-11-13. **Prepared source candidate; not final accepted.** Resolved current
main and the requested short ref to
`2b0bd7e211352cda6c03f4ba7707c78453e4c36a`. The SDK provenance correction is
`159be3d5fdb547ec8be4beb31c69e8d59e2dd764`; 2b0 pins its exact metadata bytes.

Created the previously absent, separate root:
`/private/tmp/account109-source-2b0bd7e2-prepared-20261113-01`.
Fresh root commit: `7e87c29fe4fcb48303b337f2e8bdbb842f1c5350`.
The preserved f7a candidate was not edited or relabeled; its prior receipt/review
now explicitly closes the historical stale-`changes: []` finding by pointing to
this successor. That stale metadata remains present only in the old draft.

```sh
node scripts/publish/export.mjs \
  --ref 2b0bd7e211352cda6c03f4ba7707c78453e4c36a \
  --target /private/tmp/account109-source-2b0bd7e2-prepared-20261113-01 \
  --expected-target /private/tmp/account109-source-2b0bd7e2-prepared-20261113-01 \
  --apply --init
```

Export passed the existing exact inventory/hash, privacy, ownership/license,
runtime-provider and module/script/fixture closure policy: **1,770 files,
95,146,064 bytes**. No manifest refresh or automatic repinning was performed.
Subsequent checks inside the dependency-free candidate:

- `node scripts/publish/verify.mjs --new-root`: passed exact transformed content
  and history isolation: independent Git directory, one parentless main commit,
  one ref, no remote, alternates, shallow history, old reflog commits or
  unreachable historical objects.
- `node scripts/versions.mjs --check`: passed.
- `node --test scripts/publish/policy.test.mjs`: **3 passed, 0 failed, 0 skipped**.
  The broad 19-test suite was not repeated for this metadata-only correction;
  its prior result remains documented in the f7a review.

## Exact comparison with f7a

Compared every exported relative path, mode, byte length and SHA-256 with
`/private/tmp/account109-source-f7a2a0a6-prepared-20261113-01`. No added/removed
paths; **only these two files differ**:

| Exported path | Change |
| --- | --- |
| `vendor/cybergrid-sdk/SOURCE.json` | Replaces the empty changes list with finite descriptions of the four reviewed local SDK diagnostics edits. Upstream identity/revision/authorization remain unchanged. |
| `scripts/publish/manifest.json` | Updates only the SOURCE.json file hash. |

Corrected SOURCE.json SHA-256:
`9fcb650c054f2cafed841db6cd80484b241953ff6316c5da07740bfb420c836d`.
Committed source-manifest SHA-256:
`f88726231d915f626d3348f117930f77bf35be4aaa418c04b2e98faa86a1335f`.
All functional exported source, tests retained in the export, workflow,
ownership/license declarations, notices, binary/runtime-provider pins and public
transforms are unchanged. Private docs and desktop verification script changes
between the source commits are not exported. `export-diff.json` records both
versions' exact hashes/modes/sizes; `receipt.json` also lists excluded changes.

## Seals and acceptance boundary

Git automatic maintenance was disabled through process-only configuration
before initialization, avoiding the f7a initialization packing transition.
No repository configuration was edited. The full directory seal, including
`.git`, was identical immediately after initialization and after all checks:

```text
b72848cf61d87e5a366dc1c2f3cb09eb56e5973a9f9a3d40d596fbaefb368734
```

Source-payload seal (1,770 files, excluding `.git`):
`c01150beaa78d92a0fb4d06397c6c7012259579b38d685b077c2cd14ada90436`.
Clean product identity: fingerprint
`921a76c52d566782a6e51fffe000519f012ee2707666ea95d9fe3556b85b9a28`,
**1,619 inputs**, `sourceDirty=false`, revision equal to the new root commit.
The product fingerprint changes because SOURCE.json is itself a retained vendor
input; this does not imply a functional-code change. The old candidate's full
directory seal was also identical before and after this preparation.

This is eligible for subsequent source selection once current device acceptance
is complete. The parent currently reports Android coordinator TCP 443 blocked,
so **final acceptance is not granted**. That is a parent runtime observation,
not a network probe performed here. The prior Android package-provider
presence/hash validation finding remains unchanged and documented in the f7a
review; no built-package provider-closure claim is added by this source export.

Receipts/logs are stored outside both candidates in this review directory. No
broad test rerun, dependency installation, build, network/remote/credential
access, push, deployment, app or device operation was performed. The new candidate
was not modified after initialization; the old candidate was unchanged throughout
this preparation. Only the requested old/new review record directories were
written in main.
