# MEDIA99M precise metrics / Mac provider tooling — author evidence

This is a tool continuation, awaiting independent review. It is **not** the formal optimized-product10phase after measurement and makes no before/after performance claim.

Source baseline: `46aa78ae2f0d0f21201de68fb9fa6e7a4ec01911`. Product fingerprint remains `e788153024fbcfe22ce3911e847d0c3ec1dbb8909f6a8c50f236fe0eb7f781c9` /474 inputs. Only new99M tooling and its documents changed; no product/old99P/fixture/debug-runtime changes. A dirty git flag in smoke metadata reflects these tool edits; the product fingerprint is unchanged.

## Reproducible commands

Run from `/private/tmp/cybernote-delivery`; output directories must be fresh (these exact names now contain author evidence).

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 node scripts/performance/build-media-harness.mjs artifacts/media99m-precise-harness2
node scripts/performance/check-media-accounting.mjs
node scripts/performance/check-media-tools.mjs artifacts/media99-fixture artifacts/media99m-precise-harness2 artifacts/media99m-precise-tools3
node scripts/performance/build-frontend.mjs . artifacts/media99m-precise-frontend1
node scripts/performance/run-media.mjs --fixture artifacts/media99-fixture --build artifacts/media99m-precise-harness2 --output artifacts/media99m-precise-startup3 --frontend artifacts/media99m-precise-frontend1 --mode tooling
```

Formal gate check: invoke the runner with `--mode formal` and any fresh output name; it must exit nonzero with `Formal10phase measurement gated` before reading fixture/build, creating output or launching Chrome. There is no flag bypass. This was checked separately; no10phase run was performed.

## Tool boundaries

- Required production schema2 atomics serialize directly: aggregate/original/thumbnail HTTP read bytes and operations; thumbnail attempts, generation successes/hits, registered source logical input and published encoded PNG output. Missing/invalid values throw, rather than defaulting to0. Counters and gauges have separate delta contracts.
- `media-observer.rs` is the sole copied-core instrumentation. It reads the actual private lease map under its existing mutex and never mutates/expires/revokes/reconciles, changes authority or lifecycle scheduling. `cache_usage()` supplies the real cache gauges and errors propagate.
- Mac native code is exactly production `thumbnail.m`. Unique-boundary mechanical extraction preserves production Rust Provider method bodies, FD lifetime, single busy worker/deadline and alpha conversion; only Tauri generic shell/constructor is adapted. Build metadata records full input hashes, generated source hash, `native:true`, `tauriPackage:false`. The builder never compiles a Tauri/App package.
- Decoder internal byte reads are not instrumented. `thumbnailSourceLogicalBytes` means full registered source size per generation attempt, including failed attempts; it is neither actual decoder I/O nor physical disk I/O. HTTP counters count production source reads, while CDP encoded lengths include headers. Separate Node bridge, Rust and Chrome renderer RSS remain reported. Missing RSS peak is null, not fabricated0.
-450raster and50textSVG coverage is separate and further split by original/thumbnail purpose. Original access success cannot conceal thumbnail failure. Unknown encoded length on failed/incomplete HTTP events remains an explicit unknown count/null overall total.

## Author checks

`artifacts/media99m-precise-harness2/performance-build.json` records source inputs, generated Rust and the exact owned binary. The binary SHA256 is `9052e06fbf175d5e7f0863ae56d67d40567a778e09cde9ee8b2d6f1780752322`; mechanically generated Rust SHA256 is `9b287522f4a86bbb59fc31eb0bf661223befd75623520edfa35d1c7871194abe`.

`check-media-accounting.mjs` exercises missing/null/negative/nonfinite/unsafe/string counters, counter regression, counters versus gauges, per-purpose SVG failure and unknown HTTP length. These are contract fixtures, not measurement evidence.

Real checks in `artifacts/media99m-precise-tools3/result.json` cover actual Session/Store/MediaRuntime, tagged acquire, exact Origin403, original200 SHA, Chrome206 exact1024bytes, production PNG Chrome decode, warm cache, clear/reacquire, release, prepare/abort during a96.8MB no-Range stream and real trusted host window close/reopen. Exact settled checkpoints verify:

- JPEG source661678B +1024B Range gives662702 original HTTP bytes; twice-fetched60401B PNG gives120802 thumbnail HTTP bytes.
- Failed textSVG plus JPEG:2 generation attempts,705860 registered logical input bytes,1 published generation and60401 encoded output/cache bytes. TextSVG fails explicitly `unsupported_media`.
- Warm hit leaves attempts/logical input/output unchanged. Clear resets cache only and preserves an original lease; reacquire adds exactly one generation and the JPEG registered input size.
- Both96754277B faststart/tail-moov MP4s go through the production Mac FD decoder/cache/TCP and Chrome image decode. Each produces160×90 /7111B PNG:1 generation attempt,96754277 logical input bytes,7111 output bytes,14222 thumbnail HTTP bytes from two reads and0 original HTTP bytes. These are direct primitive poster checks, not product activation/playback.
- Closing the host leaves0 active leases/streams; actual peak HTTP read block remains<=65536B.

Before/after streaming hashes preserve all503 frozen originals (715371216B), manifest `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`, and frozen SQLite `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`. Stores hardlink those originals and copy only SQLite. Existing `media99-baseline-run4` was not modified.

Startup evidence is `artifacts/media99m-precise-startup3/result.json`, plus raw `memory.jsonl`, `phases.json`, IPC/media traces and screenshots. It executes only one tooling startup, retains actual legacy IPC and is not an optimized-product result. Full native Mac Tauri/ATS/playback and Android package/decoder/network/RSS/ADB remain101 scope. No manual src/load or fake acquire implementation exists.

Parent tracked101 risk (not changed here): build-info product inputs currently include generated Android `.tauri/tauri-api`, generated Java and `proguard-tauri.pro` files. A full Android native build may alter fingerprint inputs; parent will arrange a separate97/101 fix/review before formal measurement. This task does not touch build-info or generate Android output.
