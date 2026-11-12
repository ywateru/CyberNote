# MEDIA99M formal after-run1 — independent raw-data audit

**Verdict: ACCEPT for the formal measurement record and its stated comparison limits. No blocking data-integrity finding.** This does not accept all MEDIA99 product requirements, equal-function image performance, or FINAL101 native delivery. Reviewed author range `1507d66a152ac2ac9838d2bcd37791449135a370..1e3d3e398c2d1555987e93b6a8f462eb82613714`; accepted precise-tooling `9bc41475` was not reopened as a product-source review.

The eight-file author delta is confined to measurement tooling and documents. No product inputs, old99P runner/probes, frozen samples, baseline trace, author report, or user library were modified by this audit. No performance run, browser/harness process, original-media rescan, compilation, native App or ADB was performed. This review only adds the independent report, probes and small result JSON files under `docs/plan/reviews/`.

## Independent method and reproducibility

Run from the accepted snapshot in `/private/tmp/cybernote-delivery`:

```sh
python3 docs/plan/reviews/app-media-after99m-probe.py
node docs/plan/reviews/app-media-after99m-gate-probe.mjs
```

The Python probe reads raw `phases.json`, `memory.jsonl`, `media.jsonl`, `media.jsonl.ipc`, `network.json`, three media JSONs, and frozen metadata. It imports neither the author's metrics/delta nor population/report helpers. It reconstructs all20 before/after phase metrics, quantiles using the recorded floor-index convention, task totals, independent Node/Rust/renderer/Chrome RSS and JS heap, retention labels and process-role RSS sums. Every value is checked against both raw `result.json` and the published small comparison JSON. Raw evidence SHA256 values, including IPC, runner and screenshots, are retained in `app-media-after99m-result.json`.

949 completed wrapper calls pair with all1898 IPC start/end events; command, phase and outcome match. The21 actual `perf_metrics` observations contain the phase boundary snapshots. Their monotonic deltas telescope without unaccounted counter gaps. Independently, first successful `(attachmentId,pixels)` keys reconstruct generation, repeated successful keys reconstruct cache hits, and failed thumbnail requests reconstruct attempts. Frozen original sizes supply logical attempt input; first successful grant sizes supply encoded output. This reconstruction matches each of10 phases and the overall counters, rather than only accepting the author's total.

The gate probe exercises the real accepted root/provider/hash validation, then injects only the `sourceIdentity` port in an in-memory gate copy for negative equality tests while retaining the real Git ancestry command. Exact fingerprint with an unrelated tiny Git history is rejected (the expected Git diagnostic is not a review failure). Wrong fingerprint,434-input inventory drift, provider provenance, and formal101ms cadence are rejected; the cadence error precedes fixture/build reads or output creation. All17 required counter/gauge fields reject absent/null/negative/nonfinite/unsafe/string inputs; all11 monotonic counters reject regression. Unknown precise stats are not converted to0. No gate source is patched on disk.

The author's pure `report-media-after.mjs` was additionally run into a fresh small output and its JSON exactly matches the committed comparison file. This is a secondary repeatability check; the independent Python reconstruction is the primary audit. Output: `artifacts/media99m-after-independent/author-recomputed.json` and `artifacts/media99m-after-independent-recompute.log`.

## Identity and comparability

The formal candidate gate requires accepted1507d66a ancestry **and** exact product fingerprint `4e143c3d8d459ce2f26a699c691ba58b188fc6b58a9e3838b1c8852422e8a904` /434inputs. Current accepted product passes; tools/docs dirty state does not substitute for this check. The saved frontend source metadata matches configuration. Measured-runner hash matches recorded run-media source; all recorded after-tool and harness source/binary hashes match. Native-provider binary SHA256 is `9052e06fbf175d5e7f0863ae56d67d40567a778e09cde9ee8b2d6f1780752322`; the formal runner verifies the production mechanically extracted Provider and exact Mac C source. The earlier accepted precise-provider boundary is not replaced by a fake source here.

Both saved configurations record Chrome156.0.8078.80,1440×1000,100ms/0.8viewport scroll,103notes and503 originals totaling715371216B. Both actual frozen frontend bundles wrap App in React.StrictMode. The small manifest/map/SQLite files were SHA-checked directly during this audit:

- Manifest: `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`.
- Map: `7e2e17411a078e0d38b9819ec2c8f2efe41968303d89ed59963100ca5f61f27c`.
- SQLite: `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`.

The map gives503 samples/715371216B, and both Store configurations record503 hardlinks/0 new original bytes. Original per-file bytes were not rescanned by this review: the saved pre/post integrity objects and reviewed stream-hashing function record that check, and the frozen baseline remains unchanged. Historical baseline source remains84f2c896/2f77b076/372inputs; its saved identity is not recomputed against newer product code. Before/after environments are single mixed runs, OS page cache was not evicted, and disk/host pressure differ. These are not repeated statistical estimates or equivalent workloads.

## Recomputed phase accounting

HTTP counters below are actual production runtime source-read observations, not physical decoder/OS IO. Baseline IPC bytes are reconstructed from1917 actual completed `read_attachment` events totaling2608262764B and covering all503 IDs. No legacy read appears in the after raw wrapper or IPC traces.

