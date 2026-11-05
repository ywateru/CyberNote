# Mac16 old authorization transactions: bounded late follow-up 58

Date: 2026-11-05, Asia/Shanghai (+0800).

One bounded query of known microphone transactions and this bundle's microphone condition messages was performed. The result does not establish a new authorization outcome or justify a new Start attempt.

## Scope and execution

- Fixed log interval: **2026-11-05 12:23:05 through 13:11:04 +0800**. The end was frozen before either attempt.
- Exact known transaction strings: `msgID=74528.6` and `msgID=71272.6`.
- Additional condition: event message contains `com.local.notesclone` and `kTCCServiceMicrophone`, within `tccd`, subsystem `com.apple.TCC`, category `access`. The one returned subject is exactly `com.local.notesclone`; no neighboring bundle identifier was returned.
- The initial query failed immediately with exit 64 and `log: Cannot run while sandboxed`. Its command, stdout, stderr and execution metadata remain at this directory root.
- The identical fixed query was repeated once outside that restricted execution context, with read-only host-log authorization. It finished in 4.568 seconds, exit 0, no stderr. Exact command and original output are retained under `attempt02/`.
- No continuing polling or third query was performed.

## New observation

The successful query returned only one event, at **12:34:54.745**:

```text
Failed to match existing code requirement for subject com.local.notesclone and service kTCCServiceMicrophone
    cdhash H"0a258674ff1844f9fe57fc9d3619c5cd22fa7cad"
    cdhash H"469ea16128121596a2875236e9c69ef6ffa5d06b"
```

These are the same two code hashes previously recorded for the old signature and Mac16 signature. The event is a code-requirement condition message. It has no transaction ID and does not itself report an authorization result or cancellation, so it is not attributed to either known old request or the current PID.

## Bounded conclusion and limits

No `AUTHREQ_RESULT`, `REPLY`, cancellation record, or other line for either `74528.6` or `71272.6` was returned in the queried interval. There is no explicit new evidence here that either old request later settled or was cancelled, and no new evidence sufficient to change the next step.

This is a bounded absence in retained system logs with the declared process/subsystem/category/message predicate. It is not proof of permanent pending, denial, approval, prompt visibility, unlogged cancellation, or authorization of the currently running process. The report does not reuse old preflight replies as outcomes of explicit Start requests. The original snapshots and their earlier cutoffs remain unchanged.

The root task supplied the fact that the same sealed app had normally restarted as PID80059 without another Start. This follow-up did not independently query or act on that process.

No app launch, Start retry, GUI/device/microphone action, permission/signature/settings change, TCC database access, audio export, or broad user-data read was performed. All added files are under this new evidence subdirectory; product source and previous evidence files were not changed.

## Files

- `query.json`, `execution.json`, `system-log.txt`, `system-log.stderr.txt`: initial restricted failure, preserved verbatim.
- `attempt02/query.json`, `attempt02/execution.json`, `attempt02/system-log.txt`, `attempt02/system-log.stderr.txt`: identical bounded successful read.
- `result.json`: machine-readable bounded conclusion.
- `sha256.json`: SHA-256 of the evidence files, excluding itself.
