# Account110 worker stack correction — restart fixture follow-up

Exact source: `08e4b6c76a4fd9f8b4e74b9625fa94be562d2de3`, following heap-pin fix `8c3fc430c7289a4e5a96f45f676612861037fd2e`. Responds to independent review `ea1e04864b7dee642313827d99c2a246e634b18a`. Independent re-review pending.

## Cause and correction

The old fixture shut down its adapter Runtime, then constructed a new Runtime around the same in-memory Session. This is not a process restart. Account activation begins local recovery; pause marks its quiet operation aborted. The coordinator's actual tick/release removes that operation. Shutdown joins the coordinator but does not guarantee one last release tick. A reused Session therefore races the new coordinator when a different-workspace preflight immediately checks quiet state.

The corrected complete-group run captured the old stopped Session with **pending=false, quiet=true, phase=probe**, before closing it. The new deterministic counterexample separately creates the real local-recovery operation and takes the real pause transition (`sync_abort`), without a coordinator race. It verifies that this exact quiet state rejects a different workspace with the Session-level unfinished-barrier error, while allowing the existing workspace/device. Both actual `sync_tick`/abort-release and a true Store/Session reopen remove the process-local quiet operation and allow preflight, preserving notes and the persisted sync identity. It does not directly clear quiet, pending or intents, and uses no sleep. The historical failed runs did not log those fields; no claim is made to have retrospectively captured them.

The restart fixture now joins and drops service/Runtime, asserts the SharedSession Arc has only its local owner, drops that final owner (closing Session/SQLite), and creates a fresh Session from `Store::open`. The original note, workspace/device identity, Noise key and other-workspace preflight assertions remain. It also asserts that the freshly opened Session has no pending/quiet phase before starting a new Runtime.

This correction changes only cfg(test) code in `account/enrollment.rs`. The production application creates its Store/Session and adapter Runtime in setup; normal pause retains the coordinator that performs release. No production lifecycle defect requiring a gate change was established by this fixture failure. Preflight rejection remains necessary, and pause/release/shutdown behavior is unchanged. The existing worker heap-pin product patch is unchanged.

## Verification

All commands used the exact source above, the existing sole shared target, offline/locked jobs2, debug0 and incremental0. Each was run once:

- Deterministic local-recovery lifecycle counterexample: **1 passed, 0 failed, 0 ignored** (covers both real release and real reopen).
- Complete `account::` group with **default parallelism: 75 passed, 0 failed, 0 ignored**. Includes the corrected restart fixture, both stack regressions, and existing late-admission/cancellation/retirement coverage.
- Existing adoption group: **6 passed, 0 failed, 0 ignored**.

The full group retains the same stack measurements: content 105400 bytes, directory 1488, previous inline composition 213904, heap-pinned join 128, worker 10608. The real owners and cancelled worker still pass the scoped 512KiB thread poll regression. The existing synthetic blocking-action panic is expected by its passing retirement test.

The author first failure (73/1) remains unchanged under `native-worker-stack01`, commit `75d0a4cb`. The independent first failure (73/1) remains in commit `ea1e0486`; its receipt/log are referenced in `receipt.json`, not rewritten or duplicated here. No isolated result is substituted for either original failed group.

The monitored minimum free space was 10,190,401,536 bytes, above the 6GiB floor. All owned Cargo processes exited; the target was released before this documentation archive. Logs/commands/hashes are included here. No App, original or live-owned library, login, device, external account traffic, manifest, or package was accessed/run/changed. This is source/fixture verification, not real GUI acceptance or independent approval.
