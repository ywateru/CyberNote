# APP-SYNC84 independent review

Review date: 2026-11-06. Product source: `d484ab95e73c16794aceee96401e711874fcb40e`. Author evidence: `e69d7a7c3321aaba97ee883699fea0543fbdf042`. Independent evidence: [sync84-core-independent-01](../../verification/sync84-core-independent-01/README.md).

## Findings

1. **P2 — blocking: locked wire accepts plaintext drawing content and returns a durable receipt.** The [raw locked wire contract](../../architecture/sync.md#wire模型) requires an empty document, empty plainText and sealed. In `src-tauri/src/store/synchronization/validation.rs:83` and `:110`, `note_payload` checks sealed field names but delegates body consistency to the archive graph validator. That validator at `src-tauri/src/store/archive.rs:377` only rejects nonempty `plainText` or `doc_text(document)`. Valid drawing nodes hold visual content in `attrs.strokes` and have no text, so this check accepts a nonempty plaintext body. `sync_receive` then writes the full wire into `sync_inbox` and returns `durable: true` at `src-tauri/src/store/synchronization.rs:528` and `:563`.

   The independent regression `runner/independent.rs::locked_wire_must_reject_unencrypted_drawing_body` creates a note, calls the actual production `lockNote`, takes its sealed wire, changes only its raw document to a valid drawing and seals the digest again. The production receiver returned `Ok(SyncApplyReport { durable: true, applied: false, pending: 1, ... })`. `locked-drawing01.status.json` records natural exit 101 and stdout preserves the failing rejection assertion. This is a validation-boundary failure for an incoming locked envelope; it is not evidence that ordinary local `lockNote` itself emits plaintext. Reject nonempty locked raw content at the synchronization wire boundary, including non-text nodes, before descriptor/frontier/inbox state or a durable ACK can change. Keep legitimate empty sealed versions accepted. Reverify the deterministic regression and the affected sealed/lock/receive paths after the author fixes it.

No other blocking finding was confirmed in the completed review scope. Broader source inspection and actual Store verification are described in the evidence README.

## Regression evidence and limitations

The complete unmodified lean suite result remains **104 passed / 4 failed / 3 ignored (111), exit 101**. One missing ciphertext fixture comes from the lean manifest's `CARGO_MANIFEST_DIR`; the exact original Session test passes with the independent runner's corrected compile-time path. The three archive failures export inside the application data root against a pre-existing explicit rejection rule. Both those tests and the responsible archive/data-management files are byte-identical to baseline `f4caa90e`, proven in `old-test-provenance.json`.

The independent runner imports frozen production modules through relative symlinks, changes no product/test source, and keeps those three invalid export fixtures explicitly filtered. A separate actual run passed **113 / 0 failed / 3 ignored / 3 filtered (119), exit 0**: 105 unchanged production tests plus eight independent actual Store scenarios, including three legal external-path archive equivalents. This run predates addition of the ninth drawing regression. The new drawing regression ran separately and failed as described above; there is no claim that the final 120-test tree is green. The initial independent runner compilation errors are also retained in `independent01.*`.

Before and after review, all 39 frozen fingerprint files matched the author's SHA-256 and byte lengths. Product files were not edited. Tests use synthetic temporary Store databases and the existing lean target; no device, microphone, real-note, network/tunnel, full Tauri application build or Session/UI barrier claim is made. Review did not merge or push.

## Conclusion

**blocked**. APP-SYNC84 cannot pass its wire-validation delivery contract until finding 1 is fixed and independently reverified. The older four harness/test-fixture failures remain recorded separately and do not explain away this newly reproduced product defect.
