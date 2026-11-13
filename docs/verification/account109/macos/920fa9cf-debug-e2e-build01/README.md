# GUI explicit-login and relay-observer candidate 920fa9cf

2026-11-13. **Build and actual embedded identity PASS.** Exact reviewed merged source `920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11`, tree `69704a0cbbdcb6d2bd2b8b54ceb98c701fd8b0e7`, built in clean detached checkout `/private/tmp/cybernote-account109-gui-explicit-login-01`. This debug E2E GUI candidate includes the merged Login+Consent request and reviewed observer changes. It is prepared for the parent's separate relogin04 acceptance; no live run was performed here.

Candidate: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-920fa9cf-debug-e2e-01/notes-clone`. Actual SHA256 **`bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd`**, 203,933,696 bytes, `Mach-O 64-bit executable arm64`. New artifact and checkout paths preserve the d1a6eadf candidate and previous live results. No app, browser, auth flow, original store, ADB, dependency installation or network operation was performed.

Source fingerprint before/after: `32277da5d436bcac9d3ff4cb3fd5936f04698c73b0d82ec846afe9df6964786b`, **1654 inputs**, sourceDirty=false. All four lockfiles match before/after; final source checkout is clean. Ignored node_modules links to main's installed dependencies. Preflight free disk after checkout was 2,512,838,656 bytes; post-build free disk was 1,971,830,784 bytes. No output or cache was removed during this build.

| Step | Exit | Seconds |
| --- | ---: | ---: |
| frontend-build | 0 | 4.656 |
| compiled-capability | 0 | 0.291 |
| native-build | 0 | 20.008 |
| embedded-identity | 0 | 0.662 |

Compiled capability reported **24 checks**; its complete finite output is retained as [compiled-capability.txt](compiled-capability.txt). The actual executable's raw/Brotli identity was checked with `package-identity.mjs`, including matching the encoded identity bytes inside the binary to this clean source and regenerated dist. [embedded-identity.txt](embedded-identity.txt) records Brotli identity SHA `24c5ed892c8979927d638c4cc2e564522a3cbddaa3467cb0ae8bc5c5fa3a4858` and successful current-source revalidation. This is more than a matching sidecar. Build and identity evidence do not establish login, relay use or synchronization success.

The prior d1a6eadf controller was reused with only root/source/out replaced. Executed controller SHA256: `065e8e7e1c6538412e1f98ac0633ca90a00cbdeed23fed29851afa61ea4d97ee`; prior controller SHA256: `cb431e9315ca0604f2d28a0fb55085d5ea79e436d08f6a408a8f368ce5028ac5`. Commands were frontend `pnpm build`, the compiled capability checker, `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`, and actual embedded identity verification. Environment pins: NODE_ENV=development, VITE_NOTES_DEBUG=1, CYBERNOTE_BUILD_TARGET=macos, jobs=2, dev/test debug=0, incremental=0, CARGO_NET_OFFLINE=true. No dotenv input, account override or headless environment was supplied. Vite's mode=production is its build-command identity label; this remains a debug E2E executable.

[build-record.json](build-record.json) contains exact argv, toolchain, environment pins, lock hashes, timings, log hashes and both source identities. Raw frontend/native build logs remain in the immutable artifact directory. All controller subprocesses were awaited; timeout paths terminate and reap the owned process group. Shared Mac target was released immediately after the binary and embedded identity passed; no further Cargo work is planned by this builder.

This compact archive contains no binary, dependency tree, DB, grant, original baseline or provider response. `SHA256SUMS` covers all archive files except itself. Product sources were not edited, no build receipt commit was made, and no source export, deployment or publication was performed. Independent package review, parent final combined manifest validation and the exact-candidate runtime gates remain separate.
