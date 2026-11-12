# MEDIA105 formal run3 — author result, awaiting independent review

One authorized baseline→after pair ran on the accepted product fingerprint `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9` /445 inputs. Baseline exited **1** at the 90-minute audio time-advancement assertion; after exited **0** with all eight phases complete. Both sides completed the full cold and warm **450 raster +50 text SVG** image visits. This supports comparisons of those complete image phases; it does not establish success of both full long-media protocols. No retry, tool/product change, rebuild, direct initial play fallback, fixture copy or device action occurred.

The two preliminary launch checks failed before launching any host/browser: one ephemeral JavaScript parse error and one miscalled identity API. The corrected preflight passed before the unique measured pair. These were not measurement attempts.

## Frozen inputs and execution

- Run directory: `artifacts/media105-formal-run3`; preflight: `launch-preflight.json`. Original run1/run2 were preserved.
- Same Chrome **157.0.8103.40**, executable/framework SHA pins verified; same503 originals **715,371,216B**, frozen SQLite and1440×1000 viewport. Exact13 executed tools are retained in `tools-executed/`. Baseline retained artifact identity/provenance limitations remain as specified in the accepted baseline-artifact review; no historical full dirty source reconstruction is claimed.
- Baseline session60081 /runner40654 /host40707 /Chrome40712, exit1. After session72011 /runner63626 /host63672 /Chrome63675, exit0; ROI companion82506. Targeted ps and pgrep found all owned processes absent after completion.
- Launch free space **11,152,576,512B**; end baseline 10,855,043,072B, after 10,578,640,896B. No disk floor was reached.
- Fixed ≤0.5 viewport steps,500ms dwell,100ms sampled observations (not continuous visibility),30s viewport/45min side wall and original byte budgets remained unchanged. No supplement/warm-position phase was needed: first cold pass covered500 and ended at top0.

## Image coverage and complete comparable phases

Every cold and warm ledger has500 visited/decoded IDs,450 raster and50 SVG, zero image error/timeout rows. Historical decode coverage permits offscreen release; it does not claim500 concurrently retained sources. Current visible-source barriers still applied. Native videos501/502 are separate from the500 image denominator; their loadedmetadata/loadeddata at96s were observed on baseline cold/warm, without claiming full playback.

| Side / phase | Wall s | rAF p50/p95/max ms | Long tasks count/ms | Peak JS heap MiB | Peak renderer RSS MiB | Peak Rust RSS MiB | Peak Node RSS MiB |
|---|---:|---|---|---:|---:|---:|---:|
| baseline / startup-cold | 0.804 | 16.7 / 33.2 / 183.3 | 1 / 198 | 26.85 | 435.63 | 25.16 | 168.55 |
| baseline / gallery-cold-first-pass | 130.575 | 16.7 / 16.8 / 416.6 | 7 / 1118 | 293.88 | 1451.77 | 360.03 | 1322.50 |
| baseline / gallery-warm-pass | 137.999 | 16.7 / 16.8 / 466.7 | 5 / 1230 | 286.71 | 1641.78 | 360.30 | 1193.39 |
| baseline / gallery-leave | 1.384 | 16.7 / 33.3 / 133.3 | 2 / 204 | 65.26 | 1075.02 | 27.50 | 229.80 |
| baseline / audio-90min (incomplete) | incomplete | not finalized | not finalized | null | null | null | null |
| after / startup-cold | 1.165 | 16.7 / 16.8 / 266.7 | 1 / 286 | 18.92 | 392.09 | 44.92 | 197.63 |
| after / gallery-cold-first-pass | 137.557 | 16.7 / 16.8 / 266.7 | 2 / 397 | 73.65 | 996.91 | 77.06 | 255.58 |
| after / gallery-warm-pass | 123.244 | 16.7 / 33.4 / 33.5 | 0 / 0 | 73.56 | 971.36 | 77.13 | 453.91 |
| after / gallery-leave | 1.512 | 33.3 / 33.4 / 133.3 | 2 / 232 | 65.17 | 857.16 | 64.58 | 331.70 |
| after / audio-90min | 2.034 | 33.3 / 33.4 / 500.0 | 1 / 498 | 38.25 | 895.88 | 75.70 | 337.34 |
| after / video-faststart | 2.150 | 33.3 / 33.4 / 433.3 | 1 / 438 | 45.69 | 959.13 | 75.39 | 360.64 |
| after / video-tail | 1.817 | 33.3 / 33.4 / 400.0 | 1 / 430 | 46.33 | 1012.61 | 71.98 | 398.08 |
| after / final-leave | 1.632 | 33.3 / 33.4 / 366.6 | 1 / 377 | 51.36 | 1017.33 | 76.36 | 429.72 |

Cold after wall137.557s vs baseline130.575s; warm after123.244s vs baseline137.999s. After warm rAF p95 is33.4ms vs baseline16.8ms, so this run does not show a uniform smoothness improvement. Peak RSS/JS heap are sampled, separate processes, with no forced GC or OS cache eviction; Node includes bridge/observer overhead and must not be reported as product RSS. Startup readyAt baseline624.8ms /after708.2ms; first visible image baseline1810.5ms in gallery vs after568.4ms during startup, so those image events are not the same phase.

## Actual IO and cache metrics

