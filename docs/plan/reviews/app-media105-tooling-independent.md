# MEDIA105 representative tooling independent review

Decision: **blocked (F1), representative tooling only**. Reviewed the frozen five-tool patch SHA256 `91921d2116da1440392608caa4aa167108428d680676eab77ce7f368f24144cf` and the two author documents. This is neither a product acceptance nor authorization/results for the formal 500-image protocol.

## F1: evidence failure can prevent owned-resource cleanup

In `scripts/performance/coverage105.mjs`, `record` (line 152) throws after the 45-minute bound. The `finally` block writes `last-viewport.json` and calls `record(final-observation)` (lines 204–205) before closing any context, browser, browser server, HTTP server or Rust transport. Consequently the expected wall-limit failure throws again during final observation, bypassing every subsequent close. A disk/write failure in either of these evidence writes has the same consequence. This defeats the cleanup/low-disk stop contract and can leave owned processes and the listener alive without a result artifact.

Independent deterministic checks extracted the exact `record` declaration and exact cleanup prefix from the frozen source, then supplied resource doubles. Three cases—expired wall time, an ENOSPC-like append failure, and an ENOSPC-like last-viewport write failure—all threw before any of the four close doubles was called. No browser/native process was launched for these checks. Evidence: `artifacts/media105-independent-review/cleanup-boundary.json`, including the tested source SHA, inputs and actual call order.

Required correction: evidence and teardown must be isolated so failure of a snapshot, record, output, or one close cannot prevent the other owned resources from being closed. Preserve the original failure and best-effort result writing; do not use the wall-limited normal recorder as an unguarded prerequisite to teardown. The author owns this change. The one authorized independent real representative run is deferred until this correction is frozen.

## Verified scope and nonblocking findings

- Reconstructed the exact unified patch from the before copies and current five files; it matches the provided patch byte for byte. All before-copy hashes and the five current author hashes match. `media-candidate.mjs`, `run.mjs`, `browser-probes.mjs`, and `trace-transport.mjs` remain byte-identical to the before inventory. Evidence: `scope-check.json` and `cleanup-boundary.json` in the independent evidence directory.
- Current product fingerprint remains `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9`, 445 inputs. No product changes, builds, frontend rebuilds, device operations or baseline modifications were performed during this review.
- The new dispatch is restricted to `coverage105-smoke`; original 99M dispatch/gates remain below it unchanged. The baseline path, executable SHA and exact nine-file frontend inventory are fixed. The historical metadata-recovery limitation remains explicit. Chrome 157 executable/framework pins are separate from the old 156 gate and checked before/after; actual installed hash verification is deferred to the one real run.
- Baseline association uses the real returned `data` getter, native `atob`, same-turn Blob creation and actual `coverageCall` trace; frozen-original SHA is checked. After association uses the actual acquire receipt, matching source/card owner and grant URL lookup; HTTP evidence retains capability hashes without raw capability URLs. This is source review, not an independent successful live association claim yet.
- Decode readiness is scoped to the connected current image/source and two animation frames; stale results do not satisfy it. Error states settle the viewport but cannot satisfy the later expected decode-ID set. The source and author report correctly limit the smoke to three five-card galleries which all fit at scrollTop 0. It does not prove continuous 500-card traversal, full text-SVG ROI equivalence, long media or native UI behavior.

## Pending bounded re-review

Review only the F1 correction and necessary failure-path regression, then use the single paired representative smoke against the retained host/frontend artifacts. Do not expand this into a rebuild or formal measurement. The author smoke3 evidence remains author evidence; it is not relabeled as an independent rerun.
