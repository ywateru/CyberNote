# SYNC91 exact Android21 build

Approved root main `b373ac95e1d26faf03e37e5ee6c68bccf5074e00`; build started at later docs-only head `5f9dd30f2c0b94d6fa110a66c88c756d26b15edc`. `approved-preflight.json` compares all322 tracked product inputs byte-for-byte to the approved commit, including the new publication module. `result.json` records identical before/after manifests, exact commands, environment overrides, scoped offline Gradle init and complete original logs. `completion.json` adds the APK's native library hash and verifies frontend files exactly match Android20. Driver adaptations from90 are output scope/label/nonce tag only. No product source changed during build.

- `pnpm android:build --debug`: natural exit0,26.074s.
- APK signature verification: natural exit0,.793s.
- Artifact `artifacts/sync91/备忘录-Android21.apk`:238738727bytes, SHA256 `e9e1142e9d24a13b533767173c236d1d10841d62d9709aec69e652cf0c9eb60a`.
- Embedded `lib/arm64-v8a/libnotes_clone_lib.so`:213444256bytes, SHA256 `ded4e40f045330f4de73cc66444d33b543c332bff5f1e3fc8c20e264c2873fdb`.

The existing generated20 APK output was moved to fresh91's `prior-android-output.apk` before the fresh build, preserving that prior output; no delivered old artifact was overwritten. The scoped Gradle init was removed after its exact contents were checked. Existing compiler warnings remain in the raw log.

This is an arm64 debug-signed build, not device acceptance. No device/runtime/microphone/user database or old AVD was operated, and no Mac build started. Independent exact package audit and root receipt are required before sole native operator's Android21 same-Store regression. Final-task status remains WAIT until that actual regression passes.
