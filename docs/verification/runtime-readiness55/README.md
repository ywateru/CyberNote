# Mac16 microphone authorization: bounded read-only check (55)

2026-11-05, Asia/Shanghai. **As of the precise log cutoff 12:14:31, the current Mac16 microphone transaction has entered TCC prompting but has no recorded result/reply.** A late settlement has not been established. This differs from the previous Mac15 transaction, which eventually did show an explicit late reply. Do not reuse that older reply as evidence of the new build's readiness.

## Exact current identity

- Host PID `71272`, process started `2026-11-05 12:07:46 +0800`, independently read with `ps`.
- Bundle: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-presentation-build16/mac-attempt01/mac-sealed.app`.
- Executable SHA256 independently recomputed: `2235f976b9fa464f78b3f8d700f2f0361ae55c7069fae73c1889b43a09b93e4a`, matching root's sealed-build identity.
- Current `codesign` CDHash: `469ea16128121596a2875236e9c69ef6ffa5d06b`, signature `adhoc`.
- Root-supplied immutable runtime source: `9167db94908ac635b026220e782878447c9e16a7`. Native source was read using `git show` against this commit, not mutable current product files.

See `identity.json`, `process-identity.txt`, `codesign-current.txt`, and `fixed-native-source.txt`.

## Current transaction facts

All times below are November 5, 2026, +0800. The final bounded query is in `query.json`; exact output is in `microphone-transactions.log` and query stderr is empty.

| Time | Recorded fact |
|---|---|
| 12:11:05.280 | `msgID=71272.6`, `sender_pid=71272`, `kTCCServiceMicrophone`, `preflight=false` / `preflight=no`; exact Mac16 bundle executable path appears in attribution. This is the accurate request time, correcting the approximate 12:10:5x estimate in the task handoff. |
| 12:11:05.286 | Existing code requirement comparison fails, comparing `0a258674ff1844f9fe57fc9d3619c5cd22fa7cad` with `469ea16128121596a2875236e9c69ef6ffa5d06b`. The latter independently matches the current bundle. The former matches the prior Mac15 signature recorded in runtime-readiness54; this comparison alone does not establish the sole cause of the delay. |
| 12:11:05.287 | Same transaction logs `AUTHREQ_PROMPTING`. This does not prove a visible prompt or an observed user choice. |
| Through 12:14:31 | No `AUTHREQ_RESULT` or `REPLY` for `71272.6` was returned by the precise query, approximately `205.720` seconds after its request. This is a time-bounded absence, not a claim of permanent failure or denial. |

An initial PID-prefixed inventory query also encountered `71272.5`, an Accessibility preflight at 12:10:37. It is a different service and was not retained or mistaken for the microphone request. The final evidence is limited to the exact microphone transaction plus this bundle's Microphone condition messages in the same interval.

## Source implications and next action boundary

Fixed `recording_access.m:73–77` schedules the native 30-second timeout. `finish:62–71` only marks delivery and returns the one result; it deliberately does not cancel the OS request or clear `pendingRecordingAccess`. `systemCompleted:79–96` ignores already-delivered results and clears the pending owner when its system completion is processed. `start:102` rejects while an owner remains pending, and `start:111–119` installs the owner before requesting system access.

Root reports that this failed child never entered actual capture and has already been closed normally. This diagnosis did not operate or independently re-observe that GUI. The current logs provide **no evidence yet that a fresh Start is ready**; a new attempt may still report busy if the native owner remains pending. A TCC reply, if later recorded, would still not by itself prove native completion was processed or a stream/capture began.

Keep this exact sealed package and identity unchanged. When root returns to Mac UI validation, it can inspect whether a system microphone prompt for this app remains pending and handle the visible state through the existing UI workflow. This report does not prescribe a permission choice or assert that a prompt is visible. If a later result or a new fresh-attempt error needs diagnosis, query the exact new/current transaction and bounded timestamp; do not reset TCC, re-sign/rebuild, reuse the failed child, repeatedly click Start, or assume a fixed 177-second delay from Mac15.

## Scope

No GUI actions, TCC database reads, permission changes/resets, audio/recording file access or export, user database reads, product changes, signing changes, builds, tests or target/shared cache access occurred. Only existing unified logs, the exact process/package identity and immutable native source were read, and evidence files in this directory were written. No claim of live capture, audible sound, a measured public AVAuthorizationStatus, or completed overall acceptance is made.
