# MEDIA105 formal run1 independent failure review

Decision: **formal run failed closed; no complete-coverage or performance acceptance**. A measurement-observation coherence defect is independently reproducible. The exact offending source in run1 remains unknown because the failed join's two inputs were not saved. No product defect is established by this assertion. This was a read-only source/raw review with pure checks; no browser, build, companion, measurement, device or product change was performed. Review ownership is released; the parent decides any next correction/execution gate.

## What the assertion actually checks

The failure is `coverage105.mjs:174`, reached through formal first-pass traversal → shared scroll → settled-viewport `onStep` → `join(true)`. The join first awaits a browser `snapshot()`, then independently awaits `urls()`. It iterates the second result and looks for each source token in the first result. The `assert(card, '105 source has no current card')` executes **before** the `visibleOnly && !card.visible` filter.

`urls()` queries current document `.attachment-gallery-card img` elements. It does **not** enumerate the historical `sources` Map. The assertion is therefore not a requirement that every formerly created or retired source remain mounted. It does require that every current image found by the later DOM query, including offscreen/prefetch images, have existed with that source in an earlier separate observation. A render/load/source change between the awaited evaluations can violate that measurement assumption even when every actual visible card remains valid.

There is also a selector-scope difference (snapshot cards inside the gallery scroll root, URL query over the document). The retained run does not prove a second out-of-root gallery existed; this is a source boundary, not an asserted runtime cause.

## Independent controlled proof, without weakening source validation

Executed the exact source-extracted `join(true)` against deterministic observation/IPC doubles:

| Input condition | Actual outcome |
| --- | --- |
| Stable current visible source, exact successful IPC and frozen SHA | Pass |
| Same valid visible source; only the second observation adds an offscreen prefetch source | **Exact run1 assertion** |
| Same offscreen prefetch source present coherently in the first and second observations | Pass; offscreen source receives no visible credit |
| Historical source absent from the current DOM list | No assertion concerning that source |
| Current visible source marked unmapped | Reject |
| Current visible source missing its actual IPC | Reject |

The visible card was unchanged in the false-failure case. This proves a narrow tool failure mode, not that run1 necessarily took that exact interleaving. Evidence: `artifacts/media105-formal-run1-independent/join-boundary.json`, which includes the tested source SHA and current product identity.

## What the retained run1 evidence can and cannot identify

The last logged sample, partial source-link records, final observation and teardown viewport show:

- Both sides end with 16 actual visible current images resolved and already source-linked. The final viewport is later than the failed join and cannot reconstruct its exact input.
- Between the last recorded card state and final viewport, two prefetch images per side change from no source to a new current source. Both remain `visible=false, prefetch=true`. Baseline IDs are `fd7d1f00-2ea9-4296-88a0-9a6de78135b1` and `ddb85cca-307a-4bf3-973b-fae14e9d1235`; after IDs are `751b81e8-3976-4245-9491-0ef9827e76dc` and `aef021f0-70ae-478e-b981-2825efe6b1e1`. The final events contain their actual read/Blob/load or grant/load progression.
- These transitions are consistent with the independently proved split-observation/prefetch failure. They are candidates, not a unique attribution. Older already-present offscreen sources also remain without a visible source-link record, as expected from `join(true)` filtering.
- The assertion logs neither the offending token/attachment nor the join snapshot and URL list. Consequently the exact token, image/mount transition, visibility at assertion time and causal interleaving remain **unknown**. No later screenshot/frame record can uniquely supply those missing join inputs.

The result is properly described as an observation/association stop. It is not evidence that retired product sources are broken, and it is not evidence that a currently visible product image failed to load.

## Independent partial-result and cleanup checks

Recomputed from `ledger.json`, samples, source links and actual captured-response metadata:

| Side | Decoded raster | Decoded text SVG | Unvisited | Final visible resolved and source-linked |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 386 | 50 | 64 | 16 |
| After | 5 | 19 | 476 | 16 |

Both sides stop during the first cold traversal. There is no completed warm phase or long-media test. The ledger has no explicit-error or timeout status, and both `pageErrors` arrays are empty; that absence does not turn unvisited IDs into product successes.

After retained 22 actual SVG HTTP response bodies. Only 19 bodies join the decoded-source chain; the 50-reference gate correctly rejects before invoking the companion. No ROI analysis output/request was created. The remaining bodies cannot be counted as decoded coverage, and the 19 admitted bodies are not a 50-SVG acceptance.

Current bytes of all 13 run-pinned tools match each side's configuration. Each recorded post-run fixture result equals its recorded pre-run result (manifest/map/SQLite SHA, 503 originals, 715,371,216 bytes); result `sourceUnchanged` is true, and current product identity is still the accepted a5b783…/445-input identity. This review compared the existing streamed pre/post evidence rather than rehashing the 715 MB fixture again.

Independently queried the four recorded host/Chrome root PIDs after completion: 10006/10012 and 12925/12926 are absent. Neither result contains an additional cleanup failure. Root-PID absence is the direct process evidence checked here, not a new aggregate census of all historical Chrome descendants. End free space was about 39.45 GB. Recomputed evidence: `artifacts/media105-formal-run1-independent/raw-check.json`.

## Minimal correction boundary for the parent to consider

Capture the current card, image/mount/source identity, visibility, link metadata and ephemeral URL in one synchronous browser observation of the same gallery/card set. Construct Node-side source joins from that coherent tuple, applying the visible-only scope within that observation. Keep raw capability URLs ephemeral and retain the exact successful actual IPC, frozen original SHA or real grant/owner/purpose/HTTP checks. A new or retired offscreen image outside that observation must not invalidate its visible tuples.

Do not simply suppress the assertion, skip genuinely unmapped visible sources, guess by bytes/order, retry until a join happens to pass, or backfill coverage from unassociated HTTP bodies. Necessary pure boundaries are the reproduced asynchronous prefetch case, a genuinely invalid current visible tuple, missing/nonunique IPC and owner/source mismatch. On a future association failure, retain the safe local source/card identity and which consistency check failed; do not record reusable capability URLs. This is a concrete narrow tool recommendation, not authorization to implement or rerun the benchmark.
