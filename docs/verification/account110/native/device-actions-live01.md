# Account110 two-client live01 — preserved native failure

2026-11-14 — **FAIL, no retry**. Exact frozen clean main:
`cb91f4b82995a314268aa47b491b7973679dff8f`.
Package independently approved by Cicero (`991a7a3`); packaging receipt
`129b0a2f21b32c2a8957f17b0e51f3827d6fe8df8a8a5c6ef1b7c955e1d4792b`.
Signed executable SHA256 `43f2d86d3ceab4dabf24d395259037ae46b19c58b5fde15ecbc7e7f0cd4482a3`.

Runner executed once with --run, two new owned data dirs, authorization budget
600000ms, exact production source `e220111362084d4c72b6d6fe2dada505b97a6df3`
and deployment `dpl_8Fewyd8o8HHUouDYJDULDd6XSweY`. Production receipt SHA256
`6eb360ff873b159683e9ae8ee2419ad4b2bd32b78be2c3b6b34da6e6b46414db`.
Parent CUA completed each actual hosted browser form; no credentials or full URLs
captured by runner or this report. No grant/Noise/original-library copying.

## Safe outcome

```text
PASS two fresh independent native stores, rich documents and original attachment bytes
PASS independent real process restart preserves local content and attachments
WAIT a normal hosted browser SignIn; parent completes real form
WAIT b normal hosted browser SignIn; parent completes real form
PASS two normal hosted logins resolve to same verified account, initially paused
FAIL directory CHECK_FAILED
RESULT fail
```

No enable, explicit transfer, reverse-exclusion, directory/rename/summary or final
offline-restart acceptance was established. Do not reinterpret partial login success
as overall PASS. Last observations were both paused, disabled, profile present,
zero pending/conflicts and empty device lists; no directory-phase observation exists.

## Actual native failure evidence

The system crash report matches the exact candidate app suffix and runner parent.
A aborted **18:03:17.4113 +0800**, while runner was waiting for B login.
Faulting thread: `tokio-rt-worker`; exception `EXC_BAD_ACCESS`, signal **SIGABRT**,
termination SIGNAL/6. Stack contains Rust `stack_overflow::signal_handler`,
`tokio::future::MaybeDone<account::worker::run ...>::poll`,
`account::worker::run` and `Runtime::start_network` polling. Fault-thread frame count 70.
This is evidence of native stack-overflow abort before the first directory query
completed; no server directory rejection is established.

Candidate source boundary is worker.rs run(): inline content_owner/directory_owner
futures and their tokio::join! poll path. Large debug future/poll-frame stack usage
is a concrete hypothesis for the native author to verify; this report does not
claim the exact oversized allocation or recursion has been proved. Huygens received
the finite crash evidence and fix request. No source changes or Cargo rerun here.

Runner diagnostics also lose detail: safeFailure maps unlisted driver failures to
CHECK_FAILED, and final lifecycle omits exit.signal and driver failureCode. Thus the
exact original driver error cannot be recovered from this result alone; APP_EXITED
is an inference, not a captured code. Preserve the failure instead of bypassing it.

## Preserved evidence and cleanup boundary

- Owned root: `/private/tmp/account110-device-actions-cb91f4b8-live01`.
- First `result.json` SHA256:
  `01640ccdd6863aee66809793da5b03039114186aafe726ff0fe8eb637cfb7a7c`.
- Safe runner stdout: sibling `account110-device-actions-cb91f4b8-live01-runner.log`.
- Sanitized crash receipt:
  `/private/tmp/account110-device-actions-cb91f4b8-live01-diagnosis01/safe-diagnosis.json`,
  SHA256 `c6394bd18eb00a3b79f1de64ffcfa5a5ac5aa6d7227c206f2defd974c286ddc9`.
- System crash report SHA256:
  `6e09820c22f310bb045057e78dee97a5b02ba481efd2745e3bc5d1031615beeb`.
  Raw report was not copied into runner evidence or Git; no raw addresses/IDs,
  private paths, thread state, memory or user data included in this report.

Runner exited 1. Initial A/B and final B closed naturally with exit0; reopened A
was non-natural, exitCode=null and no runner forced signals. Result retains separate
CLEANUP_FAILED. Exact candidate/data-dir process inventory found no owned apps left.
Four readonly Python probes all closed exit0 without signals or cleanup errors.
No test libraries, attachments, credentials or failure evidence were removed.
No restart/relogin/retry after failure. Root main stays exact clean cb91; all package
SHA256SUMS entries were rechecked unchanged after the run. Target remains released.
This docs-only report is written in the author's separate worktree for review.
