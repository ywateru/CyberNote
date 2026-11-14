# Account-independent native implementation and recovery verification

2026-11-14. Author evidence; independent approval remains required. No application/default library/device/account/network execution or candidate packaging was performed. All fixtures use synthetic temporary stores and mocked identity HTTP. The existing opt-in public discovery test remains ignored.

## Exact product chain

- Account/adapter base: `d1d8c1af00fa8d325413be56468123d6959d82fc` (parent equivalent `eebe563b`).
- Renderer adoption barrier and retired backend fixture initializers: `487af516acb35482d3cfec214d20e2a2f0bb58ea`.
- Store/Session author chain integrated here: `c022e352` → `5f9fb153451ce03b6000be9885bcba371e97c5ec`; `07602e76` → `e1686148d2c6c9175e1f4c380a91bfe504266367`; `3ef56755` → `5634c8fb39ecbf8b441974e9ecb9df9e410edba6`; `213b1a5a` → `bb5bfe3b638aa5d17158a5421e3866b78d001698`.
- New P1/P2 correction: `a675d959ec9ead6a40fbf74209fdc4a9272dd1d3`.
- Fixture correction only: `2d0e228adfcd2879820e3df77b778a3e6bf32401` (final tested source).

The parent already integrated the earlier base/Store chain. The new source delta for review/cherry-pick is **a675d959 + 2d0e228a**, in that order. This receipt commit changes no product source or manifest pins.

## Corrections and boundaries

P1: AuthClient exposes only its previously accepted usable identity, never a token, through a local read. Startup presents a cached profile only when that retained identity exactly matches the current binding issuer/subject and lifecycle generation. Persisted enabled/paused intent is preserved when the Store/device matches and no incomplete-adoption marker exists. Network failure retains the profile and existing explicit SyncNow recovery route. A direct begin-only SignIn checks for an owned retained grant before pausing or writing enabled=false. Fresh failed B login does not borrow A's profile. Signed enrollment/profile and remote gate validation still precede transport.

P2: Successful explicit signout archives paused public session metadata before removing the current binding/marker. No credential, inbox, note or attachment is deleted. This permits old manual Resume, with the exact existing manual device credential checked before opt-in is persisted; missing/mismatched credentials cannot create a replacement manual identity over account history. Returning to A reuses its device only when the authenticated profile workspace, saved issuer/subject/product/device and existing Noise public key all match the current Store. Fresh login always remains paused. B cannot reuse A's namespace even if its supplied workspace string matches.

The narrow Session local-recovery purpose reuses real probe/prepare, renderer ACK, protected notes, current participants/Store/Session, final intent and recomputed-plan checks. Only this purpose allows an empty eligible inbox with nonempty real projection changes. It is attempted on verified original-account activation and explicit manual Resume/SyncNow, never by account Status or a fresh paused login. Missing media stays blocked until the original workspace can supply it. No adoption check is deleted or bypassed.

**Residual boundary:** a missing projection receipt alone, with business content already equal to the selected head, yields no projection changes and remains NoEligiblePlan. Arbitrary damaged metadata is not repaired by this change. This is distinct from the tested head-only content projection; it must not be described as recovery of every possible adoption blocker. New namespaces still require the full original preflight, quiet barrier and Store transaction. Real GUI account switching and enable/merge are not validated by these offline tests.

## Recorded runs (including failures)

| Run | Exact source | Results |
| --- | --- | --- |
| check01 | `5f9fb153…` | Compile exit101: sparse checkout omitted docs fixture; three test backend initializers lacked new fence. Original log retained. Sparse fixture materialized; initializer fixes committed in 487af516. |
| check02 | `5634c8fb…` | account 48/48, workspace_adoption 12/12, adapter 19/19; all exit0. Predates P1/P2. |
| check03 | `bb5bfe3b…` | workspace_adoption 13/13, exit0. Includes integrated adapter handshake fixture. Predates P1/P2. |
| check04 | `a675d959…` | account-auth 27 pass/1 existing ignored; account51/51. New local-recovery fixture failed because removing only its receipt produced no actual content change. Remaining filters were not run. Failure retained. |
| check05 | `2d0e228a…` | local-recovery1/1, manual-resume1/1, workspace_adoption13/13, account51/51; account-auth27 pass/1 existing ignored. All commands exit0. |

Counts are per filter and are not added into a unique suite total. check05 includes the actual changed-row head-only fixture, ordinary/empty-plan refusal, renderer blocked/participant change/final save-intent aborts, real saved-device A→out→B→out→A with pending inbox, metadata key/owner/device negatives, manual backend retirement/resume/missing-key refusal, and retained AuthClient offline ownership. Existing recovery Host fixtures cover cancellation across restore/bind boundaries; no real authentication was requested.

Commands and timestamps are recorded in each JSON receipt. They use the single shared target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`, jobs2, DEV/TEST debug0, incremental0, locked/offline default-feature library tests; no custom-protocol/native candidate build. The guard stopped commands below10GiB free. check05 source was clean before/after, every recorded lockfile hash was unchanged, and free disk ended at approximately12.59GiB. The controller exited and target lease was released after check05. Existing compiler warnings are preserved in logs; none is hidden or claimed fixed.

Earlier temporary receipts remain untouched. This archive contains small selected receipt/log copies only; SHA256SUMS covers every archived payload and this README.
