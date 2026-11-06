# d034a85e picker-key admission: BLOCKED

The new fixed key allowlist and app-lifetime sequencing pass scoped host checks, but two mixed-user duplicate foreground counterexamples bypass the declared unique-field boundary. Do not treat this freeze as admitted for device key execution.

Only `d034a85e` was cherry-picked for this review. Both named files exactly match their frozen author objects; hashes are in `source.json`. No unrelated selector change was included.

| Host process | Natural exit | Wall seconds | Result |
| --- | --- | --- | --- |
| Independent narrow checks | 1 | 0.068441833 | 5 pass, 2 fail |
| Author focused picker checks | 0 | 0.034013000 | 24 pass |

The exact `picker_key` helper accepts ENTER/keycode66 for either of these inputs:

1. A valid single DocumentsUI/u0 Resumed+Focus pair, followed by `mResumedActivity: ActivityRecord{xyz u10 com.foreign.app/.MainActivity t22}`.
2. The same valid pair, followed by `mCurrentFocus=Window{xyz u10 com.foreign.app/.MainActivity}`.

The regex first selects only the expected u0/shape lines, then counts those matches. It therefore ignores the additional foreign-user field rather than refusing the ambiguous whole observation. The author checks cover duplicated valid pairs, wholly foreign observations and wholly different users, but not a valid pair mixed with a foreign-user duplicate. Exact complete synthetic inputs and results are preserved in `result.json` and executable `check.py`.

Count all occurrences of the Resumed and Focus field lines first and require one of each, then strictly validate those unique complete lines for u0, exact DocumentsUI PickActivity and matching components. Keep these two original counterexamples unchanged for the recheck.

The other five checks confirm the fixed six-key mapping, refusal of raw codes/unrelated keys/shell text before side effects, three app-lifetime checks around observation and the key event, abort without action replay on an identity mismatch at any of those checks, and unchanged per-command ownership validation in source. Calls to `main` are host mocks; ADB, app-identity helpers and subprocess execution are replaced or forbidden. They do not prove real-device state.

The original source reads `dumpsys activity activities` for both fields. Whether that actual dump contains the focus field was initially unverified here; absence would cause safe refusal. It is a separate observation-source question, not the reason for this BLOCKED result.

Zero ADB/device actions, builds, main writes, invitations or user-data reads occurred. No old 20-test suite was rerun. Actual key navigation, file selection, attachment persistence and export remain unaccepted by this host review.
