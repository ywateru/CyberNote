# APP-SYNC84 independent Store review

Date: 2026-11-06. Conclusion: **blocked**, one independently reproduced P2 wire-validation contract failure. Review: `docs/plan/reviews/app-sync84-core.md`.

Reviewed product source is frozen at `d484ab95e73c16794aceee96401e711874fcb40e`; author evidence commit is `e69d7a7c3321aaba97ee883699fea0543fbdf042`. Worktree is `/private/tmp/apple-notes-sync84`. No frozen product source, author test, manifest, lock or lean-runner file was edited. `source-reconfirmed.json` and `source-after.json` each recompute all 39 source fingerprint files: every SHA-256 and byte length matches the author fingerprint. `source-before.json` and `full-lean.*` were produced by the previous independent verifier and retained unchanged when this verifier took over.

The independent runner compiles the actual production Store, Session and sync model through relative symlinks to their frozen source files; it contains no copied synchronization implementation. Its `build.rs` gives the existing Session fixture test the real `src-tauri` compile-time manifest root. This is necessary because that test uses `env!("CARGO_MANIFEST_DIR")/../docs/...`; the author's `scripts/sync84` lean manifest changes that directory. The build script is scoped to this evidence worktree. All cargo runs used the small existing target `/private/tmp/apple-notes-sync84-target`, offline locked dependencies and no Tauri application compilation.

## Evidence layers and natural results

| Evidence | Natural result | Meaning |
| --- | --- | --- |
| `full-lean.*` | exit 101; 104 passed, 4 failed, 3 ignored; 111 total | Complete unmodified author lean suite. Kept as the original failure record. |
| `independent01.*` | exit 101; compilation failed | Initial independent harness used absolute `#[path]` for Session, changing nested default module resolution, and attempted private Store methods from a sibling test module. Fixed only the independent harness using relative production-source symlinks and separate read-only SQLite assertions. No product finding is inferred from these compile errors. |
| `independent02.*` | exit 0; 113 passed, 0 failed, 3 ignored, 3 filtered; 119 total | 105 unchanged production tests with correct Session fixture root, plus eight independent tests. Three original invalid export-path tests were explicitly filtered and have corresponding independent external-path scenarios. This run predates the ninth independent regression below. |
| `locked-drawing01.*` | exit 101; 0 passed, 1 failed, 119 filtered | Ninth independent test deterministically exposes the locked-wire drawing defect. Returned report is `durable: true, applied: false, pending: 1`. |

The four initial failures are not rewritten as passes:

- `session::tests::frozen_ciphertexts_validate_after_decrypt_before_publishing_key`: the lean manifest caused a missing fixture path. The exact original test passes in `independent02` with the correct compile-time root and unchanged fixtures.
- `store::recorded_at_tests::recorded_at_archive_v2_twice_remaps_ids_and_preserves_date_and_bytes`, `store::recorded_at_tests::recorded_at_invalid_archives_reject_atomically_and_v1_stays_unknown`, and `store::tests::archive_attachments_and_cycle_guards`: all export into their own Store data root. Existing `validate_export_target` explicitly rejects this. `old-test-provenance.json` proves `archive.rs`, `data_management.rs`, `recorded_at_tests.rs` and `session/tests.rs` are byte-identical to baseline `f4caa90e`; these are pre-existing invalid test fixtures, not a sync84 product regression. The three new `external_*` tests exercise external export, recordedAt/date and bytes, repeat-import remapping, invalid archive atomic rejection, version-1 unknown-date behavior, folder-cycle rejection and delete/restore behavior. The folder test also asserts data-root export remains rejected. These corrected-path scenarios are separate evidence, not changes to the original three failures.

## Independent Store scenarios

Eight tests passed in `independent02`:

1. A2 is naturally removed from current heads by its causal successor, then a concurrent deleted A1+B1 is selected. Restoring the selected old branch retains A:1, allocates a branch actor and does not dominate the A2 successor. Reopen and two saves reuse that actor at counter 3; two Store replicas converge. No artificial deletion of heads/frontiers is used.
2. With media staged, plan simulation leaves complete attachment and `.sync` file snapshots unchanged and does not project the note. Removing the blob after planning makes apply return `sync_plan_stale` without losing inbox; restoring bytes allows the original unchanged plan to apply.
3. Wrong attachment owner, missing document-reference metadata and supplied relativePath are rejected atomically across a batch. Inbox, descriptor registry and frontier remain empty. Partial file input publishes nothing and cannot produce a durable receipt or business projection.
4. An injected `BEFORE DELETE sync_inbox` abort during local lock rolls back the business note, selected head and inbox together. After removing the injection, lock removes causal plaintext; late replay does not recreate it. Both SQLite and WAL bytes contain neither selected nor ancestor secret before flush. Reopen keeps the note sealed and subsequent wire contains no marker.
5. Existing-note adopt keeps exact workspace/device identity after strict mismatch errors and restart. System folders never enter bootstrap wire; incoming system-folder tombstones are rejected without inbox effects.
6–8. The three corrected external-path archive scenarios described above.

The ninth test, `locked_wire_must_reject_unencrypted_drawing_body`, generates sealed content using real `lockNote`, replaces only the raw document with valid drawing strokes, recomputes the digest, and calls the real receiver. It expects rejection and empty inbox. The frozen receiver instead accepts and persistently ACKs the envelope; the assertion is deliberately failing and must stay until the product is fixed.

## Review coverage

Code review covered durable max-seen frontiers including received inbox vectors, selected-head inheritance, persistent branch actor reuse, explicit joins and overflow; business-trigger dirty/redaction transactions, causal inbox pruning, concurrent retention and lock replay; dry plan simulation, generation and recomputation, derived folder note targets and busy-owner exclusions; attachment owner/reference validation, immutable descriptors, local attachment collision, file hash/length validation, staging/cache/free-space limits, fsync and atomic publication; durable versus applied reporting; same-vector equivocation after compaction; system-folder exclusion; opt-in schema and strict prepared-device adoption. Existing production Store/Session tests in `independent02` include the author's 29 selected sync tests and broader previous Store/Session tests, including SIGKILL recovery, business CAS and encrypted fixtures.

No real socket/network, authenticated pairing or Prepared-file recovery, actual Session/UI apply barrier, Tauri linking, Android/device, original user notes, microphone, VPN/tunnel, installation or release result is claimed. No mainline write, worktree creation/removal, push or merge was performed. `git diff --check` is clean for authored review/runner/JSON evidence; the three raw cargo stdout files retain their original extra terminal blank line, which the all-files whitespace check reports. Raw logs were not edited to silence that report.

## Reproduction

Run from `/private/tmp/apple-notes-sync84`:

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path docs/verification/sync84-core-independent-01/runner/Cargo.toml locked_wire_must_reject_unencrypted_drawing_body -- --exact independent::locked_wire_must_reject_unencrypted_drawing_body
```

This must currently exit 101. To reproduce the broad regression scope while retaining the new failure:

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path docs/verification/sync84-core-independent-01/runner/Cargo.toml --no-fail-fast -- --skip store::tests::archive_attachments_and_cycle_guards --skip store::recorded_at_tests::recorded_at_archive_v2_twice_remaps_ids_and_preserves_date_and_bytes --skip store::recorded_at_tests::recorded_at_invalid_archives_reject_atomically_and_v1_stays_unknown
```

The broad command now includes the ninth regression, so `independent02`'s earlier 119-test green count must not be used to describe a run of the final 120-test tree. Exact commands, timings and natural exits for each actual run are in the corresponding status JSON files.
