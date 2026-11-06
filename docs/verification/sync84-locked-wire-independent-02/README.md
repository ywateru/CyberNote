# APP-SYNC84 locked-wire independent re-review

Date: 2026-11-06. Conclusion: **pass** for the Store core at product source `7da43718bc96fbf3d7a5e577aa65d2b5b3807307`, author evidence `72936017c966c1962831245d87f8e86270fe90d8`. The full initial independent review remains the basis for unchanged core behavior; this follow-up reviews only the locked-wire P2 fix and related test-fixture repairs. Current review: `docs/plan/reviews/app-sync84-core.md`.

## Scoped code review

The product behavior diff is eight added lines in `store/synchronization/validation.rs`. `note_payload` now rejects locked records unless the complete raw document equals canonical `empty_doc()`, plainText is empty and sealed is present. Whole-document equality rejects drawing strokes, other non-text nodes and unexpected attributes before any attachment descriptor/frontier/inbox registration or durable receipt. Valid canonical sealed raw wire retains its prior behavior, and existing sealed field/graph validation remains in force.

The author added one actual Store scenario that locks before opt-in, bootstraps, checks required_blobs, receives and applies the legitimate sealed version, then verifies drawing/text/horizontal-rule/attachment variants are rejected with unchanged generation and empty inbox. Existing independent test source was not edited.

The three old archive fixtures now open only their source Store under `temp/data`, leaving the archive in the outer temporary directory. Existing assertions and APIs are unchanged. The two recorded_at archive scenarios use `setup_in(Some("data"))`; all remaining recorded_at scenarios retain the old root via `setup_in(None)`. Production archive/export validation and behavior are unchanged. The new `scripts/sync84/build.rs` resolves the actual src-tauri path for compile-time fixture lookup; neither the Session ciphertext test nor its frozen fixtures changed. The README's selected-test count was updated for the newly added test. No unrelated product change was found in `a0a2600c..7da43718`.

## Independent complete run

From `/private/tmp/apple-notes-sync84`, once, with no filter or skip:

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path docs/verification/sync84-core-independent-01/runner/Cargo.toml --no-fail-fast
```

Natural exit **0**, **118 passed / 0 failed / 3 ignored / 0 filtered (121 unit tests)**. Wall time **9.955164292 seconds**, reported test time **5.00 seconds**. Zero doc tests also passed. `full-independent.status.json`, `.stdout` and `.stderr` preserve the exact actual command and raw outputs.

This run includes all 112 production Store/Session tests and all nine independent tests. The exact independent drawing regression that failed before the fix now passes, as do the new canonical sealed/negative-node author scenario, the three previously invalid export-path scenarios, the original frozen-ciphertext Session test, and existing lock/replay/WAL/conflict/Store crash coverage. The three ignored tests are existing subprocess worker entry points exercised by parent crash cases. No additional full run or green-only retry was performed.

The runner still compiles real production modules through the original relative symlinks. Its existing compile-time fixture root was already aligned by the initial independent review; no independent runner repair was needed in this follow-up.

## Frozen source and preserved failures

`source-before.json` and `source-after.json` recompute every one of the 40 entries in the new author source fingerprint, including the added lean build script. SHA-256 and byte lengths match the author freeze before and after the run.

`original-evidence-preserved-before.json` and `original-evidence-preserved-after.json` prove that the 12 original `full-lean`, `independent01`, `independent02`, and `locked-drawing01` raw log/status files and the original independent regression source are byte-identical to `a0a2600c`. The independent regression source SHA-256 remains `e72f60614b5702b119b6cb8ba3da97d7d1f44ec46b8922c9e7a41783062ef159`.

The initial 104-pass/4-fail/3-ignored result, the corrected-fixture 113-pass/3-filtered/3-ignored result, and the independently reproduced drawing failure retain their original meaning and bytes. They are historical evidence for their original frozen source. The current 121-test result is separately recorded here and does not rewrite those failures.

This follow-up changed only evidence and the review. It did not edit frozen product source, tests, manifests, locks, or independent runner. Authored Markdown/JSON passes the whitespace check; raw Cargo stdout preserves its extra terminal blank line. No mainline, merge, push, worktree lifecycle, device, microphone, original user-note, network/tunnel or Tauri package operation was performed. The pass is for the Store core; real network/Session UI barriers/device/package/release acceptance remain outside this evidence.
