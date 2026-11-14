# ACCOUNT110 request deadline native verification

Date: 2026-11-14 (Asia/Shanghai). Author verification only; independent review and actual App direction-sync acceptance remain pending.

Source: `493550e545749e735ff862e46a79bdddd0529b92`, based on contract commit `7b950f2eb55205e8ce8563b8f54392fe8e2dad22`. See the [architecture contract](../../../../architecture/account-device-actions.md) and [task](../../../../plan/tasks/app-account110-device-actions.md).

The product preparation path no longer imposes its own 60-second timer. A small `prepare_request` function retains the original stop selection and awaits preparation on cancellation; `transfer_target` calls this same function. The existing 185-second request deadline still covers preparation and transfer without restarting. Stop checks, identity/workspace/Noise validation, blocking action retirement, mapping closure and permit ownership remain intact. `request_io` is unchanged: its cancellation drops the wrapped IO future and does not itself prove SDK cleanup. The deadline requests cancellation; actual retirement may finish later.

The exact-lock CLI probe separately observed successful maps taking 33.026 + 28.400 seconds. This motivates removing the conflicting timer, but does not establish the cause of the earlier 24-second SDK failure or demonstrate successful App push/pull.

## Results

- Three new virtual-clock tests passed, with no failures or ignored cases. One completes two map-duration fixtures plus preparation and transfer in 73.426 virtual seconds. One prepares for 100 seconds then proves transfer is cancelled at the original request time of 185 seconds, keeps Busy through delayed retirement, fences late authorization and rejects late success. One drops the caller after 61.426 virtual seconds of pending preparation, verifies the preparation owner is drained before releasing Busy, and rejects admission/transfer after cancellation.
- Nine existing targeted tests passed, with no failures or ignored cases: pre-dequeue expiry; dropped in-flight caller; actual network transfer with a blocked synthetic backend; late blocking admission; pending-IO cancellation; unconfirmed retirement; and three bootstrap identity/owner/nonce checks. These use synthetic fixtures and loopback, not the running App or an account endpoint.
- Initial compilation failed because the new test lacked the `ReplicationPolicy` trait import. The failure is retained in `compile01.log`; the corrected compilation and results are in `unified-deadline.log`. Existing native warnings remain in the logs.
- `git diff --check` passed. Available source lockfiles match the contract base. `tokio/test-util` is enabled only in dev dependencies for virtual time; no dependency version or production dependency configuration changed.

## Commands and boundaries

The new group used `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked --offline account::worker::tests::unified_deadline -- --nocapture`. The nine existing cases ran from that same generated test executable with exact names; the complete arguments are retained in the command JSON files.

All compilation used the existing shared target, two jobs, dev/test debug zero, and incremental zero. A controller monitored the 6 GiB disk floor; it did not trigger. The shared target lease was released after verification, with 8,958,020 KiB available. No App, probe, original library, credentials, devices or account network operations were used. No package was built and no product acceptance is claimed.

`receipt.json` records source hashes, unchanged lock hashes and result counts. `SHA256SUMS` covers this README, the receipt and all retained logs/command records.
