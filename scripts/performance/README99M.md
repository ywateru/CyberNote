# MEDIA99M real HTTP measurement tools

Preserve the original99P fixture, baseline run4, scripts and report. Formal after-run1 has now been measured by the author and awaits independent raw-data audit; see `docs/verification/modernization101/performance-after.md`. The following prior tooling records remain historical, not formal performance results. This tooling continuation starts from accepted product snapshot `46aa78ae2f0d0f21201de68fb9fa6e7a4ec01911` (product fingerprint `e788153024fbcfe22ce3911e847d0c3ec1dbb8909f6a8c50f236fe0eb7f781c9`, 474 inputs). This snapshot includes99C counters/provider;99UI is still awaiting integration. Startup smoke therefore retains and reports actual legacy Base64 calls.

The new `media-transport.rs` host adapter compiles verbatim production Store, Session, sync and MediaRuntime into a native-free binary. All share one `Arc<Session>`; its only trusted test window is `main`. The static server binds first, then passes its exact `http://127.0.0.1:PORT` Origin via the child environment. Acquire/release return original production tagged receipts, and event producers call `MediaRuntime.event` after dropping Session and before renderer events. The browser talks directly to Rust HTTP for originals and thumbnails. Node only bridges IPC and observes it; it never rewrites a lease into Base64/Blob or creates a substitute media URL. Legacy IPC reads, if the actual product still makes them, retain their exact bytes/SHA and are labeled `legacyOriginalIPCBytes`.

