# Account110 exact-main Mac debug build 01

2026-11-14 — **build/package/static verification PASS; not launched by builder**.
Exact clean main: `cb91f4b82995a314268aa47b491b7973679dff8f`. No source, pins, versions or lockfiles changed.
Only this report is committed in the author's separate worktree; main remains frozen.

Artifact directory: `artifacts/account110/mac-cb91f4b8-debug-01/` in the main workspace.
App: `CyberNote-Account110-cb91f4b8.app`.
Bundle identifier: `com.local.notesclone.account110.debugcb91f4b8`.

| Identity | SHA256 |
| --- | --- |
| Original arm64 executable | `594043e5c267798236f785f85238e6d1868060241baa2f663130fbcc47dc98a9` |
| Signed app executable | `43f2d86d3ceab4dabf24d395259037ae46b19c58b5fde15ecbc7e7f0cd4482a3` |
| `completion-receipt.json` | `f6c11453582e7de878c91e1b4f07809ca8978360d11039379c353c11fab55557` |
| `build-record.json` | `6f46677d781183ccd081abc8e71da8be8fc6ca42f60610254124dc4c12486e2e` |
| `packaging-receipt.json` | `129b0a2f21b32c2a8957f17b0e51f3827d6fe8df8a8a5c6ef1b7c955e1d4792b` |
| `resource-identity.json` | `0154c12716a8d83e0e9d30a6bf0b9043e789cfad34b749093531a4278203c1fe` |
| `integration-checks.json` | `a652a7e4d5778cc79d4a3cf8b606d3e8dfee6d57703803557abdc2e7f1348f41` |
| `SHA256SUMS` | `b4ec5e5b2696b1b2e283a6ad069100ecb4acc53744b31e90d248189695be1c28` |

The app is a directory; the executable digest is not an archive/app-directory digest.
SHA256SUMS records every regular artifact file except itself, including signed app contents;
all entries were independently reread and matched before handoff.

## Integrated checks and build

- Frontend focused: **69/69** (`account109-login-surfaces` + `account109-status-dto`).
- Runner fixtures: **19/19**. Publish policy/export fixtures: **8/8**.
- `pnpm typecheck`: PASS. These independent checks were batched before build.
- `pnpm build`: PASS, 10.026s; production Vite assets with existing debug bridge flags.
- Compiled account native capability: **24** checks PASS, 1.008s.
- `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`: PASS, 33.074s.
- Embedded identity: PASS, 1.004s. Native suites were not repeated.

Only target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` was used.
Jobs2, DEV/TEST debug0, incremental0, Cargo offline; inherited HOME without override.
No dependency install/download or extra target. Compiler warnings retained in native-build.log.
Approved 6GiB floor monitored every second; minimum observed during build
10268532736 bytes, final receipt free bytes 10433802240.
No disk-floor stop, compiler error, assertion failure or source fix occurred.

## Identity and packaging

Source fingerprint `210aca54d96fdd35a090ce1aa82654589d50fed0542151d746d78a84357e0dc0`;
1668 product inputs. HEAD, clean state, source identity and four
lockfile hashes matched before/after integrated checks and build. Both original/signed
binary embedded build identity revalidated against exact clean source. Resource verification
matched all 8 required JS/CSS/JSON/SVG assets in loaded Mach-O segments; 9 dist files recorded.
HTML references, debug import, compiled startup diagnostic and preserved execute double-rAF
source barrier passed. This does not claim runtime diagnostic/paint observation.

Existing 5590 controller/package/verifier templates were adapted only in ignored artifacts
for exact source/output/Account110 identity, approved floor and per-second wrapper monitoring.
Template hashes/adaptations are recorded in template-provenance.json. No identity gate removed.
APFS COW clone had separate inode; original bytes/mode/mtime/inode unchanged after signing.
Plist lint, original signature check, local ad-hoc signing, deep/strict signature verification,
linked-library inspection and signed embedded identity passed. No notarization/distribution claim.
All old candidates and evidence retained.

## Handoff boundary

After static verification the shared target lease was released; process inventory showed
no cargo/rustc/clang compiler processes. App and runner were not launched; no GUI, credentials,
stores, authentication, account enable, ADB or network operations by this builder.
Distinct bundle identity does not isolate compiled default data selection: the future approved
runner must use two fresh explicit data dirs. Package independent review and parent authorization
remain prerequisites to runtime; this receipt makes no real login/content-transfer claim.
