# Mac bundled root entry source candidate01

Status: IMPLEMENTED, awaiting independent source review. No new app package or runtime acceptance is claimed.

## Change and bounded cause

The frozen sealed Mac executable11dcbfc4… remains the actual white-window baseline. Its initial navigation was ignored, WKWebView URL was null and loading false. Its original request URL was private in system logs and was not captured. Evidence remains under f07-audio-integration/mac-developer01 and is not overwritten here.

Locked Tauri2.12.5 produces the custom protocol origin `tauri://localhost`, and its actual manager leaves that base URL unchanged for App(index.html). The attached source excerpts include complete-file hashes and exact source lines. The existing tauri::Url parser preserves an empty path for that URL; the actual compiled macOS EntryBoundary rejected it. The newly added regression was run before changing the production predicate and failed at the actual allows call (exit101). That establishes the concrete source defect matching the frozen runtime observations. It does not retrospectively reveal the redacted original navigation URL or prove this is the only startup issue.

Production changes are limited to media_permission.rs EntryBoundary::allows. Credentials remain rejected first. CustomProtocol accepts an empty path alongside explicit `/` and `/index.html`, under the existing exact tauri scheme/localhost/no-port checks. HTTP workaround and development HTTP origins retain their existing entry-path restrictions. No about:blank, remote host, arbitrary tauri path, port, file/data/blob entry or new media permission is introduced.

PageTrust lifecycle, real-instance ResourceTable ownership, default deny, Started/Finished confirmation, tombstone, destruction and contention logic are unchanged. Navigation acceptance alone still grants neither camera nor microphone. No synchronous WebView URL request or new debug override/command was added. App/bridge/Editor/style/Store/attachments/config/dependencies remain outside this patch.

## Checks

- Old actual compiled macOS production predicate plus new empty-path regression: expected failure, one failed assertion at EntryBoundary::current().allows; parser empty-path assertion had passed.
- Candidate actual media_permission module:12 tests passed,0 failed. Includes exact custom root spellings and rejected authorities/paths, custom navigation→unconfirmed Finished→Started→Finished media trust, reload revocation and rejected navigation tombstone. Existing HTTP/development, unknown permission, contention, replacement/destroyed-instance and CSP configuration checks also passed.
- rustfmt scoped to the changed Rust file and git diff --check passed. Host rustc cfg reports target_os=macos/target_arch=aarch64.
- cargo test compiled the real app library with locked dependency versions and default product features. Main shared target was used; no copied target, dependency update or package rebuild.

The test input `tauri://localhost` is tied to the locked framework source. This check does not execute WKWebView or claim a cold-start UI pass. A fresh frozen Mac bundle after independent source review must still establish actual loaded URL, three-pane/native toolbar, a synthetic note, F07 unique→zero→clear, editor/history/focus and the remaining requested visual parity separately. Android GUI remains owned by verify; no device action occurred here.

## Files and identities

Baseline branch HEAD at start:4d61222. Source/evidence commit and manifest are communicated with the review handoff. Original baseline regression log and candidate logs/exit records are preserved. The shared Rust target is released once these records are frozen.
