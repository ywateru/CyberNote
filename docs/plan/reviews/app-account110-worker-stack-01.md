# Account110 worker stack independent review 01

Verdict: **CHANGES REQUESTED / integration gate blocked** for patch `8c3fc430c7289a4e5a96f45f676612861037fd2e`, author receipt HEAD `75d0a4cba2fc33c27cce1057abbf054360878f74`, base `cb91f4b82995a314268aa47b491b7973679dff8f`. Date: 2026-11-14. The heap-pinning change has no identified source-level blocker, but the complete account group fails reproducibly and the cause remains unconfirmed. Do not report an isolated rerun or the new regression passes as a green account group.

## Reproduced blocking validation failure

The author's retained default-parallel account run had 73 passed / 1 failed. The reviewer ran **one independent complete account group at the exact same product source**, also with default parallelism: **73 passed / 1 failed / zero ignored**, exit 101. The failure is the same:

```text
account::enrollment::tests::real_store_activation_preserves_documents_and_restart_identity_and_allows_explicit_adoption
src/account/enrollment.rs:823:14
sync_adoption_blocked
```

The error message is the Session-level “unfinished save or sync barrier” category. The author's isolated 1/1 pass is retained and credible within its narrower scope, but does not resolve the independently reproduced group failure. No additional broad rerun or green-until-pass loop was performed. Whether the underlying issue is a fixture lifecycle omission, an existing product race, or another interaction is not yet proven.

Concrete source chain for author investigation:

- The fixture retains `shared: Arc<(Mutex<Session>, Condvar)>` across adapter Runtime shutdown/recreation; it does not simulate a process restart by reopening Store into a fresh Session.
- `sync/adapter.rs::activate_account` invokes `begin_local_recovery`, which creates a Session quiet operation.
- `pause_account` calls `sync_abort`; `session/synchronization.rs:629-636` marks that quiet operation aborted, rather than removing it.
- Clearing an aborted quiet operation happens in `sync_tick`/release. Runtime shutdown stops and joins its coordinator, but does not itself prove that release has occurred.
- The new Runtime starts a background coordinator. At `enrollment.rs:823`, the other-workspace preflight races that coordinator when it immediately inspects the reused Session. The same-workspace preflight just before it is explicitly allowed even with pending quiet state.
- `Session::sync_adoption_preflight` rejects a different workspace when pending/intents/quiet are present. The observed message selects this Session guard rather than a Store projection-rejection message.

This is a source-supported, specific retirement hypothesis, not captured proof that `quiet.current` was the particular live field at the panic. The failed run did not log those fields. Resolve it deterministically: make the fixture explicitly finish and observe the real release/retirement protocol, or perform a genuine Store/Session reopen if that is the intended scenario; instrument/assert the finite pending/intents/quiet state as needed. Do not add an arbitrary sleep, clear those structures manually, bypass preflight, or weaken data-preservation assertions. Then provide an exact fix and complete-group validation retaining these first failures.

## Stack fix review and measured boundaries

Only `src-tauri/src/account/worker.rs` changes. Its exact SHA-256 is `46a1e697311521aebaec92030af680b89c998e35d92e97ee0388919063c0726a`, matching the author receipt. Both real child futures are boxed/pinned before composition. `join_owners` still cancels the common stop on either child's error, waits for both children, and preserves content-error precedence. The outer worker still performs control/catalog/SDK cleanup after the join. There is no detached child task, production thread-stack increase, network/authorization change, cancellation-timeout inflation or early cleanup drop in this delta. Existing request cancellation/join/retirement implementation is unchanged.

Both new regressions pass in the independently failed group. Measured debug sizes agree exactly with the author: content owner 105400 bytes; directory owner 1488; previous inline composition type 213904; heap-pinned join 128; worker 10608. The scoped 512KiB thread polls real paused content/directory futures through their cancellation/drain branch and enters the cancelled full-worker poll/cleanup. The second test demonstrates that either child failing cancels but still waits for delayed retirement of the other.

These tests establish smaller composition and actual no-network cancellation-path polling on the specified stack. They do not poll successful authenticated SDK registration into the real child composition, nor prove the post-login GUI crash eliminated. The original live01 remains FAIL, with Rust stack-overflow diagnosis preserved in `633bc98209000375d9290b459607d25ed850cc66`. No live run was repeated by the reviewer.

## Evidence, lease and preservation

All six author archive SHA256SUMS entries under `docs/verification/account110/native-worker-stack01/` match independently hashed committed bytes at `75d0a4cb`, including the first failed group, isolated pass and preliminary/final scope labels. The author receipt explicitly records target release; before taking the authorized review lease no cargo/rustc/clang was present and free space exceeded 6GiB.

Independent command:

```sh
CARGO_TARGET_DIR=/private/tmp/cybernote-account109-mac-ec4348c6-target-01 \
CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 \
CARGO_INCREMENTAL=0 \
cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e \
  --locked --offline account:: -- --nocapture
```

The [independent receipt](../../verification/account110/native-worker-stack-independent01/receipt.json) records the one failed run, exact source/environment, disk monitoring and release. The [exact output](../../verification/account110/native-worker-stack-independent01/account-default-parallel.stdout.txt) has SHA-256 `b9b25c3ab331d8aff72c86bee191f55cae9f1db70194ae86e7e72ad0ec348d56`. Minimum observed free space was 10267267072 bytes, above floor 6442450944; the floor was not triggered. Test process exited, no compiler remained, and the target lease was released with 10266177536 bytes free. Author tree remained clean.

Only documentation/evidence was written in the independent review tree. No author source, manifest, locks, app, original/owned-live DB, grant, Noise material, device, network setting or deployment was changed/read for execution. The standalone synthetic blocking-panic test's expected panic is not the failed enrollment test and must not be conflated with it. Approval awaits resolution of the reproduced account-group failure and exact final-source review; no additional target is being held.
