# Independent SDK public relay review and live test

2026-11-13, Asia/Shanghai. **PASS; scoped source approved.** Reviewed exact clean commit `d3a5f10e000aa24936d21e1aeaf6df980191f666`, based on `92f3a29018b2ed172483cbc94bfccb2b9cbea6f5`. Only `vendor/cybergrid-sdk/src/tests.rs` changed. No blocking source finding remains for this test. This accepts RELAY-01's controlled public transport boundary, not product account, Android, 4G/WiFi or handover acceptance.

## Exact identity and execution

- Worktree: `/private/tmp/cybernote-account109-relay-test`; clean before and after execution. Source SHA-256: `c45f8ce2cce31da0643ff5c7835ad8ac30ab3c5853c58c11a2957a2b64d196c2`.
- Author-built executable: `/private/tmp/cybernote-account109-mac-ec4348c6-target-01/debug/deps/cybergrid_sdk-b9051040ca450c69`; SHA-256 independently matched before/after: `afaa74e80e1f0e157a67dc3d4450bb7da194d97cf650184e54dda85e118ee882`.
- Author's saved offline lock: `/private/tmp/account109-relay-review-zbhvp7uz/Cargo.lock`; independently matched SHA-256 `abab534b0238d437320a7d1fa2493056abe084227f7c1531bf1d578eebd22df4`. No lock copied into the worktree, dependency resolution, install or rebuild was needed. Compilation and the author's 4 helper/2 existing transport/1 fake-provider passes are attributed to the author; this reviewer did not repeat them.
- Exactly one independent invocation of `tests::live_relay::real_bundled_quick_tunnel_map_fallback_bytes_and_wrong_pin`, with `CYBERGRID_LIVE_RELAY=1 --exact <test-name> --ignored --nocapture --test-threads=1`. Full argv is in the [receipt](receipt.json).
- Ran 04:55:17.961668–04:56:02.602256 UTC (12:55–12:56 local), elapsed **44.639 seconds**, exit **0**. Operation budget 150 seconds; individual cleanup waits/graces total at most 70 seconds; external owned-process-group deadline 240 seconds. No external termination or rerun occurred. Target released after this invocation.

## Red/green contract and observations

The positive URL, certificate fingerprint and echo port came from the SDK's normal heartbeat into a local synthetic coordinator. WebRTC offers were actually submitted but not delivered by that fixture; iroh was explicitly disabled. The PID-only shell wrapper execs the real bundled provider without manufacturing readiness. Bundled bytes are revalidated before every start. No arbitrary endpoint entry, test WSS connector or relaxed outer WebPKI/inner mTLS verifier was added.

- **Green:** normal `Client::map` recorded ordered `direct-attempt → iroh-skipped → fallback-attempt → websocket-dial → websocket-upgraded → mutual-tls-ready → multiplexer-ready`, all selected public-path transport labels `cloudflare-tunnel`. Live mapping transport was checked before and after the transfer.
- **Green:** 65,536 synthetic bytes returned exactly, with EOF/length checks and SHA-256 `3dcea1e1a0f4b3488ecb5b90375d9d9534cc24997424331bb0059aef8ba78844`.
- **Expected red:** only the negative fixture directory fingerprint was replaced. A new normal map reached real WSS upgrade, then failed with the precise inner TLS authentication rejection; the negative event contract prohibited mTLS/multiplexer success. Network failure elsewhere would not satisfy this negative.
- **Green cleanup:** aggregate failures empty; one recorded provider PID confirmed absent using `kill(pid, 0)`/ESRCH; bundled-byte check passed. SDK termination was bounded and deliberate, **not a natural provider exit claim**. Mapping, echo and fixture close tasks joined. SDK origin cancellation was requested by SDK close, but its detached listener had no dedicated join or port probe; do not claim all SDK listening ports were independently verified closed.

Earlier WIP cleanup could skip later resources after a close error or drop the whole cleanup future on timeout. The committed version starts owned close tasks, retains their handles, applies individual budgets/graces, continues cleanup and PID checks despite failures, and reports operation and cleanup separately. Unconfirmed joins/PIDs cannot pass. These failure branches were source-reviewed; author helper results are separate from this successful live invocation.

## Evidence and limits

[Source review](source-review.json), [execution/identity receipt](receipt.json), [stdout](stdout.txt), [stderr](stderr.txt), [checksums](SHA256SUMS). Both streams contained only accepted finite contract/libtest output; zero lines required omission. No temporary tunnel URL, raw provider log, certificate, credential or real user content is retained.

This run used a real public Cloudflare provider/WSS route and device mTLS with fixture identities/control plane and a synthetic echo service. It does not exercise real Logto authorization, deployed coordinator availability, product enrollment/Noise/Session data, Android provider execution, phone-origin files, three-device convergence, DNS changes or automatic network handover. Current phone coordinator failures remain separate and unchanged. Only this test's owned resources were touched; no process-name search/cleanup, other cloudflared operation, device/UI access, deployment, product edit or commit was performed.