Baseline lacks precise native metrics: **null**, not zero. Its real whole-original IPC returned2,268,996,581B /2,000 calls over its executed portion; cold1,040,392,427B /990calls and warm1,030,010,298B /974calls. These are original IPC bytes, not physical disk IO and not equivalent to after HTTP bytes.

| After phase | HTTP original bytes | HTTP derivative bytes | Generation attempts / success / hits | Registered generation logical input B | Published encoded PNG output B | End cache bytes / files |
|---|---:|---:|---|---:|---:|---|
| startup-cold | 0 | 44,647 | 2 / 2 / 0 | 1,930,539 | 62,173 | 62,173 / 2 |
| gallery-cold-first-pass | 0 | 541,197,731 | 567 / 567 / 428 | 644,656,499 | 281,104,492 | 267,943,315 / 491 |
| gallery-warm-pass | 0 | 538,106,686 | 74 / 74 / 900 | 233,014,325 | 13,714,123 | 267,943,315 / 491 |
| gallery-leave | 0 | 181,514 | 10 / 10 / 0 | 2,283,979 | 198,707 | 268,142,022 / 501 |
| audio-90min | 10,092,544 | 80,067 | 2 / 2 / 0 | 3,926,360 | 5,776,004 | 267,995,744 / 492 |
| video-faststart | 29,383,269 | 0 | 1 / 1 / 0 | 96,754,277 | 121,197 | 268,116,941 / 493 |
| video-tail | 29,635,786 | 0 | 1 / 1 / 0 | 96,754,277 | 121,197 | 268,238,138 / 494 |
| final-leave | 0 | 3,020,752 | 1 / 1 / 1 | 1,963,264 | 3,144,161 | 268,189,982 / 489 |

Final after cumulative: HTTP original **69,111,599B /1,056 read operations**; HTTP derivative **1,082,648,590B /17,614 operations**. Generation attempts/success **661/661**, hits **1,329**, registered generation logical input **1,082,044,709B**, published encoded PNG output **304,339,524B**. Logical input is registered source size per attempt, **not decoder reads or physical IO**. Peak HTTP read block65,536B. Phase snapshots are not transactional operation-origin attribution, so phase sums can omit work between boundaries; final cumulative remains distinct.

Cold/warm derivative HTTP reads541,197,731B /538,106,686B are repeated delivery, not published PNG size. Warm has74 new generations and900hits. Cache remained267,943,315B /491files at both gallery endpoints against268,435,456B quota while warm published13,714,123B; this supports ongoing quota turnover/re-generation, not an all-cache-hit warm pass. No per-file eviction event stream exists, so precise eviction causes/order are not claimed. Final cache268,189,982B /489files;13leases /0streams. Those final leases are natural state gauges, not a demonstrated leak or proof of exact owning cards (owner inventory unavailable).

## Actual long-media result and baseline failure

Baseline audio used the real exact-name product **播放** button with pointer click. Actual owner reads2004/2005 (coverage calls2033/2034) returned86,400,044B each with frozen SHA4872c355…; final observation includes exact-owner source creation. Snapshot records loadedmetadata/loadeddata duration5400 and a **playing event at currentTime0**, but the400ms advancement check failed. Failed local result/initial and final numeric time/current audio src tuple were not persisted; therefore current-source tuple identity and precise stalled/paused state at assertion remain unavailable. Product vs control/browser scheduling cause is **not determined**. The audio seek and both baseline video activation tests were not reached. The generic additional failure string 'formal phases/500 cold decode incomplete' does not override the ledger's actual500 cold/warm success.

| After actual user activation | Duration s | Original acquire before activation | Metadata ms | 90% seek target → advanced | Rear seek ms |
|---|---:|---:|---:|---|---:|
| audio-90min, product-button/pointer click | 5400 | 0 | 818 | 4860 → 4860.360456 | 429 |
| video-faststart, product-button/pointer click | 96 | 0 | 803 | 86.4 → 86.773572 | 493 |
| video-tail, product-button/pointer click | 96 | 0 | 657 | 86.4 → 86.714948 | 436 |

All three after items recorded actual initial time advancement and rear-seek advancement with no MediaError. Preactivation original acquire0 is the after hard gate, not imposed on old baseline eager behavior. This is Chrome + real Session/Store/HTTP native-free transport, not Mac/Android WebView/device acceptance. No additional media attempt was made.

## Text SVG actual-response verification

All50 actual gallery480px PNG HTTP response bodies were source/actual IPC/grant/current-source joined, captured during the product run, and passed post-measurement companion analysis using the same production renderer/font. All50 decoded RGBA outputs match their full with-text reference; all50 differ from same-source no-text reference within ROI by397–424pixels; outside-ROI changed pixels0. See after/svg-http.json and after/svg-roi.json for per-ID actual PNG/RGBA/source hashes. Companion generation is post-measurement analysis, not additional product coverage or IO; original frozen SVG/font were not copied. Baseline displayed original SVG and has no480px derivative ROI test.

## Evidence and limits

Raw result/ledger/phases/source-links/transport/network/current viewport and SVG bodies remain under each side. `author-summary.json` retains full phase metrics and coverage aggregates; `raw-sha256.json` will enumerate all small evidence and captured PNG bytes, excluding derived Store DB/managed copies and incidental .DS_Store. No evidence deletion/cache cleanup followed this run. This author report awaits independent recomputation and does not self-approve full paired success.
