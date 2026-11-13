# Relay source candidate preparation

2026-11-13, Asia/Shanghai. **Prepared draft; not final accepted. No blocking preparation finding.** Exported exact source `86cf971f925e375b63caa6771abe211f470dee43` into the new, separate candidate:

`/private/tmp/account109-source-86cf971f-prepared-20261113-01`

The source checkout advanced to docs-only `ca08c3b548a50a15f9349a07c9ec4b38d724c906` during preparation. Export remained pinned to the requested full ref. Every planned exported path, mode, length and SHA matches `ec4147b6fdd7656a794f126d5860ca60eec891b6`; none of the later docs or live evidence is exported. Existing sealed roots were not reused or edited. Publication remains gated on actual acceptance.

## Candidate identity and history

| Check | Result |
| --- | --- |
| New root commit | `b489451a55541eb7ddc6daef92613c197a0e23bd` |
| Ref/history | Only `refs/heads/main`; exactly one parentless commit |
| Remotes/alternates | Zero remotes; no alternates or shallow history |
| Old history | No other refs, historical reflog commits or unreachable retained historical objects |
| Source inventory | **1,771 files; 95,195,176 bytes** |
| Source identity | `sourceDirty=false`; 1,620 product inputs |
| Source fingerprint | `b0b2b595675781db75f2174f727f6c37a16d66ca4f70d2f8b4173098472af0ac` |
| Payload seal | `9e0abc3b19a9149f9c93e27afd39c48e060cc83bccf919b1cc2b6ee0751dcc5e` |
| Full seal including `.git` | `ea42e5e1113d65209281a454ec9980219d797de6f3c1098d9d5bb31c75fda4e0` |

The full seal is identical immediately after export initialization and after all checks. It includes 4,550 file/directory entries and uses the exact canonical JSON definition in the [receipt](receipt.json); it is not directly comparable to differently encoded historical seals. No candidate mutation followed initialization.

## Exact difference from the sealed 319 candidate

Compared every payload path, mode, byte length and SHA against `/private/tmp/account109-source-3192943d-prepared-20261113-01`. No files were added or removed. Exactly two paths changed:

- `vendor/cybergrid-sdk/src/tests.rs`: the independently reviewed relay test, SHA-256 `c45f8ce2cce31da0643ff5c7835ad8ac30ab3c5853c58c11a2957a2b64d196c2`, matching author commit `d3a5f10e000aa24936d21e1aeaf6df980191f666` and the [independent live review](../../native/relay-live01/README.md).
- `scripts/publish/manifest.json`: only the existing tests.rs inventory pin changed semantically. No inventory path or ownership/runtime-policy declaration changed. Exported manifest SHA-256: `cfadae39287eb239b7f627a06160af7d0f114f31da168b2a28d3e3d77858ac17`; source manifest SHA-256: `32dc5fa080f151ff2696c926e561edf89cfc3eec72d7e8ac375ee4a7b494cfb4`. The normal public package/smart-fixture transforms explain the distinct source/export manifests.

Thus tests.rs is the sole changed non-manifest file. Production code, provider binaries, SDK provenance metadata, workflows, dependency locks, licenses/notices and public templates are byte-identical to the prior candidate. Full details: [export diff](export-diff.json) and [payload inventory](source-payload-inventory.json).

## Checks and preservation

Inspected the exporter CLI and executed the explicit absolute-target contract:

```sh
node scripts/publish/export.mjs \
  --ref 86cf971f925e375b63caa6771abe211f470dee43 \
  --target /private/tmp/account109-source-86cf971f-prepared-20261113-01 \
  --expected-target /private/tmp/account109-source-86cf971f-prepared-20261113-01 \
  --apply --init
```

The absent destination, matching expected-target and independent history checks passed. Committed-plan comparison, manifest dry run (zero refresh changes), export dry run/apply, `verify.mjs --new-root`, `versions.mjs --check` and read-only source identity all passed. Every executed publishing/helper tool matched the requested source commit; [tool hashes](executed-tool-hashes.json) and [commands/timings](commands.json) are retained.

Exporter/new-root validation rechecked committed inventory hashes, privacy/excluded paths and credential patterns, first-party reserved rights, third-party license closure, exact runtime-provider bytes/provenance/patches, retained module/Cargo/script dependencies and public transforms. These are source-policy checks, not dependency installation, compilation or package/device acceptance.

The existing [publishing result](../relay-source-check01/result.json) records **19 passed, zero failed/skipped** at ec4147b6. Those tests were not rerun: this review independently established identical exported bytes/modes and matching validation tools. The prior real relay test was also not rerun.

All **eight** existing `account109-source-*` roots, including 319 and the older prepared roots, have identical before/after filesystem seals including `.git`, modes, content hashes and mtime/ctime (atime excluded). See [before](old-roots-before.json) and [after](old-roots-after.json). No Git command was executed inside those old roots. Process-only Git controls disabled automatic maintenance and optional index writes for the new-root checks.

Only this preparation archive was written in main, and only the requested fresh candidate was created outside it. No product/manifest repin, application build, install, live test, network/remote/GitHub/Actions operation, device/UI/runtime access or source-workspace commit occurred. This root is ready for later source selection after real acceptance; it is not approval to publish or execute Actions. [Audit script](audit.py) and [archive checksums](SHA256SUMS) retain the preparation procedure and evidence identities.
