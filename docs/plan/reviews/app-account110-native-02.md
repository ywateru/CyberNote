# Account110 native independent review 02

Verdict: **APPROVE** the complete native implementation at author HEAD `d9baee6f7172f9432098d712b834bf97280e5d04`, product correction `5d4eac3bbf90be851fc91ed931ced2f5ec81670d`, following native commits `75da39e22293bc71a630864e6f5f72f0810a16ef`, `a105583e30a74f7f0812b48b2867304b177512f2` and `5bfc5f33395fb70e27fe40ad493a0d859a2d3781`. No remaining blocking finding was identified within this source scope. Review date: 2026-11-14.

The P1 in [native review01](app-account110-native-01.md), commit `dd9c7d827f36037896123faceeeea68840c6c6da`, is closed for this corrected source. The original blocked checkpoint and [detailed finding](app-account110-native-checkpoint-01.md) remain unchanged as historical evidence. Network approval through `7177ca9c` remains separately recorded in [network review02](app-account110-network-02.md).

## Cancellation and retirement

Each admitted request owns an absolute 185-second deadline, independent cancellation/admission tokens, a work-owned reservation, and a private operation identity. `wait_request` signals cancellation on deadline and uses a drop guard for a polled IPC waiter. Deadline expiration no longer publishes a terminal result while work remains running: it awaits the worker receipt. `execute_request` cancels the request's execution child and drains the owned transfer future, instead of dropping its cleanup.

The content Gate checks the current request's cancellation, deadline and admission fence through `Control::authorized`. The blocking closure also checks cancellation on entry. Thus an early disconnect that found no network task cannot authorize a subsequently admitted action: policy checks still reject it. This is additional protection beyond the start check, not reliance on a check/admission race being absent.

`blocking_request` observes the blocking closure's termination, then confirms network retirement even after a successful initial disconnect or a blocking panic. An unconfirmed retirement keeps admission fenced and retains the work permit; retries are only retirement checks, never another transfer. Earlier retirement errors cannot turn into a success receipt. Preparation cancellation/deadline drains pending work; mapping handles already acquired are explicitly closed and awaited on success and error. The existing network join-observer reservation protects synchronous backend work that has not yet yielded.

The worker publishes terminal status after execution/retirement/cleanup. Owner generation, content epoch, private operation UUID and terminal-status guard prevent an old completion or late success from overwriting a newer/failed operation or advancing lastSyncAt. The work permit survives destruction of the IPC waiter.

**Boundedness limit:** 185 seconds is an execution deadline that requests cancellation, not a hard wall-clock guarantee of synchronous backend termination. A blocked backend can keep the IPC pending and the operation Running/Busy beyond that deadline until retirement is confirmed. This is the explicit safe retirement behavior being approved; it does not claim interruption or rollback of an already committed atomic write. Lifecycle/status locks are not held across network waits. Pause/signout retain their existing lifecycle fencing and directory ownership is not replaced by a request retry.

## Whole-native boundaries checked

- Directory/SDK ownership is separate from the enabled content child. A paused owner can publish/list metadata without entering enrollment/content activation, Store adoption or content cycle. Explicit enable retains existing adoption preflight, pending marker and adapter preservation barriers; the adapter production delta adds only metadata aggregation.
- Registry UUID, random private registry key and persisted safe-integer revision survive logout/workspace changes. Revision is saved before dispatch; rename preserves identity/key/revision. Private mode/owner/no-symlink checks and atomic writes remain. Registry key is a credential despite the older inaccurate “Contains no credential” comment; the implementation does not expose it to frontend or GET projection. That comment is a nonblocking documentation nit, not a reduced protection assumption.
- Directory HTTP uses the fixed configured origin, no redirects, bounded body/schema/row count and finite errors. Missing/unsupported schema is explicit; directory 401/403 does not invalidate a grant. SDK session subject/product are checked against the binding. Private registration associates current SDK session with stable registry identity; frontend projection excludes transport session key, protocol identity and Noise key, and hides offline summaries.
- Selection validates registry UUID, excludes self, requires a fresh catalog row, online/syncAvailable and complete transport/protocol/key association, then clones the row. Mapping uses that selected transport ID. Nonce-bound enrollment, protocol UUID, Noise public key, workspace, invitation and existing peer key checks prevent refresh-time redirection or a different authenticated peer being substituted. Direction stays fixed and delegates to the approved one-shot network path. No automatic content fallback is added.
- SDK `Session::transport_session_key(&self) -> &str` borrows the private field. Serialize still omits the secret, Debug remains redacted, and only the private bounded native registration payload uses the accessor. The vendor change declaration and synthetic omission/borrowing regression are present; no frontend/log/public DTO secret field is introduced.
- Store summary uses aggregate metadata for undeleted ordinary notes, including locked notes, with folders/history separate. It does not deserialize/decrypt document/plainText/sealed content. Last note update is the maximum validated note updatedAt; capturedAt is separate, and empty-library update is null. Neither heartbeat nor transport presence substitutes for note update time.