The renderer IPC route denies `perf_*` commands. Only the trusted runner uses those commands for metric snapshots, real Session prepare/abort and fixed-window close/open. This is a controlled Chrome window shell, not actual Tauri WebView identity or native lifecycle evidence.

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 node scripts/performance/build-media-harness.mjs artifacts/media99m-tooling-harness3
node scripts/performance/check-media-tools.mjs artifacts/media99-fixture artifacts/media99m-tooling-harness3 artifacts/media99m-tools-final
node scripts/performance/build-frontend.mjs . artifacts/media99m-tooling-frontend1
node scripts/performance/run-media.mjs --fixture artifacts/media99-fixture --build artifacts/media99m-tooling-harness3 --output artifacts/media99m-startup-tooling-final --frontend artifacts/media99m-tooling-frontend1 --mode tooling
```

All outputs must be fresh; the shown paths are prior evidence. For this continuation use fresh `media99m-precise-harness2`, `media99m-precise-tools3`, `media99m-precise-frontend1`, and `media99m-precise-startup3` as recorded evidence, not reusable output paths. Run `node scripts/performance/check-media-accounting.mjs` for strict schema/coverage contracts. The builder uses jobs2/incremental0/debug0 and checks 2.5GiB free before compilation. Existing shared dependencies may be reused, but no native/Tauri package is built. Runner polls disk every500ms and stops at the next phase if below2.5GiB. Every work Store copies only SQLite and hardlinks503 frozen originals, adding zero original-file bytes. Tool boundary checks hash all503 originals before and after; source modules and owned binary are hashed, and stale harness/frontend inputs are rejected.

`check-media-tools.mjs` proves real tagged grants, exact Origin403, original200 SHA, Chrome206 exact bytes, generated PNG decoding, cache hit/clear/reacquire, release, Session prepare aborting an in-flight 96.8MB video, and trusted window revocation/reopen. Its direct image/range requests test HTTP primitives, **not product activation**. The sample SVG includes text rejected by the current restricted renderer; that explicit unsupported result is retained, with no original-image fallback. A JPEG is separately used to test real supported thumbnail generation.

`run-media.mjs --mode tooling` executes only startup; `--mode activation` adds actual long-media controls/time/seek plus final-leave, without gallery scroll. Formal mode now requires the accepted1507d66a product fingerprint/input inventory and ancestry, exact Mac provider source/generated hashes, schema2 counters, frozen fixture manifest/map/SQLite and streamed503 SHA before/after, actual Chrome156.0.8078.80 and100ms scroll cadence. A changed product needs explicit new candidate acceptance; there is no arbitrary bypass flag. All modes use this candidate boundary. Tool-only commits after the accepted ancestor are allowed when product inputs remain exact. The actual production schema2 atomics are serialized directly: aggregate and per-purpose HTTP bytes/operations, generation attempts/successes/hits, registered source logical bytes per attempt, and encoded published PNG output bytes. Missing/invalid counters fail; none become zero. `media-metrics.mjs` keeps monotonic-counter deltas separate from end/start gauges (active streams/leases, cache files/bytes/quota, peak block). Independent atomic loads are not a transactional snapshot; exact accounting assertions run after requests settle. Generation logical bytes are **not** decoder pread bytes or OS physical IO.

On macOS the harness compiles the same production `plugins/tauri-plugin-notes-media/macos/thumbnail.m` directly. `extract-media-provider.mjs` mechanically extracts unique production Rust imports, Frame, Provider methods and macos function at build time; it removes only the Tauri generic shell and supplies the busy-state constructor. The worker, cancellation/deadline, FD duplication and straight-alpha conversion remain verbatim production method bodies. Full input source hashes and generated Rust hash are in `performance-build.json`; checks reject changed/nonunique boundaries. `media-macos.rs` is only the File/authorize/result trait adapter, not a decoder implementation. No Tauri dependency or App package is built. Non-Mac hosts explicitly use the portable provider and cannot claim native video coverage.

The only copied-core instrumentation is `media-observer.rs`, included by the builder into the copied module. It locks and reads the real private leases map length; it never expires/reconciles/revokes leases, authorizes requests or changes lifecycle scheduling. Original product modules stay unchanged. Cache gauges call the existing production `cache_usage()` and propagate errors. This observer is separate tooling source, hashed for independent review.

`check-media-tools.mjs` additionally proves exact original200+1024B Range bytes and operations, twice-requested PNG bytes, generated PNG output/cache size, failed textSVG generation logical input, warm hit without another generation attempt/input/output, clear/reacquire, and both frozen large faststart/tail-moov video posters through production Mac decoding→cache→real TCP→Chrome image decode. Those poster checks use direct primitive requests, **not product activation or playback evidence**. Release, in-flight no-Range prepare/abort, real Origin403 and window close/reopen remain required. All503 originals, manifest, map and frozen SQLite are checked before/after. Tool inputs are hashed before and verified after checks/runs.

The retained10 phases are cold startup, warm reload, gallery-open, two down/up scroll cycles, gallery-leave,90min audio, faststart video, tail-moov video, final-leave. Viewport1440×1000, StrictMode/debug static build, scroll0.8viewport/100ms, rAF/longtask, natural retention and separate diagnostic GC,500ms JS heap/Chrome total+renderer/Rust/Node RSS remain comparable to99P. Runtime snapshots bracket phases. Rust counters mean logical source bytes, not OS physical IO; generation logical input/output also cannot claim decoder-internal reads. CDP encoded bytes include HTTP headers and differ from source-read counters. Browser HTTP cache is disabled by Playwright routing and runtime responses are no-store; warm means retained Rust derivative/OS cache.

Audio/video phases click actual product activation controls before waiting on the latest live media element and testing time progression/90%seek. Optional `--audio-activate SELECTOR` / `--video-activate SELECTOR` select real controls within that attachment node. No `src` assignment or `load()` fallback exists. Missing controls/metadata/unsupported codecs remain failures. Actual playback selectors must be checked against accepted99UI.

Results separate450raster/50textSVG registered, attempted, successful, failed-only and unattempted attachment counts, acquire errors and HTTP traffic by MIME population and original/thumbnail purpose. Successful original access never hides a failed thumbnail under per-purpose coverage. Incomplete HTTP events with unknown encoded lengths produce an explicit unknown count and null overall total; known bytes remain separately reported. These are request/sample subgroups in a mixed run, **not isolated raster-only memory measurements**. Unsupported SVG must be disclosed when comparing overall bytes/RSS; fewer decoded samples cannot be advertised as an equal-function performance win. A separately controlled450raster-only product run, if needed, requires the same subset on both baseline and optimized sources. Never relabel99P's original mixed-population baseline as that subset.

Actual Mac Tauri ATS/playback/RSS and Android decoder/cleartext/RSS remain FINAL101 work. Mac native ImageIO/video provider linkage is now exercised in this host harness, without the Tauri shell. Chrome/native-free Rust results cannot substitute for those checks.


## Formal after-run1 (author; pending independent audit)

Accepted combination `1507d66a152ac2ac9838d2bcd37791449135a370`, fingerprint `4e143c3d8d459ce2f26a699c691ba58b188fc6b58a9e3838b1c8852422e8a904` /434 inputs. Tool review9bc41475, UI52094e28, provider/core and101identity are accepted in this snapshot. Native Rust source/binary remains the same; frontend is rebuilt from the exact new product. Outputs below already exist and must not be reused as fresh paths:

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 node scripts/performance/build-media-harness.mjs artifacts/media99m-after-harness1
node scripts/performance/build-frontend.mjs . artifacts/media99m-after-frontend1
node scripts/performance/check-media-candidate.mjs
node scripts/performance/run-media.mjs --fixture artifacts/media99-fixture --build artifacts/media99m-after-harness1 --output artifacts/media99m-after-activation1 --frontend artifacts/media99m-after-frontend1 --mode activation
node scripts/performance/run-media.mjs --fixture artifacts/media99-fixture --build artifacts/media99m-after-harness1 --output artifacts/media99m-after-run1 --frontend artifacts/media99m-after-frontend1 --mode formal
```

