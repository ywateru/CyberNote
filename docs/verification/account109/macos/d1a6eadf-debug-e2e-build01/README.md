# GUI token diagnostics candidate d1a6eadf

2026-11-13. **Build and actual embedded identity PASS.** Exact reviewed merged source `d1a6eadfd62ac45ba4ecb82e39dd3bd61fd4f5b4`, tree `4dc9a9d3e0bd5246d7d18e7e6b9e8fe506c68ebd`, built in clean detached checkout `/private/tmp/cybernote-account109-gui-token-diagnostics-01`. This is the next debug E2E GUI candidate for relogin03; no App, original store, browser, auth, ADB or external network was operated, and no runtime acceptance is claimed.

Candidate: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-d1a6eadf-debug-e2e-01/notes-clone`. Actual SHA256 **`bb45bfe591463c4197e8f856090daf666b6b22031bc240b6c52f10b28b5cc5b5`**, 203,686,896 bytes, `Mach-O 64-bit executable arm64`. The artifact directory is new and is retained without overwriting the 10814415 candidate, failed preparation or prior live runs. Raw build/identity logs remain there; this compact archive copies only receipt, controller and frontend identity.

Source fingerprint before/after: `9b666aeca860bdc72610753094a45347b38302f61b95145649b3d075ed877313`, **1654 inputs**, sourceDirty=false. All four lockfile hashes match before/after; the final checkout remains clean. No dependency installation or lock update. Existing ignored node_modules links to main's installed dependencies. Preflight free disk was 7,742,836,736 bytes; post-build free disk was 4,911,796,224 bytes. No unrelated output/cache was deleted.

| Step | Exit | Seconds | Raw log SHA256 |
| --- | ---: | ---: | --- |
| frontend-build | 0 | 5.271 | `25b8646d9798091678c7c5b0d8962c449f798c8ac80f2a8046de8528f945a034` |
| compiled-capability | 0 | 0.286 | `640aed259c00b33683b07d603fc04ddf54e711e9883ed576bf0c81f3d6887079` |
| native-build | 0 | 23.345 | `3fb6cf050bae3160198290d3390355697c6e0dea9a1e1a99d022e823a0b42e36` |
| embedded-identity | 0 | 0.615 | `878ab1f2bfb4ed34405b6383fab7a9bfd166aa5f34678eb1377235f4e3249172` |

Compiled capability reported **24 checks**. Native command: `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`. Environment pins: NODE_ENV=development, VITE_NOTES_DEBUG=1, CYBERNOTE_BUILD_TARGET=macos, jobs=2, dev/test debug=0, incremental=0, CARGO_NET_OFFLINE=true. No account override, dotenv input or headless environment was used. Vite's build identity mode=production is its build-command label; it does not make this debug/e2e executable a production release.

The reviewed prior controller was reused with only root/source/out changed. Executed controller SHA256: `cb431e9315ca0604f2d28a0fb55085d5ea79e436d08f6a408a8f368ce5028ac5`. It runs frontend build, compiled capability, locked/offline native build, copies the executable into this fresh artifact directory, and verifies actual raw/Brotli build-info bytes inside the executable with package-identity.mjs. Timeouts drain/reap the owned build process group. The embedded identity receipt agrees with current clean source and dist; it is not merely a sidecar identity assertion. Full environment, exact argv, toolchain, four lock hashes, command durations and log hashes are in build-record.json.

All controller/build subprocesses completed and were waited on. Shared target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` was explicitly released to parent after binary/identity success. Subsequent independent package review and a runner pinned to this exact source/hash remain separate gates; the old relogin02 FAIL and its responseMetadata limitation are unchanged. This task did not run or adapt the live runner, read grant/provider responses, publish, deploy or seal an export.

SHA256SUMS covers this archive except itself. No binary, dependency tree, DB, grant, original baseline or raw provider response is archived here. No product/source/test file was edited and no commit was made by the builder.
