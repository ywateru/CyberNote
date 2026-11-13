# Current-original three-peer preparation

Date: 2026-11-13 (Asia/Shanghai).

Implementation: `6d53c58c025b09be294d8ca757721e569828ee30`.
Static-review correction: `a2457983cac139ea74714f5041ce12df3e8bd60d`.
Author base: `3e28ef06687a3a9281d7c4d2bd40d7a9db569362`.

## Scope and prerequisites

The runner pins the independently reviewed Mac source
`72513d1296df4526a08834db65a3427957d3fb50`, binary SHA-256
`187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459`,
and Android source `88b2dabe4bb898b0bf225e913883b43ed2cac865`, APK SHA-256
`2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`.
It does not add configurable candidate, subject or snapshot pins.

Before enable, the runner requires the historical B owner, the expected QA
account and all three peers healthy and paused. It binds the phone to the fixed
current-upgrade snapshot using the existing loadInputs/capture/sameSnapshot
contract, captures both complete desktop baselines and rejects inconsistent
overlapping IDs. A changed phone snapshot is never adopted as a new baseline.
Unsupported locked, deleted, sealed or unauthorized originals are rejected.

Complete any necessary login and pause operations separately before manual use.
The old `--allow-desktop-sign-in` option is rejected. This runner does not sign in,
retry authorization, log out or automatically pause peers to satisfy prerequisites.
Desktop startup may perform the product's normal restore behavior.

## Preservation and failure reporting

Original note IDs, attachment IDs/noteId, document references, semantic fields and
authorized attachment length/SHA are preserved. Desktop managed-file bytes are
also checked. Only projection revision and physical attachment relativePath are
normalized for comparison. Repeated attachment references remain exact.

Every source retains all original descriptors and bytes. Cross-peer union proof
covers all original notes and only document-referenced original attachments;
unreferenced local recovery attachments are preserved at their source, without a
claim that they synchronize. This follows synchronization projection behavior.
Checks occur before enable, after merge, after successful cases, after catch-up,
at final completion and again before cleanup. Reports retain counts/digests rather
than original library content or attachment names.

Feynman's static review of `6d53c58c` found that one failing source could suppress
the remaining sources' last checks. Correction `a2457983` independently captures
each source result, continues after failures and separately attempts each eligible
union check. Cleanup evidence has per-device sourceChecks and unionChecks with
pass/fail or not-checked (merge-not-completed). Only finite error codes are kept.
The initial scenario failure remains intact; original-preservation and owned
cleanup failures are recorded separately. A preservation failure prevents PASS.
Partial preparation checks every captured source without claiming a full union.

## Validation and current boundary

Before the user paused execution, the implementation's five device-free suites
completed 101/101 tests with no failures or skips; syntax checks for its four
files also passed. No raw test log was saved; this is a summary of the completed
command output, not a new execution receipt. Fixtures used synthetic data and
temporary managed files, without original stores, credentials, devices or network.

After the pause, only static source/diff inspection was performed. The correction
adds a fixture for first-peer read failure or changed data in C/B/A order,
continued desktop and union checks, retained primary failure and owned cleanup.
That new fixture and the corrected implementation have NOT been executed.
The earlier 101/101 result does not validate this later correction.

Feynman's initial review found the main wiring complete, but the exact correction
still needs final independent static review. No real three-peer execution, product
acceptance, native build or candidate rebuild is claimed. User manual testing is
pending; automated tests/builds/device operations remain paused.

## Integration

Cherry-pick the implementation and correction commits, then this documentation;
do not overwrite whole runner files from the older author base. Main separately
contains the samplePhonePause correction and its review. This author did not
modify that function or its test block. Product source and export pins are
unchanged by these verification-only edits. Parent main is not changed here.

## Earlier publication audit

The earlier bounded audit covered exact main
`2fbe55df832b0899fcbbdc1dcb9c0abc5ed56391`: manifest changes=[], export
dry-run 1,782 files / 95,347,439 bytes, and consistent 0.1.0 package versions.
The product paths, first-party notes-auth provenance and unconditional production
registration, Android alias transport/fixed enrollment issuer and platform workflow
toolchains were covered. No concrete source-level publication blocker was found.
This historical result is not a fresh audit of later main commits, a sanitized-root
history verification or proof of an actual Actions build. Real QA authentication,
three-peer/network acceptance, final source-root verification and actual Mac/Android
Actions package builds remain outside that result. No new draft, root, remote,
deployment or download was created for this preparation work.
