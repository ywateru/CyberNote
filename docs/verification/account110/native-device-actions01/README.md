# Account110 native author verification — 2026-11-14

Final native product checkpoint: `5bfc5f33` (full SHA in receipt.json). Worktree source is clean after committing the sole fixture correction. Independent review and publish manifest refresh remain required; this receipt is not live acceptance.

Native pick order is `75da39e2`, `a105583e`, `5bfc5f33`. Network dependencies are picked separately: original `29b2a86d`, then `51040df6`, `7177ca9c` (local equivalents in receipt.json). The network API remained unchanged.

The original account.log records the first compile failure: Arc<Client> receivers and missing SDK secret accessor. Receiver fixes were included in 75da39e2; the approved borrowed accessor is in a105583e. Resumed compilation succeeded, but the newly added paused-owner fixture failed strict private-directory mode checking. 5bfc5f33 initializes that synthetic directory using the existing private::directory helper; production storage validation is unchanged. The successful test run used exactly this final source change before commit.

Final results: account 62/62, Store metadata summary 1/1, SDK accessor 1/1, existing adapter adoption 6/6; zero failed or ignored in these final runs. The failed first resumed run (61/62), rejected SDK invocation, and zero-match adoption filter are retained and do not count as passes. Existing compiler warnings are retained in the logs; clippy and a full suite were not run.

All test invocations used the single existing target, jobs2, debug0, incremental0, locked and offline. Commands:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e --locked --offline account::
cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e --locked --offline store::account_summary::tests
cargo test --manifest-path /private/tmp/account110-native-tests01/sdk-harness/Cargo.toml --lib --locked --offline session_tests
cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e --locked --offline sync::adapter::adoption_tests
```

The SDK is not a workspace member and cannot run its dev-dependency tests via the application manifest. The small temporary harness copies its unchanged Cargo.toml dependencies, points [lib] directly at the actual SDK src/lib.rs, and prepares its own lock offline before locked testing. Both harness inputs are retained here. Its lock is distinct from the application lock and resolves some cached versions differently; it does not alter any product manifest/lock or source. Native integration compilation/tests use the application lock. No new target or downloaded dependencies were used.

Coverage includes strict IPC shapes/direction, directory response validation and bounded HTTP errors, protected registry identity/key/revision and publication ordering, paused real content-owner rejection without Store/SDK registration, epoch/operation fencing, metadata aggregation without Note deserialization, SDK secret omission from Serialize/Debug, signed enrollment/Noise checks, retained recovery, and large-library adoption fences. It does not prove actual multi-device transfer, live registration, relay availability, or UI acceptance.

No application, device, real account login, original/private library, or external account request was used. Shared target released with no owned Cargo process remaining. Last observed free space was 10,683,196 KiB; caches were preserved. Raw original logs remain under /private/tmp/account110-native-tests01 as well as these archived copies.
