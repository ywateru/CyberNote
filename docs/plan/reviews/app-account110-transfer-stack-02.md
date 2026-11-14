# Account110 selected transfer future final independent review

Verdict: **APPROVE source integration/repackaging** for production patch `4c1ac0033d10cd7bc864f2ff4ca087f147f235d8` plus exact test correction `ddf7b79281a2c94f35a28f470855f5bb990268f9`. Date: 2026-11-14. The sole outstanding requirement from [review 01](app-account110-transfer-stack-01.md), commit `2c134144b4e7fd44822a6e1a151260f7c3c9b081`, is closed. No remaining blocker identified within this source chain. Actual App acceptance remains pending.

The incremental diff only replaces the wildcard error match in the real-future small-stack reject test with `AuthenticationAt(CoordinatorSession)`. This is the finite account mapping of SDK NotLoggedIn from the deliberately unlogged Client's real map/connect/active path. The test can no longer pass on an unrelated early error. Production code, actual future types/Box boundaries, cancellation branch and size assertions are unchanged from the parent independently reviewed source.

After the author's explicit target release, verified the clean exact source HEAD and no active compiler. Ran only the affected exact test once:

```text
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked --offline account::transport::tests::real_selected_transfer_future_layout_and_small_stack_poll -- --exact --nocapture
```

**1 passed, 0 failed, 0 ignored, exit 0**. Its measure/reject/cancel subprocesses all exited 0. Reject and cancellation actually poll the real transfer preparation type on 512KiB test threads. The measure-only test thread is 16MiB; no production thread-stack change is made. Observed bytes remain SDK map=24792, connect=24560, request_io=128, prepare=1360, preparation wrapper=208, transfer_target=832, execute_request=152. Reject now checks the exact intended SDK-derived finite error; cancellation still checks Cancelled. Backend inventories remain zero, no Client login session exists, and Client close is awaited.

The preceding independent **13/13** result at `4c1ac003` remains valid for the unchanged production and other tests: actual type/layout polling, shared absolute 185-second deadline, cancellation/drain, late admission, real SyncService blocked synthetic backend, retirement Busy and bootstrap identity gates. The other 12 cases were not rerun. The heap-boundary production review in review 01 stands: nested futures are boxed before wrapper composition; no business permission, identity/Noise/workspace validation, deadline reset, retry, join/drain or mapping/permit/terminal receipt ordering is changed.

Used only existing target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`, jobs2, dev/test debug0, incremental0, locked/offline. Minimum sampled free space 8,711,000,064 bytes exceeded the 6GiB floor, which did not trigger. Owned tests exited, no compiler remained, source stayed clean, **target lease released**. [Project receipt, exact output and hashes](../../verification/account110/native/transfer-stack-independent02/receipt.json) include the author's tightened-result receipt. All original author SHA256SUMS entries were rechecked unchanged. Baseline and first partial-fix failures remain in their private originals and byte-for-byte project copies from review 01; neither is relabeled or overwritten.

This is source and normal regression approval. No binary/instruction analysis, real App launch, authenticated SDK connection, account/device operation, private original/live library, grant/Noise access, manifest update or package build was performed. The actual owned push crash remains FAIL; a new exact package and separately authorized actual run are still required to establish runtime acceptance.