The actual Editor controls are exact audio `播放` and video `播放视频 <file.name>`; no generic media-element click fallback or initial programmatic play is used. Both original acquire count and actual auto-play progression are recorded. Only the explicit rear-seek test sets currentTime/resumes playback. Metadata must match complete5400s/96s duration. Any media/page/runner failure, disk stop or incomplete formal phase count exits nonzero.

Run1 completed10phases,0legacyIPC/0page or media failures; all three media auto-play/90%seeks succeeded. Core reads68128559 original HTTP bytes and67512903 thumbnail HTTP bytes; generation logical bytes stay separate. Coverage169/450raster,50/50textSVG unsupported;281raster have no backend acquire (precise queue/dequeue cause not observed). This prevents an equal-function450raster memory-win claim. Scroll2 is partly warm and still generates70 derivatives. Final open-note6leases/0streams is reported as-is; the older release trace lacks lease hashes so exact retained owner/purpose inventory is unavailable. No forced teardown/replay was added to manufacture zero leases.

`report-media-after.mjs` recomputes raw wall/rAF/longtasks/RSS and production deltas, checks recorded metrics and all-phase totals, and records SHA of raw inputs. It is analysis-only; it does not rerun the product or alter old baseline. The report and committed small `media99m-after-data.json` document functional coverage gaps, cancelled/unknown encoded lengths, seven unattributed SVG network events, sampled visible-image readiness limits, OS-cache and process-memory scopes. Large raw traces remain in artifacts for independent audit. No statistical repeats or nativeApp/ADB tests were performed.

##105 representative tooling (not formal paired execution)

`run-media.mjs --mode coverage105-smoke --side baseline|after` dispatches to
`coverage105.mjs`; existing99M modes and `media-candidate.mjs` retain their
original1507d66a /156 locks. No105 formal mode is enabled by this tool delivery.
The fixed roles are:

- Baseline: retained actual28,089,264B Rust binary SHA `f2ccb77a…`, exactly nine
  static frontend files pinned in `frontendPins`, fixed root artifact paths,
  old84f2/dirty identity. Missing/extra/changed files fail closed. Historical
  dirty source is not fully recoverable; recovered frontend metadata is not a
  pristine historical per-asset build manifest. No rebuild/root-dist fallback.
- After: accepted bf26dae17f972fc09276deb456b4599e1ebe5d67 ancestor,
  fingerprint `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9`,
 445 inputs. Tool-only descendant commits may retain that exact product hash.
  The native-free Mac provider remains mechanical production Rust extraction
  plus exact production C.104 font is a checked `harness/fonts` symlink to the
  unique source asset, not a copied16.4MB artifact. Build sources hash font,
  OFL and source notice before/after compilation.

