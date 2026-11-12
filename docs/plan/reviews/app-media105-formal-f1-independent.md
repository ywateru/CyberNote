# MEDIA105 formal F1 narrow re-review

Decision: **target-limited supplement corrected; one directly related integration blocker remains**. Tools are released for one narrow correction. No browser, build, companion, formal or device run was performed. Previous review conclusions outside this routing change remain in force.

## Verified correction

The four-file before/after patch reconstructs exactly to SHA256 `5bb82fc14f99da8c2f1bbd116835bab525522ce90f0ee831a0b5357b9c70245e`. All frozen hashes match. Independently ran the nine pure groups, including seven target-routing cases; all passed. Evidence: `artifacts/media105-formal-f1-independent/scope.json` and `pure.json`.

`formalPhases105` now derives targets solely from the frozen never-visited set, ordered by the actual DOM, and supplies those targets to the shared scroll helper. The helper keeps the existing settled-viewport barrier and half-viewport movement, checks target presence/reachability, and returns immediately once the last target is terminal. It does not credit prior errors as supplementary targets. Empty targets do no extra work. This closes the original unnecessary target-free tail and return pass.

## Remaining integration blocker: successful supplement leaves warm origin mid-gallery

At `scripts/performance/coverage105-formal.mjs:68`, when supplementary targets all succeed, the code immediately begins `gallery-warm-pass` and invokes the ordinary down/up helper. The target-limited supplementary helper now correctly returns at the last target, which may have a nonzero scrollTop. There is no top-origin preparation between these calls. The warm pass consequently starts mid-gallery, rather than at the actual top=0 specified in the fixed protocol.

The author's added real-formal missing-target case also gives a0 an error, which skips warm and therefore does not test this success branch. An independent pure test imported the exact current `formalPhases105`, supplied 499 successful first-pass IDs and one successful supplemental target, and recorded the actual call chain:

| Actual call | Starting scrollTop |
| --- | ---: |
| First cold pass | 0 |
| Target-limited supplement (`a499` only) | 0 |
| Warm pass, after the supplement returns at 250 | **250** |

`allColdDecoded()` was true and the warm branch executed, so this is not an unreachable error-only branch. The deterministic routing double sets only the supplementary return position; the actual imported formal function controls the phase sequence. Raw: `artifacts/media105-formal-f1-independent/warm-origin.json`.

Required narrow correction, confirmed by the parent: if the completed supplement leaves a nonzero position, return to the actual top with the same continuous ≤0.5H movement and current-source settle barrier. Record that preparation's route/wall/IO separately using the existing phase/row mechanism; do not silently append it to supplementary target work, jump scrollTop, or hide its costs. Then start the full warm down/up pass at 0. A pure successful supplement→preparation→warm case must prove that origin and visible accounting; a no-supplement/already-top case must avoid unnecessary preparation. Do not expand into another browser or formal run.
