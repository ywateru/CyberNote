# Post-login errors — cross-layer static review 01

2026-11-14. **APPROVE the reviewed native/UI source integration and the exact eight-pin manifest update on static inspection; no blocking finding.** This does not establish compilation, fixture success, export validation, or live authentication/synchronization success.

Reviewed the committed tree `aee6892824ce0d0504612d1e62291c6c7c5ee965`: native `6c10020790f24c9421ef55ee51d97bd3ae57275b` (author `982d669a18df91eb602eea6079105220ba052b74`), UI `1b59adf580ef165616ab88e45346b430176fa259` (author `eab330d94e2fac5837c802e97ed1f9c38e9e3286`), and UI correction `aee68928` (author `002220db7586f2a664fe1d1d4906c9e01347fbbe`). Native files are unchanged between `6c100207` and the reviewed final tree. Reference: native independent review `c40260a9af091091123e319b0ca358763c3c6cbc`; frontend independent review document was not yet merged when this review began. Contract: main's supplied `docs/plan/tasks/app-account109-post-login-errors.md`, including the successful-status-read exception.

## Field and rejection agreement

- Native `SafeError`, frontend `validateAccountError`, and finite report projection agree on the six request reasons and three coordinator request stages. New request details cannot mix with identity/provider/token diagnostics. HTTP status is paired only with `httpStatus`, integer 100–599 excluding 2xx; authentication classification requires 401/403, and those statuses cannot masquerade as network classification. Other request reasons require the network code and omit status.
- Existing provider diagnostics remain authentication/authorizationProvider-only. Token operation/field details remain paired, finite, and restricted to identity-invalid/responseMetadata without stage/provider/request details. Legacy errors may omit the newer diagnostics; absence does not acquire an inferred cause.
- `account_command` returns the native serialized SafeError directly, retaining the main-window/application-origin gate and fixed `account_window_invalid`. The frontend recognizes that shape and the bounded legacy `{code,message,commit:null}` shape. Extra properties, invalid combinations, arbitrary strings and unknown IPC exceptions fall back to fixed local text. Unknown status codes without diagnostics become a fixed unknown classification, not an inferred ownership/network error.
- Native messages are fixed; frontend status/IPC messages are not used as displayed upstream copy. Explanations come from local tables. Collapsed details contain only code/stage/reason/providerReason/tokenOperation/tokenField/requestReason/httpStatus. The safe report helper projects finite labels, not message, response body, URL or credentials; it is a report projection, not the frontend DTO validator.

## Display, lifecycle and explicit retry

- Request explanations preserve operation, timeout/connect/body/invalid-response distinction and actual HTTP status, including rate limiting and server failure. Generic browserOpen wording is now “打开登录页面”; the narrower “未能打开系统浏览器” message is selected only for the still-authorizing embedded-to-browser transfer failure.
- UI `initialAuthorizationRetry` and native `SafeError::initial_authorization_retry`/`authorization_mode` agree. The new branch requires error state, no profile, coordinatorProfile network/authentication failure, and no provider diagnostic. UI sends explicit SignIn with the selected finite surface; native selects ordinary begin (`false`), without replacement logout or enable. Enrollment/JWKS failures do not gain this unbound retry. Lifecycle/pending-generation ownership and retained-grant Busy/cleanup fences remain.
- With-profile network recovery still requests syncNow, matching native bound recovery using the existing authorization. Its binding/enable checks preserve the previous pause setting. Authentication rejection at coordinatorProfile is not promoted to refresh rejection; existing refresh-rejected replacement recovery remains separate. Poll/focus handlers send status only.
- Immediate command failures have a separate operation heading and safe details from the existing status failure. Same state/error polls and metric/device/message churn retain a foreground Busy failure; a background read failure does not replace it. A changed account/error key retires it. The final correction also retires a failed status read after the next successful status read even if the returned safe state is identical, covering both polling and explicit retry.
- Successful non-read commands clear their prior immediate failure; cancel/signOut still require clean signedOut before claiming completion. Generation/operation guards continue to fence stale replies. Retry buttons do not add silent logout, authorization, or setEnabled actions.

## Native security and evidence boundaries