105 independently pins current Chrome157.0.8103.40 executable and actual
framework bytes (streaming hash before/after); both new sides must match.
Historical99P/99M used156.0.8078.80. New105 timing is not a same-browser/protocol
rerun of those old raw results. No old Chrome download or altered99M gate.

Build once in owned outputs, reusing the shared target (baseline never builds):

```sh
CARGO_TARGET_DIR="$PWD/src-tauri/target" CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 \
  node scripts/performance/build-media-harness.mjs artifacts/media105-after-harness
node scripts/performance/build-frontend.mjs "$PWD" "$PWD/artifacts/media105-after-frontend"
node scripts/performance/check-coverage105.mjs --unit only
node scripts/performance/check-coverage105.mjs \
  --fixture artifacts/media99-fixture \
  --after-build artifacts/media105-after-harness \
  --after-frontend artifacts/media105-after-frontend \
  --output artifacts/media105-tool-smoke-FRESH
```

The check uses actual product search titles000/020/090, then the real “查看附件”
menu, to limit each side to five PNG, five JPEG and five textSVG cards. It does
not directly acquire/fetch/assign src/load or edit frozen SQLite/originals.
The shared step/barrier is ≤0.5 viewport, ≥500ms dwell,100ms DOM snapshots,
30s deadline including `img.decode` and two rAF. Visible times are sampled
intervals, not exact continuous durations. Small filtered galleries can fit
without scroll movement; this validates the readiness/identity path, not the
full500-card geometric traversal. No supplementary visit or long-media run is
included in this representative check.

Baseline association observes exact returned data consumption within the same
synchronous product atob→Blob creation turn; no second Base64 decode/hash/copy.
A measurement-only `coverageCall` joins it to exactly one actual Rust IPC and
frozen original SHA. The getter returns identical data, native atob and actual
objectURL operations are unchanged. After sources join real tagged grants and
HTTP purpose by capability SHA. URLs/tokens are never written in raw evidence.
Unknown/ambiguous sources stop rather than guessing by creation order/bytes.
Source joins capture owner/mount/current source, visibility and ephemeral URL in
one synchronous traversal of the same gallery root. Visible filtering uses that
tuple, then exact actual IPC/grant validation remains mandatory. Association
failures retain bounded local tokens/IDs and the failed check, never raw URLs.
Baseline owner comes from its actual read trace. After acquire traces omit
owner: their exact call ID must match one successful tagged media-wrapper row,
whose owner/purpose and capability digest must match the current validated grant.
There are no new queue hooks or IntersectionObservers. Initial complete image
snapshots cover loads preceding the first sample. Stale source/mount results
cannot pass the decode barrier; baseline unsupported native metrics are null.

`configuration.json`, `coverage.jsonl`, `source-links.json`, original transport
JSONL, `network.json`, `groups.json`, current viewport, screenshots and
`result.json` remain independently recomputable. Node/Rust/renderer RSS stay
separate; logical generation input is not physical decoder IO. Full paired
execution still requires separate parent authorization after independent tool
review; historical raw/fixture hashes are never rewritten.

Formal105 runner candidate (separate execution authorization required)

The formal mode reuses the exact same observer, source association, settled
viewport barrier and scroll helper as the independently accepted representative
mode. It has fixed roles and these phases: startup-cold; real unfiltered gallery
cold down/up; only-never-visited supplement if necessary; full warm down/up only
when all500 cold IDs decoded; gallery-leave;90-minute WAV and faststart/tail MP4
activation, actual time progress and90%seek; final-leave. Explicit product errors
are retained as failures, never retried into success. Warm errors also fail.
Startup phase starts before navigation, gallery phase before entry/search clear.
Natural startup cache work is counted, not discarded or called per-image cold.
The baseline's eager original reads remain a measured behavioral difference;
after original acquisitions before each media activation must be zero.
Baseline video uses real native-control focus+Space; after uses its real play
button. These implement the same user intent with recorded controlKind/input.
There is no initial script play/src/load or fallback activation. The script seek
and resume occur only after actual activation/time progress has passed.

