# Account110 native checkpoint findings 01

Checkpoint: `c6f6e6da5f2d5bc512c38bd580b0ee7354db41b6` (native `75da39e2`, SDK accessor, and network fixes through `7177ca9c`). Date: 2026-11-14. **One blocking lifecycle finding remains; this is not final native approval.** This report makes the earlier preliminary IPC-timeout feedback concrete. Exact-source static inspection only; no reproduction, Cargo, target use, app, device, network, or account/store-data access.

## P1 — IPC deadline does not cancel an already admitted transfer

Exact checkpoint locations:

| Source | Observation |
| --- | --- |
| `src-tauri/src/account/mod.rs:654-664` | Reserves work and enqueues `DeviceRequest` with target, direction, epoch, permit and oneshot sender. No request cancellation handle is retained. |
| `src-tauri/src/account/mod.rs:678-682` | `timeout(Duration::from_secs(185), receiver)` drops the receiver on timeout and maps that event to `Error::Sync`. It sends no stop signal. |
| `src-tauri/src/account/mod.rs:689-705` | Publishes Failed plus finishedAt after that wait, while the operation can still be running. |
| `src-tauri/src/account/worker.rs:12-17` | `DeviceRequest` has no request-specific cancellation/deadline token. Its work-owned permit correctly prevents a second same-epoch job while it remains alive. |
| `src-tauri/src/account/transport.rs:930-940` | Checks `request.done.is_closed()` only before starting work. Once `transfer.await` begins at line 937, receiver closure is not observed. The terminal send can discover closure only after transfer completion. |
| `src-tauri/src/account/transport.rs:1048-1073` | Preparation and active transfer select only on the content child's `stop`, not request receiver closure. IPC timeout does not cancel that token. |

The result is not overlapping native jobs: the RAII permit already addresses that part. The remaining issue is that the API can report terminal failure and release its waiting command while content transfer continues without a cancellation request. If the IPC waiting future itself is dropped after admission, the same missing connection applies. Pause/signout cancel the content child, but an IPC deadline alone does neither.

The timing budgets do not establish retirement before the caller deadline: preparation permits up to 60 seconds, and the network action has a 120-second action budget plus bounded caller grace/cleanup. Synchronous backend delays can also outlive cooperative async timeout polling. Simply increasing 185 seconds would not connect timeout/drop to cancellation or prove termination.

## Reproduction to implement, not yet executed

Use fresh synthetic fixtures with shortened injectable budgets; no real accounts or stores are required.

1. Admit one request, let it pass the epoch/receiver-closed preflight, and hold its in-flight preparation or transfer at a deterministic test barrier.
2. Expire the IPC waiter deadline while content remains enabled/current. At this checkpoint, only the receiver is dropped and Failed is published; no cancellation is sent to that admitted work.
3. Release the barrier. The current worker can proceed with transfer, then its `done.send` fails because the receiver is gone. A fixture backend counter can demonstrate post-timeout work without needing any private data.
4. After the fix, assert cancellation is observed; no subsequent business RPC is admitted after the cancellation fence, pending work retires, replacement work remains Busy until retirement, and a later explicit retry alone can start new work.

Also cover timeout/drop before dequeue, during preparation/mapping, while waiting on the network action, and while a synchronous backend call is held beyond cleanup budget. Already committed atomic work need not be rolled back. The assertion is fenced admission plus honest retirement, not impossible interruption of a synchronous atomic write.

## Minimum correction requirements

- Give each request a work-owned cancellation signal and propagate timeout or waiter destruction to it (a cancellation-on-drop guard is one option). Retain the existing content epoch and fixed selected target/direction.
- The worker must keep ownership of the transfer and its cleanup. Observe request cancellation throughout preparation and active execution. Do not implement cancellation merely by dropping the `transfer_target` future: it owns mappings and a blocking network action that need orderly retirement.
- On active cancellation, request network disconnect and observe the action/retirement result before releasing its resources and work permit. If bounded cleanup cannot prove retirement, return a bounded failure while retaining Busy/fenced authority until actual retirement, as the network fix does. Do not interpret an ignored cleanup error as confirmation that the task has ended.
- A request-token fix must also avoid a startup race: cancellation may run after `spawn_blocking` has been scheduled but before its closure enters `transfer_once` and reserves the network task. One `disconnect(id)` can find no task; the queued closure can then start later. A check immediately before calling `transfer_once` alone also leaves a check/admission race. Link cancellation to network task admission, or use an authorization/lifecycle fence that reliably rejects any late-starting action. This is a requirement on the proposed request-cancellation fix, not a separate allegation that existing pause/signout bypasses its closed lifecycle gate. The author may choose the smallest correct implementation.
- Preserve directory ownership while cancelling content work; do not logout, delete grants/data, change target/direction, or automatically replay the failed request. Preserve the operation permit until its work actually retires, and keep status semantics accurate about timeout versus completed cleanup.

Required targeted startup-race fixture: hold the blocking executor closure before network admission, cancel the request, let the cancellation path attempt retirement, then release the closure. It must perform zero business work, must not strand a permit, and must not start an unrequested retry. This is distinct from cancelling a socket that has already registered a task.

## Other checkpoint observations and remaining gates

The paused content-owner branch does not enter enrollment/content activation or workspace adoption. Requests carry a content epoch and are rejected before execution when stale or closed. Directory rows are cloned for selection and enrollment protocol UUID/Noise key/workspace checks pin the mapped target. The SDK accessor is a borrowed secret accessor; the field stays private, excluded from Serialize and redacted Debug, with an explicit vendor modification declaration. These static observations do not establish compile/test success.

The four integrated network source files exactly match approved `7177ca9c`; [network review02](app-account110-network-02.md) independently closes its original P1/P2. That approval does not close this native waiter lifecycle issue. Final native approval requires an exact fix/final commit, relevant author/independent evidence as coordinated with the parent, and rechecking the complete integration. Huygens currently owns the shared target; the reviewer has not acquired or used it. Author trees and the registry server tree remain untouched.