All platforms use the fixed approved transport; enrollment issuer remains the previous fixed issuer. Normal TLS/no redirects, issuer/audience/signature/owner/workspace/Noise checks are retained. Invalid coordinator responses and authentication rejection close the transport authorization gate before publish/exit; transient request failures retain the existing signed-lease/backoff limits. Existing failed-bind grant cleanup is preserved, not newly introduced replacement recovery.

Only source, Git diffs and fixture text were inspected. Fixture additions cover request combinations, safe rejection copy, retry and immediate-error lifecycle, but **none were executed**. No tests, compiler, formatter, build, module import, export, App, network, browser or device/ADB operation occurred; no private snapshot/body, database, grant or credential was read. Main's uncommitted documentation was not modified. This review adds only this document in the existing reviewer worktree.

Existing Mac/APK candidates and historical outcomes retain their original identities and scope. The user's hosted-page completion does not by itself prove callback, exchange, binding or synchronization success, and the concrete live failure remains undiagnosed by this static review.

## Manifest and documentation follow-up

Independently reviewed `d36b40c068061ae03944bde7f948e9b0b2efb1d9`, whose exact parent is the reviewed source `aee6892824ce0d0504612d1e62291c6c7c5ee965`. The commit changes only `scripts/publish/manifest.json`: eight existing SHA256 values replaced, with no added/removed paths. All other 1,770 entries and all non-files fields, including schema/policy, are unchanged; inventory remains 1,778 entries. Manifest bytes SHA256: `de897045b4c0cf28cb41cbc5fe6c236cc2245a0cb73deb8a304dcbdabe68b66e`.

Each new pin was independently compared with SHA256 of the corresponding committed Git blob at `aee68928`; all eight match, and all eight source blobs at the pin commit are byte-identical to that reviewed source:

| Existing path | Independently calculated SHA256 |
| --- | --- |
| `src-tauri/src/account/config.rs` | `4b1148afb0ecb3d3d43d6a874feb2d8560f08f6c7b87bcdf243dc8e9d87fee78` |
| `src-tauri/src/account/enrollment.rs` | `d60dca4482c2a73ca12ff1fc6298c601c9539017e34cf92a7b0b41f30031d898` |
| `src-tauri/src/account/mod.rs` | `884ba4d4ce9377ef48dc49b3bbc13f6247fdb9808f04bf35791ca0c5dfcaa702` |
| `src-tauri/src/account/transport.rs` | `3e04ed3dc02d03d8c6360fc44e37f8c095df87b4ab4fb33b077b36e20af405d1` |
| `src-tauri/src/account/types.rs` | `99d2f5eb8c23163506a5b93974c1a37cba231571f9221eefe8a175e54e64e432` |
| `src/AccountSettings.css` | `7c30dcae0f32cfda2e9c10f3ec1d7fb93f1dbc36e1f2d09849128f774b049cd2` |
| `src/AccountSettings.tsx` | `2f454a68b272aadca921aacfbc1b120d27edb343a71bc5960583e2db25ce0618` |
| `src/account-client.ts` | `89f0bc4c78e51be0050a8c3ebe3d64f46223ffab6d4fe68b85332f80f04f6403` |

No runtime-input path scope, third-party inventory, workflow, exporter, policy, or old sealed-root boundary is broadened by this delta. No product file is introduced. This is an exact delta/hash audit, not a full inventory revalidation or export invocation. Static hashing used only committed blob bytes and standard-library hashing/JSON processing; no repository module was executed. No sealed root was accessed or changed.

Also read the UI independent review chain `48933f63`/`4abc38f1`, including the resolved first-patch status-read finding and its source-only approval. At inspection main HEAD was `4abc38f1fa291cf29663035d144187aa71472260`; its committed changes from `aee68928` were confined to docs. This closes the earlier note that the UI review document had not yet merged, without expanding source scope.

Read the uncommitted main diagnosis `docs/verification/account109/native/mac-post-login-diagnosis-20261114.md`, exact read-snapshot SHA256 `0c2dc80f6586ef2e5902201e3d727fc3f2a42ff238a1ec72f9baf97a915701c4`. No blocking wording conflict found: it distinguishes confirmed code paths from the missing live SafeError, labels prior anonymous observations as a conversation summary without raw logs, retains the historical scope-failure branch, and requires a new build before source fixes reach the old candidate. These historical network/user observations were not independently re-probed or established by this review. The report remained unmodified. All execution/private-data prohibitions stated above also apply to this follow-up.
