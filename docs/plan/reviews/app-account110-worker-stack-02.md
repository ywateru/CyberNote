# Account110 worker stack independent final review 02

Verdict: **APPROVE source integration and repackaging**, 2026-11-14. Exact product patch `8c3fc430c7289a4e5a96f45f676612861037fd2e`, fixture correction `08e4b6c76a4fd9f8b4e74b9625fa94be562d2de3`, author receipt HEAD `a50c9a4c74fea0d793f237f0a50901fda080e696`, base `cb91f4b82995a314268aa47b491b7973679dff8f`. No remaining source/validation blocker identified within this delta. This does not establish that the real post-login GUI stack overflow is eliminated; that remains a fresh-package live acceptance requirement.

## Previous blocker and exact correction

The original author and independent default-parallel account failures (73 passed / 1 failed each) remain unchanged. Review `ea1e04864b7dee642313827d99c2a246e634b18a`, [review 01](app-account110-worker-stack-01.md), and its exact log are preserved. Neither the prior isolated pass nor these new results rewrites those failures.

The old restart fixture reused a live Session after closing its adapter Runtime. The correction joins/shuts down and drops service/Runtime, verifies only the local SharedSession Arc owner remains, drops it, and opens Store/Session anew from the same disposable directory. Original note, workspace/device, Noise identity, and different-workspace preflight assertions remain. Fresh pending/quiet state is explicitly checked. Only cfg(test) enrollment code changes after the previously reviewed worker patch; no sleep, manual clearing, preflight relaxation or production lifecycle change was added.

Both the author and this independent complete run captured the stopped old Session as **pending=false, quiet=true, phase=probe**. The new deterministic counterexample creates real local recovery, aborts it via the Session transition used by pause, verifies different-workspace preflight rejects that quiet state, and verifies same-workspace preflight remains allowed. It then covers both actual tick/abort-release and actual Store/Session close/reopen: pending=false, quiet=false, phase=null, different-workspace preflight allowed, identity and notes preserved. The release event matches the operation and abort outcome, with no access event. This closes the specific fixture-restart validation blocker with a demonstrated mechanism rather than a successful retry alone. Historical failed executions did not capture these fields; their exact in-memory state is not retrospectively proven. No independent production lifecycle defect is established by this fixture failure.

## Heap-pin implementation and boundaries

The production worker bytes are unchanged from review 01: SHA-256 `46a1e697311521aebaec92030af680b89c998e35d92e97ee0388919063c0726a`. Child futures are heap-pinned before join composition. Shared cancellation on either error, waiting for both children, content-error precedence, and final control/catalog/SDK cleanup remain. No detached tasks, production thread-stack increase, timeout inflation or authorization change is introduced.

Both stack regressions pass in the complete group. Observed future sizes remain content=105400, directory=1488, previous inline composition=213904, heap-pinned join=128, worker=10608 bytes. The scoped 512KiB test polls real paused owners and the cancelled-entry worker; paired-child tests verify cancellation in either direction still waits for retirement. Successful authenticated SDK registration and real GUI operation are outside these no-network regression polls. The expected synthetic blocking-action panic belongs to a passing retirement test, not a new test failure.

## Independent verification and lease

All five author `native-worker-stack02/SHA256SUMS` entries were checked against committed bytes. Working source matched the committed worker and enrollment files; enrollment SHA-256 is `c9135a8b3809b9eacd349698cdeb1655713e6c4caac548db8bfa58c879305e05`. Author HEAD was clean before and after verification.

After explicit target release, with no compiler present, the reviewer held the sole existing shared target lease. Exactly one run of each was performed:

- Complete default-parallel `account::`: **75 passed, 0 failed, 0 ignored**, exit 0. Includes both stack regressions, the corrected original fixture, the new two-path lifecycle counterexample, and existing cancellation/retirement tests. No separate repeat of the included counterexample was necessary.
- `sync::adapter::adoption_tests`: **6 passed, 0 failed, 0 ignored**, exit 0.

Both used `cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e --locked --offline <filter> -- --nocapture`, existing target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`, jobs2, dev/test debug0, incremental0. Minimum sampled free space was 10,261,151,744 bytes, above the 6GiB floor (6,442,450,944 bytes); no floor trigger. Cargo exited, no compiler remained, and the target lease was released.

[Receipt and exact commands](../../verification/account110/native-worker-stack-independent02/receipt.json) and [exact complete-group log](../../verification/account110/native-worker-stack-independent02/account-default-parallel.stdout.txt) are archived with SHA256SUMS. The complete-group log SHA-256 is `0811ddc9841a7ddbda20396029eaa5ddb067c4b628e7a1a4a5df9f76e0f14ebb`.

Only reviewer documentation/evidence was written. No application, original/live-owned library, grant, Noise material, device, external network operation, manifest refresh or package build was accessed/executed by this review. Original live01 remains FAIL. A newly built exact candidate and a separately authorized live run are required before any runtime acceptance claim.
