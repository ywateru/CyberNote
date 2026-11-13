# Account109 three-peer runner independent re-review 02

**Verdict: approved within the requested baseline-preservation and coverage-disclosure scope. Both review01 findings are resolved by `db3c1ab1e85a3745cf6e0ac85c98e67b9ea66885`, cumulatively with `80ea9996c234095491ea7a3f297f29bc6d65519c`. No remaining blocker was found in this focused re-review.**

Reviewed on 2026-11-13 in `/private/tmp/cybernote-account109-test-audit`. The audited three-peer runner, its tests, and Android driver have no subsequent file differences from `db3c1ab1` at the checked-out HEAD. Recovery commits `162ccb4e` and `9059a465` are outside this review and remain with the separate reviewer. Review01 is preserved.

The baseline fix closes the demonstrated false green:

- [capturePhoneBaseline():84](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-three-peers.mjs:84) requires exactly one live match for each of the four original phone note IDs. The IDs match the parent's archived `android/9263-signin01/result.json`. Capture is called immediately after the expected-account precondition and before either desktop is constructed or any runner sync mutation is issued.
- The snapshot retains complete document/plainText bodies in memory. Existing attachments are checked for owned document references and their original bytes are hashed. Report output contains body hashes rather than raw original documents.
- [verifyPhoneBaseline():93](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-three-peers.mjs:93) rejects missing notes or changed complete bodies, missing/changed attachment rows, ownership/reference changes, or original-byte corruption. Additional synchronized notes are allowed. Desktop attachment files receive an independent stored-byte check when these baseline attachments are verified there.
- The runner waits for original phone bodies to merge into A/B, then verifies the baseline on all three peers after merge, after catch-up, and at final completion. Each case also checks the phone's original bodies before becoming pass. This prevents the late pause snapshot from legitimizing earlier loss.
- Finalization requires the pre-desktop baseline marker and all three preservation gates, alongside all five executed case passes and the existing natural-exit/phone-close/exact-forward cleanup gates. Missing preservation proof cannot be converted to overall pass by successful new transfers or cleanup.

The coverage fix is explicit in the generated report limitations: **“C to A/B is text-only. Phone-origin attachments are unexecuted; this runner does not complete the attachment part of ANDROID-03.”** It accurately limits the existing C-origin full-document/plainText check without adding a new device workflow or claiming attachment acceptance.

Focused device-free verification:

```sh
node --test scripts/verification/account109-three-peers.test.mjs scripts/verification/account109-desktop-helpers.test.mjs scripts/verification/sync108-android-lifecycle.test.mjs
node --check scripts/verification/account109-three-peers.mjs
node --check scripts/verification/account109-three-peers.test.mjs
node --check scripts/verification/account109-android.mjs
```

All **37 tests passed**: 14 three-peer tests, 21 desktop-helper tests, and 2 Android lease tests. All three syntax checks passed. The new regressions reject a missing expected original before mutations; loss, document changes, and plaintext changes during the first data case even after the new transfer succeeds; attachment row/owner/MIME/reference/byte corruption; and every missing final preservation gate. The unchanged-baseline orchestration passes while allowing new notes, and the report is checked not to contain raw original body text.

This is runner review approval, not a live three-peer acceptance result. No phone access or mutation, ADB, app launch, store reset, authentication, build, or new runtime execution occurred. The previously reported Android coordinator network blocker was not rechecked here; runtime prerequisites and the separate recovery review remain outside this result. Only this new review document was written; no product edit or commit was made.
