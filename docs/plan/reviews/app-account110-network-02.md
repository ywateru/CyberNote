# Account110 network independent review 02

Verdict: **APPROVE** the network implementation through `7177ca9c2c56b10be8e0ef5a51c19571b2132cbe`, including the original `29b2a86d5b65cfad469d62fe87098302e4c1d4ef` and fix `51040df68ddc4bbe896e36406087775b12eeb15b`. The P1/P2 findings in [review01](app-account110-network-01.md), commit `5572a3c8c61bbb065e541c77b249cff9042dee11`, are closed for this exact network source. The original findings remain preserved.

This is independent static source review plus independent receipt/log/source hash verification on 2026-11-14. No independent Cargo rerun was performed or target lease acquired. The existing focused evidence is sufficient for this network verdict; no additional target allocation is requested. Native lifecycle/IPC integration, SDK accessor, registry service, deployment and real-device acceptance are separate gates.

## Resolution of prior findings

**P1 — confirmed task retirement:** `AccountWorker::stop` uses bounded cancellation/waiting but does not clear the slot on timeout. A join observer awaits the action's `JoinHandle`, clears only the identity-matched slot and then signals retirement. Both the action future and observer retain references to the shared account permit, so aborting/dropping one cannot release it while the other still owns running work. The caller's channel deadline and `disconnect` can return failure while the slot remains Busy; neither admits replacement work before retirement. No reservation mutex is held across the bounded waits. This preserves safety when synchronous backend work delays cancellation; it does not claim to preempt an in-progress synchronous atomic commit.

The added blocking-backend fixtures cover both outer timeout and disconnect beyond shortened action/cleanup budgets, verify that replacement callbacks cannot run and that passive admission also remains Busy, then release the backend barrier, observe retirement and permit an explicit retry. The original yielding-future and socket-cancellation tests remain.

**P2 — runtime-wide serialization:** `Shared::reserve_account_operation` supplies one nonqueueing permit for active account actions and passive `BeginTransfer`. Passive handlers retain it until handler teardown, including terminal response delivery; a rejected contender receives finite wire Busy and its socket closes before business RPCs. `policy=None` bypasses the permit. The implementation does not enqueue or automatically retry rejected work.

Fixtures cover two independent authenticated passive sockets, active-versus-passive contention in both directions, no business access by rejected contenders, release on Finish/disconnect/idle timeout/elapsed timeout/stop/revocation, and unchanged legacy concurrent inventory. `7177ca9c` adds only a test: both active permits are held while opposite-direction passive admissions answer Busy; both actions retire, then each service accepts an explicit retry. Static inspection found no additional network blocker.

The original source checks remain applicable: strict fixed direction on active and passive paths, pure account pair/reconnect/wake without content cycle, no legacy content downgrade, pinned peer UUID/Noise key and workspace authorization, durable receipts distinct from foreground application, and unchanged manual automatic bidirectional operation.

## Exact evidence verified

Author receipt: `/private/tmp/account110-network-reviewfix-author-receipt02.json`, 3095 bytes, SHA-256 `130ea2facef06fd68be9926a6952efde5567a2b81180f3c4fe592e24427085b2`. Its source chain matches the reviewed Git objects.

| Existing author log | Independently computed SHA-256 | Observed result |
| --- | --- | --- |
| `/private/tmp/account110-network-reviewfix-tests01.log` | `9df5ce075082a17fb1b66e67e3985f0884d75b96363784b50df37282986a6062` | Initial fix unit tests: 24 passed, zero failed/ignored |
| `/private/tmp/account110-network-reviewfix-suite02.log` | `23d1166db13cdd2c45959059782e0059994d644222e121b1ed7b317fc5f76a6d` | Final network groups 25 + 1 + 3 + 6 + 1 = 36 passed, zero failed/ignored |
| `/private/tmp/account110-network-reviewfix-store03.log` | `9c4ce7842981265d67129c18982fc077bc4d8db1762f919f42430da434834f50` | Four actual-Store groups PASS |

All hashes match the receipt. The initial 24 tests overlap the final suite and are not added to its count. The final log explicitly includes the blocking-backend, active/passive, simultaneous initiation, passive teardown and legacy concurrency cases reviewed above. The four Store groups preserve the original formatted-document/plain-text/attachment/blob equality, prohibited-direction absence, pure pair/reconnect/wake/idle, legacy, cancellation, explicit retry and revocation coverage.

| Committed product source | SHA-256 |
| --- | --- |
| `src-tauri/src/sync/network.rs` | `0cff502577da2367c8c1d12c222a29e3df739fa26f03ce01a9a91b6ee8d4a52d` |
| `src-tauri/src/sync/network/service.rs` | `731398fd443358927daa55ef53c3188a86ab40fc74780d10bc5dd8eda1002c6d` |
| `src-tauri/src/sync/network/transport.rs` | `8aad603a38da40230385cc313815e0d94b81a1f20f7d45e9d8884d3e9638c4e0` |
| `src-tauri/src/sync/network/wire.rs` | `7b9567f56cf8dfda3271359555392af4ef3cc26ff798b0395f38dd3f9c3e37f2` |

These committed-byte hashes match the receipt. All four files also match the native integration checkpoint `c6f6e6da5f2d5bc512c38bd580b0ee7354db41b6` byte for byte. This comparison approves those integrated network bytes only; it is not whole-native approval. In particular, the previously reported native IPC 185-second waiter timeout/cancellation lifecycle remains a separate unresolved integration item at that checkpoint.

Author tree HEAD was `7177ca9c` when checked; its untracked `scripts/verification/account110-device-actions.mjs` is subsequent CLI work and was excluded. Review used exact committed source, not that untracked work. The author's receipt reports locked/offline/jobs=2/debug=0/incremental=0 validation with fresh ephemeral fixtures and loopback authenticated sockets. These results do not establish live coordinator, real-account, app, GUI or device acceptance.

Only this review document was written in the independent review tree. No author/server files, product source, SDK, manifest, target, account data or deployment were changed or accessed for execution. No tests, build, app, device or external network operation was run by the reviewer.
