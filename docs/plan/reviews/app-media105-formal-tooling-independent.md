# MEDIA105 formal tooling independent review

Decision: **rejected pending one narrow correction (F1)**. This review covers the frozen seven-tool patch, not execution or functional coverage of the formal 500-image/long-media protocol. Tools are released to the author for correction. No browser, companion, host/frontend build, device or formal run was started by this review.

## F1: supplementary visits repeat the whole gallery without a target bound

`scripts/performance/coverage105-formal.mjs:67` calculates the never-visited IDs and stores `supplementAllowed`, but then calls the same `traverse('gallery-cold-supplement')` used for the full first and warm passes. `traverse` supplies no target IDs or termination predicate to `scroll105`. That helper always traverses down to the actual bottom and back to the top. Thus even one never-visited target near the top triggers another full down/up visit, including previously visited failures. Filtering the ledger's credited supplementary results does not restrict this actual workload.

The fixed protocol allows continuous steps through previously visited cards on the route to a never-visited target. It does not allow an additional complete pass beyond the final target and back to the top without a target. This branch currently records and measures precisely that extra pass while the README calls it an only-never-visited supplement.

Independent pure reproduction imported the exact frozen `formalPhases105` and ledger. The first-pass fixture visits a0–a498, with an explicit error at a0, leaving only a499 as a supplementary target. The supplied deterministic scrolling double models a target at position 1 and the helper's normal whole-gallery route: position 0/a0 → 1/a499 → 2/a1 → 1/a499 → 0/a0. The formal function passes no target bound and consumes the complete route after reaching a499. The old error remains an error, confirming that the issue is unnecessary real visits, rather than ledger retry credit. Source inspection of the actual shared helper confirms the unconditional bottom/top traversal. Raw reproduction: `artifacts/media105-formal-independent/negative-ledger-paths.json`.

Required correction: drive the one supplementary audit by the frozen never-visited target set in deterministic DOM order, retaining the same continuous half-viewport steps and readiness barrier while routing to targets. Stop supplementary traversal after the last target has received its terminal audit; do not add an unrequested complete tail/down/up pass or treat old failures as targets. Preserve original first-pass errors/timeouts and separate supplementary costs. Recheck a target near the top and multiple targets, including old failing cards crossed on the route. No new browser/formal execution is needed to prove this control-flow correction.

## Completed independent checks

- Reconstructed the patch byte for byte from the preserved before files and seven final files. SHA256 is `115533d4c551062c993b882444fbfbc890ccffd3fe52b1248425d767e8ae3ad1`; all before/after hashes match `frozen-tools.json`. The harness builder remains unchanged. Scope record: `artifacts/media105-formal-independent/scope.json`.
- Ran the current eight pure checks and fourteen source-extracted complete-finally fault cases; all passed. The existing F1 exception-safety correction remains in place. Logs: `pure.json`, `cleanup.json`, `cleanup.log` in that evidence directory. These cover thrown/rejected operations, not indefinitely hanging browser/CDP operations.
- The formal ledger separates the 500 image IDs from posters/media, retains errors and timeouts, and only credits supplementary success for IDs in the frozen never set. First timeout propagates through traversal and stops the side. Warm requires all 500 historical cold-coverage rows decoded and checks its own visited/error/timeout/decode results. Actual current-source readiness remains enforced by the shared settled-viewport helper, whose source identity and two-frame requirements remain unchanged.
- Phase summaries keep runtime deltas unavailable on baseline as null, retain the separate process memory scopes, and report dwell/wait/motion/decode costs without adding overlapping costs. The long-media code records the frozen baseline native-video focus+Space versus after product-button difference, enforces after's zero prior original acquisitions, checks actual time progress, and only then performs the fixed seek/resume. Long-media behavior itself was not executed here.
- The ROI companion binds the exact production `svg_text.rs` by absolute path and the unique accepted font. Independently checked every existing companion input hash, its actual binary SHA, product identity metadata and the unchanged font source; all matched. `companion-source-check.json` records this. No companion execution or rebuild was performed.

## Read-only recomputation of existing actual-App geometry evidence

Recomputed from raw samples and scroll rows, rather than relying on the author summary:

| Side | Distinct visible decoded IDs | Nonzero scroll moves | Maximum scrollTop |
| --- | ---: | ---: | ---: |
| Baseline | 15 | 12 | 310 |
| After | 15 | 18 | 336 |

Both used 1440×420 and all actual moves satisfied the half-viewport bound. These are successful small scrolling galleries, not a 500-ID geometry result.

For all five after SVG captures, independently read the actual captured PNG, decoded RGBA with Pillow, checked 480×360 dimensions and recomputed both PNG and RGBA SHA256. Each matched its reported reference hash. Rejoined capture request/capability/attachment/pixels to the successful network row and unique actual IPC/source link. The actual response chain is intact and uses CDP's existing completed response body, without an additional fetch. The reference report records full-frame equality, 411–417 changed text pixels and zero changes outside the declared ROI. This review verified report/input identity and actual-image hashes; it did not regenerate the no-text reference or independently recompute its pixel difference. Raw recomputation and that limit: `raw-recompute.json`.

The original 160px capture failure remains in `artifacts/media105-formal-geometry-author/after/result.json`. The final filter admits only the real 480px thumbnail grant; the five successful captures are in the separately retained after-fix run.

## Clarified non-finding and remaining limits

A pure ledger probe showed historical decoded-source coverage remains after a new visible mount/source is pending. This alone is **not a blocker**: offscreen source retirement must not erase legitimate historical coverage or require 500 images to remain resident. Following the actual call chain did not establish that this history bypasses `settle105` for the new visible source; the warm traversal invokes the same current-source barrier again. The evidence JSON explicitly records this interpretation. No correction to historical coverage semantics is requested from that probe.

Formal fixed-phase runtime, all 500 per-ID source/HTTP/decode links, all 50 actual SVG references, first/supplementary coverage, final phase memory and long-media outcomes remain unexecuted. Existing geometry runs do not cover those claims. The new pending-capture/CDP wait also has no independent hang test in this bounded review; cleanup fault acceptance remains limited to exceptions/rejections. After F1 is frozen, re-review only the routing correction and necessary pure boundaries before a separate parent execution gate.
