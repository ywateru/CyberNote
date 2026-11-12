# MEDIA105 formal run1 — stopped at source association

Outcome: **both sides stopped failclosed; formal paired coverage/performance acceptance is incomplete**. This is a measurement source-association failure, not evidence of a product defect. No threshold/tool/product change or repeat run was made. No warm, long-media activation/seek or full50-SVG ROI analysis completed.

The parent-authorized single pair ran baseline then after with the accepted tools, existing pinned host/frontend artifacts, Chrome157.0.8103.40, viewport1440×1000 and the same frozen503 originals/SQLite. Pre/post source/fixture/Chrome identity checks passed. The historical baseline artifact binding limitation remains in each configuration. Both processes exited1 and all owned host/Chrome PIDs were absent at the final process check.

| Side | Raster decoded /450 | TextSVG decoded /50 | Unvisited total | Stop |
| --- | ---: | ---: | ---: | --- |
| Baseline |386|50|64|cold first pass, scrollTop31150|
| After |5|19|476|cold first pass, scrollTop890|

Both have0 page errors,0 recorded explicit image errors and0 viewport timeouts. Counts are historical visible current-source decode+2rAF observations, not simultaneous resident images. The unequal partial workloads cannot establish a memory/timing improvement. Startup phases completed (baseline721ms, after1689ms); partial cold phases have no completed phase wall. Raw sampled spans and separate partial RSS are retained without presenting them as equal-coverage comparisons.

Both stopped through `formalPhases105 → traverse → scroll105 → onStep → join`, at `coverage105.mjs`'s `assert(card,'105 source has no current card')`. `join` obtains `snapshot()` and then `urls()` in two separate awaited browser evaluations. It asserts card membership before its visible-only filter. `urls()` enumerates current DOM gallery image nodes; it does not enumerate the complete historical source map. Thus an unused historical source-map entry has not been shown to cause the failure. An intervening offscreen source/mount change is possible, but the exact offending source/ID is **unknown**: the assertion did not serialize it or the URL-enumeration result.

The retained final snapshot contains16 visible cards on each side, all with resolved sources and successful joins. Four baseline and three after current-but-unjoined images are all offscreen/prefetch, with pending observer decode; their current source, previous recorded state and exact recent load/grant events are preserved in `failure-evidence.json`. This supports examining an observation boundary, but does not identify the exact assertion operand or prove a visible source was missing.

After captured22 actual480px SVG HTTP bodies; only19 matched the decoded-source linkage set. The existing50-required gate rejected analysis before executing the companion. These bodies are raw evidence, not a completed50-SVG ROI claim. No source/src/load/play injection, backend image generation or fixture copy was added.

Raw and reproducible summary: `artifacts/media105-formal-run1/{baseline,after}` and `failure-evidence.json`. Each side retains configuration/tool hashes, coverage JSONL, ledger, source links, network rows, partial phases, last viewport, failure screenshot and result. The summary includes per-file SHA256, the final source-state evidence, null incomplete-phase wall, partial RSS scope, fixture/source checks and owned PID exit checks. Runner stdout/stderr is in the two adjacent `*-runner.log` files. Original failed files remain unchanged. Further correction or execution requires a separate parent gate and independent review.