| Phase | Wall ms before→after | Original HTTP B | Thumbnail HTTP B | Attempts / gen / hit | Logical input B / encoded output B |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-cold | 1418→1491 | 0 | 107962 | 17 / 2 / 0 | 3222064 / 107962 |
| startup-hot | 1512→1392 | 0 | 107962 | 15 / 0 / 2 | 662931 / 0 |
| gallery-open | 1323→1458 | 0 | 2696118 | 16 / 5 / 0 | 10382129 / 2696118 |
| gallery-scroll-1 | 13309→13571 | 0 | 12719138 | 173 / 94 / 43 | 97578533 / 56235938 |
| gallery-scroll-2 | 13862→13516 | 0 | 42610216 | 148 / 70 / 128 | 72813437 / 42359341 |
| gallery-leave | 2253→2045 | 0 | 107962 | 15 / 0 / 2 | 662931 / 0 |
| audio-90min | 61224→1965 | 9109504 | 0 | 0 / 0 / 0 | 0 / 0 |
| video-faststart | 15072→1944 | 29383269 | 0 | 1 / 1 / 0 | 96754277 / 121197 |
| video-tail | 9589→1982 | 29635786 | 0 | 1 / 1 / 0 | 96754277 / 121197 |
| final-leave | 2719→2604 | 0 | 9163545 | 5 / 5 / 0 | 9895907 / 14798561 |

Totals match: original68128559B/1041reads,thumbnail67512903B/1090reads,total135641462B/2131reads,391attempts,178generation,175hits,388726486B logical input and116440314B encoded output. Peak read block65536B. These byte quantities must not be added together as physical IO. Six canceled HTTP events have unknown encoded lengths and remain unknown. The seven unmapped image/svg+xml/encoded0 events remain unattributed; no managed-file transfer is invented from them.

All rAF counts,p50/p95/max,long-task counts/totals/max and separate memory peaks match raw result/report exactly. Detailed unrounded values and natural/forced-GC retention rows are in the independent JSON; absence stays null/missing. For example gallery-scroll-1 renderer peak is1500.1→715.5MiB, Rust33.8→55.0MiB and Node188.2→178.0MiB. Gallery-scroll-2 is1643.8→781.0MiB renderer,372.5→56.3MiB Rust,1282.7→194.5MiB Node. These remain separate process measurements. They describe the observed mixed workload and retained prior work; no combined “App RSS” or equal450-raster decoding victory is inferred.

## Real activation and long-media observations

The preserved runner uses actual product buttons (`播放` and filename-bearing `播放视频 …`) followed by current-element metadata polling. No `src` assignment, `setAttribute(src)` or `load()` exists in the runner. No initial programmatic `play()` repairs a product failure: actual automatic progression is checked before the later seek routine, whose pause/currentTime/play is explicitly the90% seek operation. Each media has0 original acquires before activation and exactly1 afterward in both media JSON and the raw ID/phase trace.

| Media | Metadata field ms | Full duration s | Seek target→actual advanced s | Rear-seek field ms |
| --- | ---: | ---: | ---: | ---: |
| audio-90min | 474 | 5400 | 4860→4860.34306 | 416 |
| video-faststart | 426 | 96 | 86.4→86.734117 | 436 |
| video-tail | 416 | 96 | 86.4→86.768145 | 484 |

All three have playing=true, actual time advancement, seek error=null and ok=true. Both original video screenshots show the test pattern around1:26 of1:36; WAV screenshot shows90:00 and the seek track near90%. Screenshots corroborate rendered state; the JSON/runner supplies the time-progression proof. The raw firstPlayMs301/302 fields are ~300ms observation windows, not measured first-frame latency. MetadataMs begins before semantic note navigation/activation; it is not isolated decoder or click-to-metadata latency. Baseline WAV's original60s/no-src failure is retained, not repaired or erased. Formal after has0 runner/media/page failures across10 completed phases.

## Limits carried forward — not waived by this acceptance

- Only169/450 raster IDs succeeded at backend acquire;281 never reached it. Frontend bounded queue withdrawal is consistent with this, but per-item withdrawal causes were not logged. Do not claim all281 were proven withdrawals, or all450 images reachedready.
- All50 textSVG IDs failed `unsupported_media` over213 thumbnail requests. The baseline had all503 original IDs, including SVG. Mixed-run RSS is not an equal-function450-raster-only comparison.
- Second scroll has70 new generations and148 attempts despite128 hits. It is partial cache reuse, not a fully warmed gallery or zero re-decoding result. Warm-reload2hits/0generation is a narrower observation.
- Gallery settled snapshots have10 image nodes/5loaded/5visibleLoaded. Total visible-card readiness was not recorded; no all-visible-ready claim is accepted.
- Final phase intentionally keeps a note open:6 leases/0 streams,7 image nodes/4loaded/3visibleLoaded. The5 new1024px acquisitions do not form a complete remaining-owner inventory. Release rows lack lease identities, so neither “all legitimate retain” nor “leak” is established.
- Seven unmapped zero-encoded SVG network events remain unknown; six canceled encoded lengths remain unknown. Source-read bytes, attempt logical input, published PNG output and network encoded bytes are distinct.
- Cold is new owned process/cache, not cold physical disk. Natural retention and forced-GC diagnostics stay separate. Chrome renderer/Rust/Node/debug overhead is not Mac Tauri/Android RSS; native packages, ATS/cleartext, actual devices and production-release behavior remain FINAL101.

These are evidence/functional coverage limitations of the measured workload, not hidden zero-filled successes. The scoped raw-data audit is accepted; product coverage gaps and broader99/101 acceptance remain open for the parent to track.
