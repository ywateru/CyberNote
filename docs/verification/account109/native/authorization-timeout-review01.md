# Authorization wait budget: independent review

2026-11-13. **APPROVE; no blocking findings.** Exact commit `711c6d695538ef136d8254446d0070a1827cda5c`, parent `0e06b715d221d2ab648741cc8c52d7d3e594d206`. Reviewed only the two committed runner/test files against the [refresh recovery contract](../../../plan/tasks/app-account109-refresh-recovery.md). Reused independent detached checkout `/private/tmp/cybernote-account109-relay-observer-review-01`, advanced to this exact commit; checkout remains clean. No product edits or commits.

CLI accepts the optional flag once, with a canonical positive ASCII decimal string and a safe-integer range of 120000–600000 inclusive; default is 120000. Missing values, duplicates, signs, leading zero, fractional/exponential/hex syntax, whitespace/newline, unsafe integers, overflow and out-of-range inputs reject. Existing canonical paths, explicit end state, owned-store boundary and credential/unknown-option rejection remain. Validation occurs before any binary/store/output access. The selected numeric `authorizationTimeoutMs` is included directly in the result report.

Actual `run()` wiring was source-traced separately from the factory tests:

| Actual call site | Budget destination |
| --- | --- |
| B clean historical signedOut: UI SignIn → line 305 | `authorization.bSignedOut` → `waitForBHistoryAccount` |
| B classified invalid_grant: `recoverB.login` → line 325 | `authorization.bRefresh` → `waitForOriginalAccount` with original subject |
| A UI SignIn → line 334 | `authorization.a` → `waitForOriginalAccount` with original subject |

`run` constructs these wrappers from the parsed value at lines 217–218, and records that same value at line 225. The only three runtime uses are the terminal SignIn waits above. B read-only asynchronous startup remains 120000; recovery syncNow does not receive this budget; UI-ready checks remain 5000, enable/B-ready and connection remain 120000, data remains 60000. No production callback deadline, binary/source pin, network configuration, owner validation or lifecycle code changes.

Authorizing can still retain an incomplete profile, but existing subject checks execute on every available profile. Terminal username, historical hash and original subject gates remain strict. Auth/cleanup errors, signedOut termination and owner/username mismatch still reject without waiting for the expanded deadline. Failed recovery still executes only its selected action and cannot fall through to another SignIn, retry or enable. Existing baseline/content/raw-byte preservation and final natural-close/all-child cleanup gates are unchanged. Extended waiting does not prove live authorization success; AUTH06 remains unexecuted.

Independent device-free verification: `node --test scripts/verification/account109-desktop-relogin.test.mjs scripts/verification/account109-desktop-helpers.test.mjs`: **58 passed, 0 failed/cancelled/skipped** (34 runner + 24 helper). Tests use simulated time for all three authorization paths, default and inclusive bounds through 600000, delayed success, intermediate failures, owner rejection, single recovery, and unchanged startup/connection/data budgets; existing cleanup/preservation tests also pass. These are fixture/helper executions, not an end-to-end `run()` over original stores; actual wiring/result recording were independently checked in source as described above. `git diff --check 0e06b715 HEAD`: exit 0.

Compact output retained at `/private/tmp/account109-authorization-timeout-review01.txt`, SHA-256 `861aaca02ad9f65739ad765293b1d70d67ffa76b797190bfed5b5d6c77de1f76`. No broad artifact copies. No native target acquired, cargo/compiler/native build, dependency installation, App/browser/ADB, original store/grant or network access. Approval covers this runner budget increment only; any subsequent real run remains parent-controlled.
