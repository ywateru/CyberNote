# Post-login UI independent static review

2026-11-14 (Asia/Shanghai). Source: `eab330d94e2fac5837c802e97ed1f9c38e9e3286`, base `38300df6`. Contract read from the main worktree's uncommitted `docs/plan/tasks/app-account109-post-login-errors.md`. Scope: the five committed UI/CSS/DTO/helper/test-source files. Verdict for this first patch: **BLOCK pending P2 correction**.

## Finding

- **P2 — recovered status reads retain their failure banner.** In `src/AccountSettings.tsx:82–85`, a successful response clears an immediate failure only when its safe state key changes. Start with an established ready, paused or signed-out status; let a status IPC read fail, then let subsequent reads succeed with the identical safe state. The failure stores that same key, so both background recovery and explicit status retry leave “本次读取账户状态未完成” visible indefinitely. Clear a `command === "status"` failure on a successful status response. Continue retaining SignIn/Busy and other action failures across unchanged status polling. Reported directly to Socrates; correction and corresponding counterexample source await review.

## Static checks

- Request diagnostics admit only the three coordinator stages and six finite reasons. `httpStatus` requires `requestReason=httpStatus`, an integer 100–599 outside 2xx, and authentication classification exactly for 401/403. Other request reasons require network classification without HTTP status. Mixed identity/provider/token diagnostics reject.
- Legacy responseMetadata without operation/field remains accepted; detailed token diagnostics require both finite labels in the original identity-only context. New request fields cannot mix with them.
- UI explanations and collapsed details use local finite labels; arbitrary upstream messages and URLs are not rendered. IPC accepts the new finite error or the exact legacy code/message/commit:null envelope; unknown exceptions do not become guessed network errors. Unknown status codes are replaced by a fixed unknown error.
- Unbound coordinatorProfile network/authentication errors select explicit SignIn. Bound recovery and pause selection retain existing behavior; polling issues only status. Final agreement with the separately changing native authorization gate remains an integration review gate, not established by this UI-only patch.
- Error-key comparison ignores message/device/metric churn and retains action failures on identical polling results; account state or safe error changes clear them. The status-read exception above needs correction.

Only committed source and counterexample source were read. No tests, builds, module execution, network, applications, devices, login or private-data reads occurred. Counterexample source was inspected, not executed; no runtime or test-pass claim is made. Product files and main worktree were not edited.