`ledger.json` contains all500 fixed IDs, first-pass/supplement/warm source
revisions, sampled visibility endpoints, current-source decode+2rAF results,
errors/timeouts, exact IPC links and HTTP grants.450raster/50textSVG remain
separate IDs/mime values; video posters are not in the500 denominator. Queue
cancellation cause stays unknown. Snapshot sampling remains100ms, not continuous
visibility measurement. Only state changes and visible/prefetch geometry are
logged; a stable500-card snapshot emits one sample-clock rather than500rects.
Supplement targets are the frozen never-visited IDs in actual DOM order. The
shared helper keeps continuous half-viewport steps and audits naturally crossed
old cards, then stops immediately after the last required target is terminal.
It adds no target-free tail or return-to-top pass; missing/unreachable targets
fail. Historical first-pass coverage and errors remain unchanged.
When all cold IDs succeed but supplement ends away from top0, a separate
`gallery-warm-position` phase returns continuously to top0 with the same steps
and settled-current-source barrier. Its route/wall/IO stay separate from both
supplement and the full warm down/up pass; already-top0 adds no preparation.
`phases.json` includes actual phase walls, dwell/wait/motion/decode-barrier costs,
rAF quantiles/longtasks, separate Node/Rust/renderer RSS and JS heap, runtime
purpose counters/gauges and original IPC bytes. Decode-barrier time overlaps
wait/dwell; it is not additive product time. Baseline unavailable metrics remain
null. HTTP bytes are purpose-specific native read counters, generation source
bytes are registered logical input, not decoder physical IO.64KiB peak reads
are enforced. No forcedGC or requirement for final lease count0 is added.

The analysis companion compiles the exact production `svg_text.rs` by absolute
path, hashes it/font/license/source before/after, and uses the same unique font
asset without copying it. CDP captures only actual completed480px SVG HTTP
responses. These are credited only after the decoded current DOM source joins
its exact attachment/IPC/grant capability.160px startup responses remain in raw
network logs and do not enter gallery ROI. After all timed product phases and
owned process teardown, the companion compares actual480×360 RGBA against the
same production renderer's full original, then against its same-source no-text
version in the frozen text ROI. All50 formal SVG responses must match the full
reference with nonzero text-region changes and zero changes outsideROI.
Companion outputs do not add product coverage or measured product IO/timing.

Existing host/frontend artifacts are reused; do not rebuild them for this stage.
The one small companion build and geometry-only validation commands are:

```sh
CARGO_TARGET_DIR="$PWD/src-tauri/target" CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 \
  node scripts/performance/roi105.mjs build artifacts/media105-roi-companion-FRESH
node scripts/performance/check-coverage105.mjs --unit only
node scripts/performance/check-coverage105.mjs --cleanup only
node scripts/performance/check-coverage105.mjs --geometry only \
  --roi-build artifacts/media105-roi-companion-FRESH \
  --fixture artifacts/media99-fixture --after-build artifacts/media105-after-harness \
  --after-frontend artifacts/media105-after-frontend --output artifacts/media105-geometry-FRESH
```

Geometry mode1440×420 makes each existing five-card group scroll; formal remains
1440×1000. Geometry/representative success is not formal500 coverage acceptance.
After independent formal-tool review and explicit paired execution gate, run
`run-media.mjs --mode coverage105-formal --side baseline|after` with the same
fixture/build/frontend/output arguments and `--roi-build` on after. No separate
formal framework or direct backend image-generation path is used.

Budgets: measured record wall45min/side,30s per settled viewport,≤0.5H steps,
≥500ms dwell,100ms snapshots, geometry-derived step bound (at most twice the
initial down/up step count plus20). A pending media control may reach its own
bounded120s wait before teardown after wall failure; identity hashing and
post-timing analysis are outside the measured45min. Companion build/analysis
child timeout60s and4MiB stdout,64KiB stderr tail. Coverage JSONL has a hard64MiB
append budget; total primary raw JSONLs are monitored against96MiB every500ms
(so an asynchronous burst can exceed it before failure); captured SVG PNGs are
bounded32MiB total,8MiB each. The final ledger/phase/source summaries are written
once rather than repeatedly dumping500rects. Start requires5GiB free, monitored
stop floor2.5GiB. Any evidence or resource-close failure retains failure status
and still attempts every other owned resource close, preserving acceptedF1.
