# Fixed PTY capture and finite Android error codes

This author change uses the parent's actual bounded comparison to correct the helper's native XML transport. It does not rerun a phone case, change the installed candidate or establish the first smoke's exact historical exception. No ADB, product launch/restart, SignIn, input, installation or network operation was performed while preparing this patch.

## Actual comparison retained without XML

The three parent JSON receipts are copied byte-for-byte from private tmp. Their original sources are `/private/tmp/account109-android-ui-capture-parent01.json`, `parent02.json` and `parent03.json` with the same full `account109-android-ui-capture-` prefix. Source files remain unchanged. SHA256SUMS covers all copies.

| Receipt | Fixed destination / transport | Exit / elapsed | stdout / stderr bytes | hierarchy |
| --- | --- | --- | --- | --- |
| parent01 | `/dev/tty`, ordinary pipe | 0 / 1894 ms | 33 / 0 | false |
| parent02 | `/proc/self/fd/1`, ordinary pipe | 0 / 1792 ms | 40 / 0 | false |
| parent03 | `shell -tt uiautomator dump /dev/tty` | 0 / 2106 ms | 11936 / 0 | true |

The parent reports the latter reads used the same exclusive helper lease with assertInteractive; parent02/03 record lease release. Parent01 records leasePresent=false. Parent03's accepted safe projection is dialog=false, webView=true, hostedForm=false. Its timestamp is after authorization timed out, so it describes the main UI, **not** the earlier pending dialog/form. No XML, screenshot, field value or raw error was copied. `/proc/self/fd/1` has not been shown effective and is not a fallback. No underlying ENXIO/no-tty errno, idle failure or product/network cause is claimed.

The earlier author's read-only archive `current-login-smoke-diagnostic01` separately records successful forced-PTY parsing while the original dialog was still authorizing; that record remains distinct. Parent visual observation at 14:11 UTC established a real empty form, while accessibility lacked strict EditText/action evidence. This patch does not weaken that form policy or claim that changing transport makes the complete phone smoke pass.

## Minimal script change

`account109-android.mjs` changes only three lines: the native capture adds the already verified `-tt`, and the two assertInteractive errors retain their exact original message/control flow while adding the matching fixed `code`. No login-specific phase is attached to the shared interactive guard.

`failureCode` now preserves an explicit enumeration of relevant fixed Android guard, XML, native-form, PID/lease, CDP and UI error codes. It does not accept an arbitrary `ANDROID_` prefix, append raw error text, inspect messages as codes or change unknown failures. Unknown codes, known codes with suffixes and message-only errors remain CHECK_FAILED. Existing condition-timeout normalization is unchanged.

The XML parser, size/DTD limits, form/owner/visibility rules, before/after guards, action controls, 60-second form budget, SignIn count and all other waits are unchanged. Invalid XML still fails immediately; no parser/guard error is silently retried, reset or converted into form evidence. No generic command, URL, baseline or APK override is added.

## Original failures and next execution boundary

`original-smoke-failure.json` is the unchanged finite original `/private/tmp/account109-android-current-login-smoke-embedded-back01/result.json`. It records baseline preservation and actual embedded surface, then CHECK_FAILED before native-form completion. Its specific underlying exception was discarded, so it cannot be retrospectively assigned the same cause as a later capture probe.

`manual-continuation-failure.json` is the unchanged finite `/private/tmp/account109-android-current-login-embedded-back01-manual-continuation.json`. At 14:14:15 UTC it records error/account_authentication, disabled, no profile, followed by ERR_ASSERTION and exactForwardAbsent=true. The parent reports that its guard refused **before** Back and that no Back, cancel or restart was sent. That no-action boundary is parent-observed; the finite receipt is not a complete device command trace. The original pending authorization naturally expired according to the parent. Neither original receipt is overwritten or made PASS.

Current error state must remain intact. Any later normal background/reopen preservation-recovery case requires its own independently defined execution and evidence before another smoke. This patch performs no such recovery and does not silently prepare clean signedOut or continue the remaining smoke sequence.

## Device-free validation

Executed `node --check scripts/verification/account109-android.mjs` and the existing four focused suites: `account109-android-login-surfaces.test.mjs`, `account109-android-files.test.mjs`, `account109-desktop-helpers.test.mjs`, `account109-android-current-login-smoke.test.mjs`. **53/53 passed, zero skipped.**

The existing malformed-XML test now checks the fixed parser code, including success-banner-only input. One focused safe-code test checks the exact Android enumeration, unknown codes, suffix/newline injection and message-only refusal. No mirrored argv assertion or new test matrix was added. The existing owned toolbar, form/foreign-tree refusal, signedOut, full-data preservation, transfer and restart tests remain in use. Device behavior after this change is unexecuted. SHA256SUMS and diff whitespace checks passed locally.
