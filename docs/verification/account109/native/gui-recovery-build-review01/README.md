# GUI recovery candidate: independent static package review

**PASS for the exact debug E2E candidate's source/input, receipt, binary format, and embedded frontend resource checks.** No app was executed. This package review does not approve the recovery runner, replace native/UI source review, or establish GUI readiness, sign-in, synchronization, or account acceptance. Parent retains the run02 execution decision after the required source and runner approvals.

Reviewed source: `10814415ca088273bacc311d192b9605bda16775`, tree `ccebd5352c34559a22040b2f4bf64725de7d9c41`, in clean checkout `/private/tmp/cybernote-account109-gui-reauth-01`.

Reviewed artifact: `artifacts/account109/mac-10814415-debug-e2e-02/notes-clone`, **203,587,424 bytes**. Actual SHA256:

```text
b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f
```

## Source, inputs, and build receipt

- Independently recomputed the product source fingerprint `a410d97848c82a11373791d311231e488d0f3da21b332f40cfd00f9d689c1387`. All **1,654** enumerated input files match their exact committed Git blob identities. This includes the native/auth recovery source and the App debug entry/runtime source. Full per-input SHA256, size, and Git blob IDs are in `source-inputs.json`.
- Current source revision/tree, fingerprint, clean state, and count agree with both pre-build and post-build receipt snapshots. The checkout remained clean after verification. No root `.env` or `.env.*` input was present.
- Four actual lockfiles match their committed blobs and both receipt snapshots: `pnpm-lock.yaml`, `src-tauri/Cargo.lock`, `crates/account-auth/Cargo.lock`, and `services/coordinator/package-lock.json`. Exact hashes are in `review-result.json`.
- Actual build controller bytes match the receipt's controller SHA256. All four existing build log files match their recorded hashes and reported exit 0. The embedded-identity JSON log equals the identity receipt, and the archived frontend-build-info bytes equal current dist identity bytes. Logs were hashed without printing or copying their raw contents.
- The existing compiled-capability receipt reports 24 checks. It is author/build evidence, not a repeated independent test run. No build or capability tests were rerun here.
- The immutable artifact also matches the current shared target's `debug/notes-clone` bytes. Existing bin/library Cargo fingerprint records both declare `sync-e2e`; these corroborate the build receipt rather than authenticate all compiled native instructions. Relevant tool/config/source file hashes are recorded independently.

## Actual executable and embedded resources

Both REA's static Rust-binary reader and an independent Mach-O header/load-command parser identify a **thin 64-bit little-endian arm64 Mach-O executable (`MH_EXECUTE`)**. The whole-file hash matches the supplied expected hash and the build receipt. REA found no `.dep-v0` inventory; that absence does not imply absence of dependencies. Its compiler-path inference agrees with the receipt's rustc commit but is not compiler authentication. See `rea-evidence.json`.

Current `dist/build-info.json` is **356 bytes**, SHA256 `e5f492daf3edf3c7258429e222d87bb82c35badc93a1b6264a4ddf365c1a16d3`. An existing Tauri codegen Brotli payload decompresses to those exact bytes, and those exact compressed bytes occur at executable file offset **49,407,077** in its readable `__TEXT` segment. This independently checks the executable, rather than relying on the sidecar or the author's successful command.

For every current dist JS/CSS asset, the same procedure proved exact decompressed equality and exact encoded bytes inside readable Mach-O segments. `embedded-assets.json` records per-file hashes, encoded hashes/sizes, offsets, and containing sections; repeated identical candidate copies are recorded as candidate matches, not multiple resource counts.

| Current dist resource | Actual decoded bytes | Exact encoded payload offset |
| --- | ---: | ---: |
| `assets/index-BHmkJm2B.js` | 1,657,012 | 48,922,644 |
| `assets/index-BgotpY8d.css` | 169,621 | 49,414,456 |
| `assets/runtime-cxc5oHZG.js` | 17,434 | 49,407,370 |
| `assets/native-recording-access-XWYZ7x3Z.js` | 1,018 | 49,450,797 |
| `startup.js` | 2,319 | 48,921,583 |
| `startup.css` | 2,925 | 49,405,878 |

The current SVG and build-info are also exact matches: **8 of 9 dist files have byte-for-byte decoded equality with encoded payloads in the executable**. The main JS contains the actual dynamic import of `runtime-cxc5oHZG.js`; that embedded runtime contains `registerDebug`, `__NOTES_DEBUG__`, and `app.state`. Static presence/import evidence does not establish execution or readiness.

The ninth file, `index.html`, is serialized by Tauri. Its current dist bytes are 1,919 bytes; the actual embedded HTML decodes to 1,922 bytes. They are **not raw-byte equal**. The embedded 1,003-byte Brotli payload occurs at offset 49,449,751 in `__TEXT`. A separate finite HTMLParser comparison found all **53 canonical events equal**, retaining non-whitespace text and script contents, and identical resource references to the current main JS/CSS and startup resources. Canonicalization accounts for doctype case, whitespace-only nodes, attribute ordering/empty boolean attributes, and self-closing tag spelling. This is a bounded structural comparison, not full browser DOM/runtime equivalence. Exact hashes, normalization, and references are in `html-review.json`.

## Debug and production-mode boundary

This is a **debug E2E GUI executable**, built by plain `cargo build` with `sync-e2e,tauri/custom-protocol`, `NODE_ENV=development`, and `VITE_NOTES_DEBUG=1`. Native debug-symbol settings (`CARGO_PROFILE_DEV_DEBUG=0`) do not mean a production release profile. Existing native/bin fingerprint inputs and static native debug markers corroborate the debug instrumentation; neither marker presence nor fingerprints constitute runtime execution evidence.

`vite.config.ts` derives build-info `mode` from whether the command is `serve`. Therefore `vite build` produces the identity label `mode: production` even with the explicitly enabled development debug API. The actual embedded debug runtime/import confirms that boundary. The label is not evidence of production hardening, signing, notarization, or production deployment. Native account UI defaults and absent frontend account overrides agree with the recorded build configuration; this review does not exercise account commands.

## Preservation and archive

Only this new review directory was written. The executable and build receipt were rehashed at the end, the dist resources and all inspected generated encoded assets were unchanged, and source identity was recomputed. Shared target content was read only; no target build/lock was acquired or retained. No app, original/default store, ADB, network, old candidate, or old evidence was operated or modified. No source/product/runner change, rebuild, deployment, or commit occurred.

The original build record, controller, and frontend identity are preserved as exact safe copies. No native binary, dependency cache, DB, grant, profile identity, original baseline payload, or raw build log is included. `verify.mjs` and `html-review.py.txt` preserve the reviewer procedures. SHA256SUMS covers every archive file except itself. All filenames are ordinary nonignored archive files.

Method: the `reverse-engineer-anything` skill's static shipped-artifact workflow, with the target-free REA Rust reader and bounded local byte/format checks; no disassembler or runtime session was opened.
