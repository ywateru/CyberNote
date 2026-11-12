# MEDIA99 repeatable large-media measurement

These tools exercise the real App/React/Tiptap and production Rust Store/Session through an isolated native-free transport. They do not access an installed app, user database, ADB, or a device. A thin Tauri window/event shell is simulated, and Chrome uses the web desktop toolbar. Media decoding, playback, filesystem bytes, Store authorization and returned bytes remain real.

The static frontend enables development/debug navigation and the existing React StrictMode. Duplicate effect reads are part of this measurement mode; absolute counts/times/RSS are **not native release measurements**. Use identical build mode, fixture, viewport, browser and script parameters for comparison. Chrome process RSS, Rust transport RSS and Node JSON/Base64 bridge RSS are distinct. Base64 serializing/parsing and the hash observer add overhead outside a Tauri native process.

## Frozen fixture and isolated Store

```sh
python3 scripts/performance/generate-fixture.py --fixture artifacts/media99-fixture --source .
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 node scripts/performance/build-harness.mjs artifacts/media99-baseline-harness
artifacts/media99-baseline-harness/media-seeder artifacts/media99-fixture
python3 scripts/performance/generate-fixture.py --fixture artifacts/media99-fixture --verify
node scripts/performance/check-tools.mjs artifacts/media99-fixture artifacts/media99-baseline-harness
```

Generation requires local Pillow and ffmpeg, uses two encoding threads, and caps originals at 900MiB. The default is 500 distinct PNG/JPEG/SVG images, one 90-minute PCM WAV, and faststart/tail-metadata H264/AAC MP4 files of 90–95MiB each. `manifest.json` freezes every SHA256, byte size, image dimensions, duration, codec and MP4 atom location. Existing manifests are verified and reused, never regenerated silently.

The seeder compiles against copied production Store modules and uses `Store::open`, `action` and `store_attachment`, then retains the immutable samples as hardlinks to their registered managed files. It refuses an existing Store. Do not seed or hardlink any user library. Both linked paths are fixture-owned; neither original path may be edited after freezing.

Every measurement creates an independent small SQLite copy in `OUTPUT/store` and 503 hardlinks (zero additional original bytes). The first measurement freezes a quiescent `store-baseline.sqlite3` beside the manifest; close all fixture Store processes first. Subsequent measurements reuse its SHA256. Startup selection, theme, folder/view/sort are reset through the real Store command before browser navigation; original bytes and note documents are never rewritten. The baseline snapshot in this evidence was captured after exploratory runs; its hash is in each normalized run configuration.

Do not delete a fixture, frozen snapshot or evidence while another measurement references it. Inspect physical usage with inode-aware accounting; summing separate `du` invocations counts hardlinked names repeatedly.

## Frontend and measurement

Build the frontend in a separate process so compiler memory does not pollute Node bridge RSS:

```sh
node scripts/performance/build-frontend.mjs . artifacts/media99-frontend
node scripts/performance/run.mjs --fixture artifacts/media99-fixture --build artifacts/media99-baseline-harness --output artifacts/media99-baseline --frontend artifacts/media99-frontend
```

`OUTPUT` must be fresh. The harness checks copied Rust source and binary SHA256 and the frontend product fingerprint. `--source ROOT`, `--scroll-step-ms 100`, `--chrome PATH` and `--playwright PATH` are supported. Default Chrome/Playwright paths match the existing debug runtime. Post-measurement must rebuild a harness/frontend from the candidate source while reusing the original fixture/snapshot and final measurement scripts. A future production streaming backend needs a new measurement adapter for its real lease commands; do not fabricate success or translate them into Base64 reads. The existing network observer already records localhost media status/MIME/Range/length without logging capability URLs.

Space checks stop generation/build/measurement below 2.5GiB free. A measurement polls free space every 500ms and stops before the next phase; it closes owned processes. It cannot reserve space against other apps, nor immediately abort arbitrary synchronous decoder work. No automatic deletion of other artifacts occurs.

`line-transport.mjs` is an independent bounded real-protocol client, not a production or existing runtime edit. It assembles each complete stdout line once. The earlier debug reader's repeated concatenation produces quadratic copying for a 120MiB reply. The explicit line cap is **180MiB**, timeout **120s**. These settings are in `configuration.json`; they are measurement accommodation, not a product IPC change. The observer hashes actual returned Base64 in bounded chunks and records raw byte count, request phase and DOM visibility without storing content/access tokens.

## Measurement definitions and evidence

- Cold: new owned Chrome profile/process and Rust process, fresh browser/HTTP caches. OS disk cache is not evicted and was warmed by fixture integrity/seeding. Hot: reload in the same processes, recreating page Blob lifetimes.
- Workspace-ready: `.app` plus at least one note row, with startup removed. First visible image: a loaded real DOM image intersecting the viewport. Navigation times use `performance.now`; phase wall time includes a 700ms observation settle.
- Gallery: open the actual toolbar menu, then two full down-and-up cycles at 0.8 viewport per 100ms, plus 2s settle. Record rAF intervals, >50ms long tasks and original reads at request time. Offscreen within 120px is reported separately; visibility is DOM geometry, not proof of raster work.
- Memory: CDP heap/DOM, `ps` process-tree total/renderer Chrome RSS, actual Rust PID RSS and independent Node bridge RSS every 500ms. Peaks may miss shorter spikes. Natural retention and additional explicit GC samples are recorded; GC samples are diagnostics, not normal user behavior or a native memory leak proof.
- Media: wait up to 60s for the **current** audio/video element's metadata without setting `src` or calling `load`. Empty-src predecessors may be replaced by App code, so no listener is captured on an old element. Actual `play()` and 90% seek must advance media time. Timeout evidence records current source/readiness/error state. Blob Range responses do not demonstrate native file streaming.

Outputs include configuration/tool/source hashes, SQLite snapshot hash, transport request trace with actual returned SHA256, 500ms memory samples, browser network status, phases/rAF/long tasks/Blob counts, screenshots, per-media results and aggregate `result.json`. `ok:false` long-media observations are retained in the result; process exit 0 means the runner completed its phases, not that every media item passed. Runner/hash failures exit nonzero.

Known exploratory runs: run1 was invalid for long media because of quadratic debug-reader allocations; run2 waited on a captured element that could become obsolete, so its timeout is inconclusive; run3 used current-element polling but lacked the normalized per-run Store snapshot. Keep all raw runs. The report identifies the final normalized run and distinguishes instrumentation failures from observed App behavior.
