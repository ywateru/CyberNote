# Login surfaces: final runner integration

2026-11-13. Exact clean main `06507bd3` after adopting the independently reviewed Android helper/smoke, its owned-WebView fix, and both candidate pins. **274 passed, 0 failed/cancelled/skipped/todo**, 259 top-level TAP items, 4284.093208 ms, natural Node exit 0.

```sh
node --test scripts/verification/account109-*.test.mjs \
  scripts/verification/sync108-native-driver.test.mjs \
  scripts/publish/*.test.mjs \
  plugins/tauri-plugin-notes-auth/policy.test.mjs
```

Raw TAP: `/private/tmp/account109-login-surfaces-integration02.tap`; SHA256 `6807838591924aeb4fa76433ae62382c94783313af5865ebe7292a0eb6b0844f`. These device-free tests cover the added fixed surface inputs, strict legacy behavior, unique owned native-form observation, signedOut/baseline preservation gates, restart effects and reviewed candidate pins alongside the existing account/publish/driver checks. They do not install or run the candidate apps, enter credentials or exercise real hosted authorization/sync.

The tested product artifacts retain source `72513d12`; later commits change verification scripts or documentation. Independent [Android source/pin review](../android/login-surfaces-helper-review01.md), [desktop pin review](cancel-local-pin72513d12-review01.md), and [actual package identity review](72513d12-platform-build-review01/README.md) are separate from this full-suite run. The earlier 260-pass integration remains accurate for its earlier runner revision and is not accumulated with these 274 passes.

Current live gates: desktop CUA reported locked in this continuation; Android [pre-upgrade check](../android/login-surfaces-preflight01/README.md) stopped on retained error state and an unexplained historical document difference. No new GUI-surface or successful login acceptance is claimed. The new APK was not installed in this attempt. Neither the historical desktop cancellation result nor these tests proves the new embedded page, window-close/transfer behavior, successful re-login or real three-device relay acceptance.
