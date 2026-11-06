# SYNC87 independent reconnect UI and native host tools review

Date: 2026-11-06. Reviewer candidate `b508cd9f` combines main `b8b87db2` with two frozen, non-overlapping groups; no product file was edited during review. This review separates the two delivery gates.

## A. Existing-device connection update UI: pass

Frozen UI source `66958c1d`, routes harness provenance `7323d818`, author evidence `4e3a3f37`. `src/SyncSettings.tsx` and `scripts/debug/sync-settings.mjs` match the frozen UI commit byte for byte. The route harness also matches its source commit; routes were not executed or independently accepted in this review.

No blocking UI finding. The changed component follows `docs/ui/sync-settings.md` existing-device update contract: enabled devices expose “更新连接”, the current pair handler receives the complete new invitation, paused devices require a real resume, and current-lifetime success/stop clears the secret. Name/identity handling and generation/singleflight remain in the pre-existing handler.

The independent probe ran actual App/React DOM at desktop and mobile viewports, with an explicit IPC FakeBackend. Thirty-four assertions passed (17 per viewport), natural process exit 0, wall 16.157977792 seconds. Coverage includes the actual new UI entry and explanation, password/autocomplete properties, scrubbed snapshots, cancellation, tab/close clearing, failed retry preserving local identity, exact fresh invitation supplied to pair, duplicate click singleflight, successful close, stop and paused explanation, resume, and late in-flight response after close. No browser page errors occurred.

This proves UI/handler behavior against a fixture. It does not prove Rust network endpoint replacement, cross-workspace rejection, native Android behavior or a real tunnel. The author's real LAN results and public-wss TLS panic remain their separately scoped evidence; no result here supersedes that blocker.

## B. Native acceptance host tools: blocked

Frozen native source `7fd245ba`, author evidence `4f790962`. All six native files match that frozen source. Host tests independently passed: eight Python unittest methods and ten Node CDP/XML checks. The synthetic preparation command exited 0. These are host-only checks.

### P2 — blocking: malformed NDJSON echoes input into evidence

- Contract: `scripts/debug/sync87-native/README.md`, “Invitations enter only over stdin, never command arguments, state files or evidence.” The logging contract says arguments and invitation values are not logged.
- Code: `scripts/debug/sync87-native/run.mjs:132`.
- `request=JSON.parse(line)` throws before `request` is assigned. The catch then uses `error.message` because the action is unavailable for its pair redaction branch. Node v22.16.0 JSON.parse includes the raw line or a prefix in SyntaxError.message.
- Independent host reproduction sent synthetic input `Z7X9K2` followed by newline to serve mode against a freshly prepared synthetic state directory. It exited 2 naturally in 0.02793625 seconds, but stdout contained the complete marker: `Unexpected token 'Z', "Z7X9K2" is not valid JSON`. A preceding longer marker reproduction leaked its prefix even though the full-string search was false; both original logs are retained.
- No valid receipt was supplied, no action dispatched, no ADB subprocess or device operation occurred. The malformed-input path fails before execute/ownership. This is a logging defect, not a native-device test.
- Required repair: use fixed safe messages for parse and untrusted request-validation failures; never print parser/raw exception text from stdin. Add malformed/truncated/oversized input regression cases while retaining existing valid pair-error/request-ID/unknown-action redaction checks. Product repair belongs to the native author, followed by focused re-review.

The owned serial/AVD, lifecycle/PID checks, package receipt/actual ZIP hashes, explicit app startTicks, unique CDP target, bounded ADB operation allowlist and exact forward tuple checks were source-audited. No additional blocking finding was identified in that host preparation scope. This statement does not establish their execution on a device.

`exportImage` continues to return `originalBytesVerified:false`, which is correctly incomplete. Actual provider bytes, real peer, foreground reconnect, app restart, emulator cold boot, API30 device behavior, installation and CDP/native acceptance all remain pending. No emulator was booted and no ADB command was sent to any serial. Original emulator-5580, the approximately 13-second recording, real microphone, Apple Notes and user stores were untouched.

## Source and evidence integrity

The candidate's combined 142-file frontend/debug fingerprint differs from the separate author's tree as expected. Independent before/after fingerprints are equal: `b7c23eb06df6e66c27cbbd00d4686e7501fb23085e31fe47b988f2d40dee4a6d`; both record clean product sources. Eight per-file source maps (two UI and six native) match frozen commits before and after. The route harness provenance check is separate and accurate.

All runtime outputs were written outside the watched repo and copied only after the browser/Vite runtime closed. Original stdout/stderr, command timings, the independent probe, source maps, and explicit scope are retained in `docs/verification/sync87-ui-native-independent/`. The `.log` files are intentionally force-added for evidence preservation.

Conclusions: **A PASS-DOM-FIXTURE; B BLOCKED-HOST-TOOLS-ONLY**. Neither verdict is a complete native, route or sync acceptance.
