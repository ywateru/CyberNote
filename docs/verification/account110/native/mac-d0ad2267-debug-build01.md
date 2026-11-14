# Account110 exact-main d0ad2267 Mac debug build 01

2026-11-14 — build, packaging and static validation **PASS; not launched**.
Exact frozen clean main `d0ad2267289cbe3f527fd7ee30299a62812d6ac9`. This report is docs-only in the
existing author tree; main source, pins, versions and all lockfiles were unchanged.

App in main workspace: `artifacts/account110/mac-d0ad2267-debug-01/CyberNote-Account110-d0ad2267.app`.
Bundle ID: `com.local.notesclone.account110.debugd0ad2267`. Distinct bundle ID does not isolate compiled
default data selection: later execution must use explicit owned data directories.

| Identity | SHA256 |
| --- | --- |
| Original arm64 executable | `98654d4920fec41ee29510c1811801d6ca827055caac578523eae19e6bfa2cad` |
| Signed app executable | `2823cfb35ca6f3c4a55e677d37b63bd74dab3c4b96d2ad70fefa38084375141e` |
| `completion-receipt.json` | `4657fe8045fbd6e1424398438c49a5009925fc614ca420e1dac6fa2449101f3c` |
| `build-record.json` | `99ad2177ab2465dfa4fe0bc98cecc512c7e4adcd64eae8103f5ef42baca12c00` |
| `packaging-receipt.json` | `f81c80c2749320f6da9f2b9f2c95485f3abee0a647d4f934edc8e2c6ee9b215b` |
| `resource-identity.json` | `90d92934e1928bdb102612350065632f13e66c12e902ab5d10434351799f177b` |
| `integration-checks.json` | `60813f8a695dc9ee40c741d09a756b575134279e0b834614917abfcf68b1c556` |
| `SHA256SUMS` | `3277924fe082837e74c498f68e6089dd6661f4742aa11ace7ac963ac7f74f58d` |

Executable hashes are not app-directory/archive digests. SHA256SUMS covers all 37
regular artifact files except itself, including signed app contents; every entry
was reread and matched. Artifacts became static before handoff to independent review.

## Checks and build

Frozen-source runner **29/29**, publish policy/export **8/8**, pnpm typecheck PASS.
No native suites repeated. Actual build steps:

- `frontend-build`: exit 0, 12.038 seconds.
- `compiled-capability`: exit 0, 1.005 seconds.
- `native-build`: exit 0, 91.237 seconds.
- `embedded-identity`: exit 0, 1.008 seconds.

Sole target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`, Cargo
`sync-e2e,tauri/custom-protocol`, locked/offline, jobs2, DEV/TEST debug0, incremental0.
Production frontend includes the debug bridge. HOME inherited without override;
no dependencies installed/downloaded, new target, source correction, failed step
or assertion bypass. Native warnings remain in native-build.log. Approved 6GiB
floor monitored each second: minimum observed 9940299776
bytes; completion free 10318151680 bytes.

HEAD/clean/fingerprint and four lockfiles matched before and after checks/build.
Fingerprint `28131d9ebe499b3ba9642320a9be48755bac72665e4c383bab5060b488134e74`,
1668 product inputs. Original and signed embedded
identity revalidated against exact clean source. All 8
required JS/CSS/JSON/SVG assets from 9 dist files matched loaded
Mach-O segments. HTML asset references, debug import, compiled startup diagnostic,
capability24 and execute double-rAF preservation checks passed. These static checks
do not establish runtime paint, device transfer or GUI behavior.

Existing reviewed 0a4a4cda ignored templates adapted only for exact frozen SHA,
output/app/bundle names and prior-template provenance. Build flags, source identity,
resource/signature assertions and disk controls remained intact. APFS COW derived
executable has a separate inode. Original bytes/inode/mode/mtime were unchanged
after signing. Exact source plist/icon/entitlements, plist lint, original signature,
local ad-hoc signature, deep/strict verification, linked libraries and signed
embedded identity passed. No notarization/distribution claim. Old packages retained.

## Handoff and boundary

Target released after static asset verification, zero compiler processes remaining.
App/runner/GUI not started; no original or test store, credentials, account network,
ADB or device access during this build. Cicero actual-file package review is pending.
Only after package approval: separately authorized normal restore of the existing
live02 owned A/B libraries and one explicit push to a new diagnostic output, keeping
all prior results intact. No runtime success or root-cause claim accompanies this
build. New diagnostic and subsequent full fresh acceptance remain unexecuted.
