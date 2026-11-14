# Account110 exact-main 0a4a4cda Mac debug build 01

2026-11-14 — **build/package/static verification PASS; not launched by builder**.
Exact frozen clean main `0a4a4cda80d926c470cfbc8d5cef3bb2937ca58a`. No product, source pins, versions
or lockfiles changed. This docs-only report is committed in the author's own tree.

Artifact directory: `artifacts/account110/mac-0a4a4cda-debug-01/` in the main workspace.
App: `CyberNote-Account110-0a4a4cda.app`.
Bundle ID: `com.local.notesclone.account110.debug0a4a4cda`.

| Identity | SHA256 |
| --- | --- |
| Original arm64 executable | `1dcce09b612d4c7c7d004e70fd5e4b9547e7197c5e7ccdcf6c2ddce09001216c` |
| Signed app executable | `a9cca8b3bdd6c270162924287ab4a12c59d72ae5219a47167d8061b9384b967b` |
| `completion-receipt.json` | `5e9b94094fde5521209c3130ddc410f631056c00ee98c5bdab012eab1337f4ea` |
| `build-record.json` | `7eeb2e2013e2a3830c71fdd81f7d47e134b6443920bfe327ddf33ead43a62a68` |
| `packaging-receipt.json` | `a4c0d5981b3e44bd0d705157ca16d583740a412ecbeaae87a13088ee8b587e89` |
| `resource-identity.json` | `881b85d8ee12f6b8db0272c03637118f1d392014eefa2e3165512d376c981c98` |
| `integration-checks.json` | `0499b38dc3b278072d6242fba6d681ce76b4fbd93796a93e27ab6627dfb52a46` |
| `SHA256SUMS` | `59fdb4af4aef2ce254e5cfd2933326103d2ca053250858891caa45619b14930d` |

Executable hashes are not app-directory/archive digests. SHA256SUMS covers every
regular artifact file except itself, including signed app contents; all entries
were reread and verified. Artifact directory became static at handoff.

## Necessary integrated checks and build

Runner fixture **24/24**, publish policy/export **8/8**, pnpm typecheck PASS before
build. Unchanged frontend 69-suite and native suites were not repeated.

- `frontend-build`: exit0, 12.028s.
- `compiled-capability`: exit0, 1.007s.
- `native-build`: exit0, 91.266s.
- `embedded-identity`: exit0, 1.003s.

Sole existing target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`;
Cargo build features `sync-e2e,tauri/custom-protocol`, locked/offline, jobs2,
DEV/TEST debug0, incremental0. Production Vite assets include existing debug bridge.
HOME inherited without override. No dependency installs/downloads, extra target,
source corrections, assertion failures or disk-floor stops. Native warnings remain
in native-build.log. Approved 6GiB floor checked every second; minimum observed
9608052736 bytes, completion free 9864830976 bytes.

HEAD, clean status, fingerprint and four lockfiles matched before/after checks/build.
Source fingerprint `faed72665d63541cfe00158b552d4e21818996fc7e1ab9afad1e72424e1d6121`,
1668 product inputs. Original/signed executable embedded
identity revalidated against exact clean source. Asset receipt records 9 dist files:
all 8 required JS/CSS/JSON/SVG match loaded Mach-O segments. HTML references, debug
import, compiled startup diagnostic and preserved execute double-rAF source barrier
passed. Static compilation is not evidence of runtime paint or GUI behavior.

APFS COW derived executable has separate inode; original bytes/inode/mode/mtime
unchanged after signing. Exact source plist/icon/entitlements; plist lint, original
signature check, local ad-hoc signing, deep/strict signature verification, linked
libraries and signed embedded identity all passed. No notarization/distribution claim.
Only ignored cb91 templates adapted for exact source/output/new bundle identity and
necessary runner/publish/typecheck prechecks; template hashes and adaptations retained.
Disk/target controls and identity gates preserved. All old candidates/evidence retained.

## Handoff

Target lease released after static asset verification; no cargo/rustc/clang processes
remained. No App, runner, GUI, original/test stores, credentials, account enable,
network or ADB access by this build. Distinct bundle ID does not isolate compiled
default data selection; later runner and GUI must use explicit owned data dirs.
Cicero's actual-file package review and parent runtime authorization are pending.
No second-run login, direction-transfer or GUI-success claim is made here.