## Independent verification

Used the one authorized shared-target lease, after checking no compiler process was active. Ran the final clean author source with the existing target only, locked/offline, jobs=2, dev/test debug=0, incremental=0, testThreads=1. **13 passed, zero failed/ignored, 337 filtered out; exit 0.** No unrelated account/adoption full-suite rerun, new target, downloaded dependencies or package build.

The 13 selected tests cover: before-dequeue deadline and waiter drop; in-flight deadline/drop and delayed cleanup; real SyncService with a blocked synchronous backend and no subsequent inventory/content after cancellation; early-disconnect/late-admission Gate rejection; cancellable preparation; blocking panic; unconfirmed retirement/error precedence; operation-identity/late-success status; paused real content-owner rejection; content epoch/operation reservation fencing. Exact filter list and environment are in the [independent receipt](../../verification/account110/native-independent-review02/receipt.json).

The exact independent output is archived as [focused.stdout.txt](../../verification/account110/native-independent-review02/focused.stdout.txt), SHA-256 `bbc7f8a2047e0ba8754a950e29f1a72265848d44a4e4dbaf89038720b0a8f7cc`. Archive SHA256SUMS covers the log and receipt. The author tree remained clean before/after testing. The test process exited and a process inventory found no cargo/rustc/clang remaining; the reviewer **released the target lease** before writing this report.

## Author evidence and integration identity

Independently checked all eight committed SHA256SUMS entries under `docs/verification/account110/native-request-cancellation01/` at `d9baee6f`. Receipt product hashes match committed mod.rs/transport.rs/worker.rs. Final logs record account **72/72** and adoption **6/6**, zero failed/ignored. Initial import compile failures and intermediate-source runs remain explicitly excluded from final-source coverage. Earlier summary **1/1** and accessor **1/1** evidence remains applicable because those product bytes were unchanged; those earlier archive hashes were verified in the preceding review. These counts are not presented as independently rerun suites.

| Corrected product source | SHA-256 |
| --- | --- |
| `src-tauri/src/account/mod.rs` | `33b135715561d829b9b63b3fe12dcb58680a5f4d3d97000aee39f6dd94f6ecef` |
| `src-tauri/src/account/transport.rs` | `d442ae3b7173253f7cf1f64613ba08017cf35cd2044bdcbdcee4c1a532f5f2df` |
| `src-tauri/src/account/worker.rs` | `db3b4fd65e7ba01b5c96105c69c731f926d2cb15a829a9381aebd93454ee3897` |

All 12 changed native/account/Store/adapter/vendor files in integration candidate `3f244eae` match author final `d9baee6f` byte for byte; exact candidate SHA and per-file hashes are in the independent receipt. Its four network files also match approved `7177ca9c`. Subsequent manifest work is outside this comparison and needs its own exact-pin check.

This approves the source/fixture native gate for packaging integration. It is not approval of a future package identity/signature, live directory deployment compatibility, successful account authentication, actual multi-device transfer, GUI behavior, Android compilation or three-platform acceptance. No app/device, real login, original/private library/DB/grant, external account traffic or deployment was used. Only review documentation/evidence was written in the independent review tree; no author/server/product/manifest/lock source was changed.
