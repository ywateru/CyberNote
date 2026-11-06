# APP-SYNC84 independent review

Current conclusion: **pass**, after the scoped independent re-review on 2026-11-06 of product fix `7da43718bc96fbf3d7a5e577aa65d2b5b3807307`, author evidence `72936017c966c1962831245d87f8e86270fe90d8`. Re-review evidence: [sync84-locked-wire-independent-02](../../verification/sync84-locked-wire-independent-02/README.md).

The initial review below examined source `d484ab95e73c16794aceee96401e711874fcb40e` and author evidence `e69d7a7c3321aaba97ee883699fea0543fbdf042`; its original failures remain in [sync84-core-independent-01](../../verification/sync84-core-independent-01/README.md).

## Findings

1. **P2 — resolved by 7da43718 and independently reverified: locked wire previously accepted plaintext drawing content and returned a durable receipt.** The [raw locked wire contract](../../architecture/sync.md#wire模型) requires an empty document, empty plainText and sealed. In `src-tauri/src/store/synchronization/validation.rs:83` and `:110`, `note_payload` checks sealed field names but delegates body consistency to the archive graph validator. That validator at `src-tauri/src/store/archive.rs:377` only rejects nonempty `plainText` or `doc_text(document)`. Valid drawing nodes hold visual content in `attrs.strokes` and have no text, so this check accepts a nonempty plaintext body. `sync_receive` then writes the full wire into `sync_inbox` and returns `durable: true` at `src-tauri/src/store/synchronization.rs:528` and `:563`.

   The independent regression `runner/independent.rs::locked_wire_must_reject_unencrypted_drawing_body` creates a note, calls the actual production `lockNote`, takes its sealed wire, changes only its raw document to a valid drawing and seals the digest again. The production receiver returned `Ok(SyncApplyReport { durable: true, applied: false, pending: 1, ... })`. `locked-drawing01.status.json` records natural exit 101 and stdout preserves the failing rejection assertion. This is a validation-boundary failure for an incoming locked envelope; it is not evidence that ordinary local `lockNote` itself emits plaintext. Reject nonempty locked raw content at the synchronization wire boundary, including non-text nodes, before descriptor/frontier/inbox state or a durable ACK can change. Keep legitimate empty sealed versions accepted. Reverify the deterministic regression and the affected sealed/lock/receive paths after the author fixes it.

No other blocking finding was confirmed in the completed review scope. Broader source inspection and actual Store verification are described in the evidence README.

## Initial regression evidence and limitations

The complete unmodified lean suite result remains **104 passed / 4 failed / 3 ignored (111), exit 101**. One missing ciphertext fixture comes from the lean manifest's `CARGO_MANIFEST_DIR`; the exact original Session test passes with the independent runner's corrected compile-time path. The three archive failures export inside the application data root against a pre-existing explicit rejection rule. Both those tests and the responsible archive/data-management files are byte-identical to baseline `f4caa90e`, proven in `old-test-provenance.json`.

The independent runner imports frozen production modules through relative symlinks, changes no product/test source, and keeps those three invalid export fixtures explicitly filtered. A separate actual run passed **113 / 0 failed / 3 ignored / 3 filtered (119), exit 0**: 105 unchanged production tests plus eight independent actual Store scenarios, including three legal external-path archive equivalents. This run predates addition of the ninth drawing regression. The new drawing regression ran separately and failed as described above; there is no claim that the final 120-test tree is green. The initial independent runner compilation errors are also retained in `independent01.*`.

Before and after review, all 39 frozen fingerprint files matched the author's SHA-256 and byte lengths. Product files were not edited. Tests use synthetic temporary Store databases and the existing lean target; no device, microphone, real-note, network/tunnel, full Tauri application build or Session/UI barrier claim is made. Review did not merge or push.

## Scoped re-review of 7da43718

The production logic change is limited to `src-tauri/src/store/synchronization/validation.rs:89`: locked raw documents must equal the complete canonical `empty_doc()` emitted by production lockNote, plainText must be empty, and sealed must exist. It runs before attachment registration, frontier/inbox writes and durable receipt. Exact JSON equality covers non-text node content and arbitrary attributes as well as text. Existing sealed field/graph validation still runs. There is no weakening of the lock or archive contract.

The added author scenario proves a legitimate note locked before opt-in bootstraps and passes required_blobs, receive and apply. It then rejects drawing, text, horizontal rule and media body substitutions through required_blobs and receive, asserting generation and inbox remain unchanged. The original independent drawing regression file is byte-identical to the failing review version, SHA-256 `e72f60614b5702b119b6cb8ba3da97d7d1f44ec46b8922c9e7a41783062ef159`; it now passes in the independent full run.

Fixture changes are confined to moving the source Store below `temp/data` in the three identified export tests and supplying the actual src-tauri manifest root in `scripts/sync84/build.rs`. Existing archive assertions and APIs are unchanged. Other recorded_at tests retain their original root using `setup_in(None)`; the Session fixture test and ciphertext files are unchanged. No production archive or export behavior changed.

The independent verifier ran the complete runner once, without skips or test-name filters: natural exit **0**, **118 passed / 0 failed / 3 ignored / 0 filtered (121)**, 9.955164292 seconds wall time, 5.00 seconds test time. This includes all 112 production Store/Session tests plus the nine independent tests. The three ignored cases are existing subprocess worker entry points covered by their parent crash tests. The previous three export failures and the original Session ciphertext test pass in this run. There is no green-only retry or second full run.

All 40 source fingerprint entries match the new author freeze before and after the run. All 12 original raw log/status files and the original independent regression source remain byte-identical to `a0a2600c`; the first blocked review and its failure evidence remain historically valid. This re-review changed only review/evidence files, and did not edit product, tests or runner.

## Conclusion

**pass** for APP-SYNC84 Store core at source `7da43718`, combining the completed initial code review with this scoped fix/fixture re-review. Finding 1 is closed; no open blocking finding remains in that scope. This does not establish real networking/Noise pairing, Session/UI application barriers, Android or desktop runtime/package acceptance, or complete synchronization release delivery.
