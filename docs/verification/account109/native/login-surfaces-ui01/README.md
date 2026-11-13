# ACCOUNT109 hosted-login surface UI author verification

2026-11-13. Source `001a5b401afcba96d431bf5d734d134b803c041a`, based on contract/source `f048fd1587433cc1eeaf1a56ec460e13173b69e9`. Author checks pass; independent review is separate.

The account page defaults to embedded hosted login. Its two existing login/create-account buttons share a radio selection; retries use the current selection. Waiting text and the diagnostic DOM attribute reflect only the native authorizing surface. Missing legacy surface stays unknown. The fixed transfer action is exposed only for an embedded transaction and remains reachable while the original signIn/signUp IPC is pending. Status polling never transfers or authorizes.

Command validation permits only the two finite surface strings when the field is present; omitted surface retains browser compatibility. Explicit undefined/null, unknown strings, extra inputs and invalid status/surface combinations are rejected. Transfer has no arguments. Native, startup and export pins were not changed; App.tsx changed only the debug account command allowlist.

## Checks

- `node --test scripts/verification/account109-login-surfaces.test.mjs scripts/verification/account109-status-dto.test.mjs`: 24/24 passed, zero skipped (`tests.txt`).
- `pnpm typecheck`: exit 0 (`typecheck.txt`).
- `pnpm build`: exit 0 (`frontend-build.txt`); existing bundle-size warning retained.
- Syntax checks for the new test and account fixture, plus `git diff --check`: passed.

The UI test bundles actual AccountSettings/client/catalog source in memory and performs real React DOM commits against a small fake host DOM. Tests invoke committed React props. Fixed IPC fixtures and deferred promises cover pending signIn → status → transfer → cancel, late replies, transfer/cancel failure, current-operation gates, both surfaces/actions, status-only polling, retries and finite DTO rejection. They do not prove browser layout, browser event routing, WebKit behavior, native ownership/window lifecycle or real authentication.

`tests-initial.txt` retains the earlier 23/24 run. Its deferred-operation case caught a visible busy-gate projection defect: changing an imperative working ref while busy stayed true did not trigger a React commit. The committed fix tracks the working operation in React state and lets only its current completion clear it; final tests pass. The initial failure is not hidden or counted as final validation.

`receipt.json` records all eight changed source/test file hashes. `SHA256SUMS` covers this compact archive. No native build, App/device/network/authentication/store access or shared target use occurred. Build outputs and the task-local node_modules symlink are disposable and are removed after evidence capture; shared dependencies remain untouched.
