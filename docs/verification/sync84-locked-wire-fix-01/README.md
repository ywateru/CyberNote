# APP-SYNC84 locked-wire P2 author fix verification

Source is frozen at `7da43718bc96fbf3d7a5e577aa65d2b5b3807307`, based on the independent review commit `a0a2600c`. This is the author fix and author revalidation; the existing review remains blocked pending the separate independent re-review. Original failed evidence and the independent regression were not rewritten.

The product fix is limited to `src-tauri/src/store/synchronization/validation.rs`: `note_payload` rejects a locked raw wire unless its document exactly equals the canonical `empty_doc()` emitted by production lockNote, its plainText is empty and sealed exists. This check runs before attachment descriptor/frontier/inbox writes and durable receipt. It compares the complete document, so non-text drawing strokes, attachment nodes and other entity/attribute content cannot pass by producing empty doc_text. This intentionally requires the current production canonical raw body; it does not accept alternative formatted-but-textless documents as locked wire.

The author regression creates and locks a real local note before sync opt-in, bootstraps its raw sealed wire, checks required_blobs, receives and applies it successfully, then rejects modified drawing/text/horizontal-rule/attachment documents through both required_blobs and receive, asserting the Store generation and inbox stay unchanged. Existing sealed conflicts, lock-before-flush, replay, restart, local unlock and raw-wire tests also ran in the complete suite.

Only the three independently confirmed old export fixtures were adjusted. `store::tests::archive_attachments_and_cycle_guards` now opens its source Store under `temp/data`, leaving its backup at the outer temp directory. The two recorded_at archive tests use a small setup_in(Some("data")) helper; all other recorded_at tests still use their exact original root via setup_in(None). All existing assertions and tested APIs remain. No production archive validation/export contract changed.

`scripts/sync84/build.rs` dynamically resolves the real `src-tauri` directory and supplies it as compile-time CARGO_MANIFEST_DIR for the existing Session fixture lookup. The original ciphertext fixture and its Session test were not modified. No copied/fabricated fixture was added.

## Exact frozen-source verification

Both commands ran from `/private/tmp/apple-notes-sync84` with `CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target`. They ran sequentially, once each after the source freeze, offline with locked dependencies.

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path docs/verification/sync84-core-independent-01/runner/Cargo.toml locked_wire_must_reject_unencrypted_drawing_body -- --exact independent::locked_wire_must_reject_unencrypted_drawing_body
```

Natural exit **0**, **1 passed / 0 failed / 120 filtered**, 3.48203182220459 seconds wall time. This is the exact unchanged independent regression that originally failed with accepted `durable:true` drawing wire. Independent test file SHA-256 remains `e72f60614b5702b119b6cb8ba3da97d7d1f44ec46b8922c9e7a41783062ef159`.

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path scripts/sync84/Cargo.toml --no-fail-fast
```

Natural exit **0**, **109 passed / 0 failed / 3 ignored / 0 filtered** of 112 unit tests, 8.261433124542236 seconds wall time and 4.77 seconds test execution. Doc tests also naturally passed (zero doc tests). The three ignored tests are existing subprocess worker entry points; their parent crash scenarios execute in this suite. The three archive tests and the original frozen_ciphertexts Session test now pass in this complete unfiltered run. No second full run was used to obtain these results.

Raw stdout, stderr, actual command arrays, natural exit codes and wall times are stored beside this README. `source-fingerprint.json` records the exact source commit/tree and SHA-256/length of the full production Rust source, Cargo manifest/lock and lean runner including build.rs. `original-evidence-preserved.json` compares the original failed full-lean, independent compile/green, and locked-drawing logs/status and provenance evidence with `a0a2600c`; all are byte-identical. The independent regression file is byte-identical as well. Raw stdout terminal blank lines remain unchanged rather than being stripped to satisfy whitespace checks.

No 85/86/mainline/device/original Notes/microphone/network/Tauri package operation, merge, push, or worktree creation/removal was performed. This pass is scoped to the Store/Session core and harness fixture repairs, not complete synchronization release acceptance.
