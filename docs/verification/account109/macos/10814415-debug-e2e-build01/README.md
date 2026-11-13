# GUI debug/e2e candidate 10814415

Exact source `10814415ca088273bacc311d192b9605bda16775` was built in the independent clean checkout `/private/tmp/cybernote-account109-gui-reauth-01`. Before/after product fingerprint `a410d97848c82a11373791d311231e488d0f3da21b332f40cfd00f9d689c1387`, 1654 inputs, sourceDirty=false; four lockfile hashes agree. No dependency installation or lock update.

Candidate: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-10814415-debug-e2e-02/notes-clone`, arm64 Mach-O, 203587424 bytes. SHA256: `b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f`.

Frontend, compiled account capability (24 cases), Cargo locked/offline and embedded identity verification all exited 0. The Brotli build-info bytes embedded in the executable match dist and current clean source. Environment, exact commands, toolchain, lock hashes and log hashes are in build-record.json; build-controller.py preserves the executed build procedure. The shared Mac target was coordinated with Huygens and released after completion.

The first metadata-only preparation tried xcodebuild -version on a CommandLineTools installation and stopped before any build. That failure is preserved in prepare-failure01.json. The successful fresh -02 artifact directory records xcode-select and the actual SDK instead; no system developer settings changed.

This is a debug/e2e candidate using NODE_ENV=development, VITE_NOTES_DEBUG=1, CYBERNOTE_BUILD_TARGET=macos and sync-e2e,tauri/custom-protocol. The Vite identity mode=production label does not mean debug APIs are absent. No App, UI, system browser, auth, ADB or original store was opened. Previous candidates and failed runs remain unchanged. Real functional acceptance is separate and belongs to the parent after runner review.
