# MEDIA99M precise tooling increment — independent review

Verdict: **ACCEPT for the tooling increment. No blocking finding.** This is not formal optimized-product performance acceptance. Baseline `46aa78ae2f0d0f21201de68fb9fa6e7a4ec01911`; author head `be61aa0e47ada455deebd122cdb0e479425a6df7`. The previously reviewed `2428251a` tooling was not reopened wholesale. The 14 changed files were reviewed; no product code, old99P scripts, fixture originals, or user data was changed by this review.

## Independent evidence

The repeatable probe is `docs/plan/reviews/app-media99m-precise-probe.mjs`. It uses the actual production Session/Store/MediaRuntime through the owned tool binary, not an HTTP mock. Its final strengthened run passed with output `artifacts/media99m-precise-independent-final/result.json` and raw transport trace `artifacts/media99m-precise-independent-final/independent-media.jsonl`. Run with a fresh output directory:

```sh
node docs/plan/reviews/app-media99m-precise-probe.mjs artifacts/media99m-precise-independent-next
```

The probe verifies every recorded build input hash, the owned binary hash, every copied production core module, the exact generated Provider Rust, the production C copy and the sole observer append. Missing or duplicate extraction boundaries reject. The generated Rust preserves the exact production imports, Frame, Provider methods and macOS function; adaptation is limited to the documented Tauri generic shell/constructor. Production `thumbnail.m` is compiled directly. The appended observer only obtains `.len()` under the existing lease-map mutex. It does not alter authorization, expiry, revocation, locking semantics or lifecycle scheduling.

- Owned binary SHA256: `9052e06fbf175d5e7f0863ae56d67d40567a778e09cde9ee8b2d6f1780752322`.
- Mechanically generated Provider SHA256: `9b287522f4a86bbb59fc31eb0bf661223befd75623520edfa35d1c7871194abe`.
- Manifest SHA256: `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`.
- Frozen SQLite SHA256: `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`.

All 503 originals were streamed and SHA-checked before and after the independent run: 715,371,216 bytes. Manifest/sample mapping and managed-file hardlink identities match. The independent Store hardlinks immutable originals and copies SQLite; it does not duplicate all media. The associated JSON report records hashes and sizes of the raw evidence files.

## Accounting and real native-provider boundaries

Raw author metric checkpoints were compared to the summary, then independently recomputed from fixture sizes and actual delivery observations:

| Metric | Independently reconstructed result |
| --- | ---: |
| Original HTTP source bytes | 793,774 |
| Thumbnail HTTP source bytes | 149,246 |
| Aggregate HTTP source bytes | 943,020 |
| Generation attempts | 5 |
| Registered source logical bytes per attempt | 194,876,092 |
| Published encoded PNG bytes | 135,024 |
| Final active leases / streams | 0 / 0 |
| Peak HTTP source read block | 65,536 |

Original delivery is the 661,678-byte JPEG, a 1,024-byte Range, and the 131,072 bytes actually delivered before video revocation. Thumbnail delivery is two 60,401-byte JPEG-thumbnail reads plus two reads each of the two 7,111-byte MP4 posters. Both 96,754,277-byte MP4 fixtures produce a 160×90 PNG through the production Mac FD provider. Warm hits leave attempt, logical-input and encoded-output counters unchanged.

The independent new Session additionally passed HEAD with zero source reads, exact 73-byte Range content, wrong-Origin 403, explicit textSVG `unsupported_media`, native MP4 generation, exact warm-cache deltas, clear-cache preserving an original lease and a subsequent 13-byte original Range, native regeneration after clear, and trusted window-close revocation ending at zero active leases/streams. Its independent poster is 7,111 bytes, SHA256 `223e09f87b6b239e23b6f8d06a628064e48f2df020f17435af204e675c1d1908`.

The accounting contract check also passed. Required schema2 counters reject absent/null/negative/nonfinite/unsafe/string data; gauges are distinct from monotonic counters. Raster and textSVG coverage are separate and split by original/thumbnail purpose. An original success cannot hide a failed thumbnail. Unknown encoded HTTP length is retained as unknown rather than fabricated zero. Generation logical input means the registered source size for each attempt, including failed attempts; it does not claim physical decoder reads or OS disk I/O. Node bridge, Rust process and renderer RSS remain distinct, with unavailable peaks represented as null.

## Gates, limitations and integration follow-up

The formal-mode gate was independently invoked with nonexistent fixture/build paths. It rejects before fixture/build reads, output directory creation or browser launch. No bypass was introduced and no formal ten-phase run was attempted.

The one-phase tooling startup retains the actual old-UI behavior: 22 legacy `read_attachment` calls totaling 3,443,151 bytes. These were counted again from raw IPC and matched to the report. This is truthful tooling-smoke evidence, not a claimed optimized result.

After the parent refreshes this tree to accepted99UI, the formal-run author must adapt or pass the video activation selector: the current default anchors `播放视频`, while accepted99UI appends the filename to that accessible label. This is a forthcoming integration change, not a blocker for the currently hard-gated tooling increment. It must use actual user activation rather than force media `src`/`load`.

No full native Tauri package, ATS validation, Android package/decoder/network/RSS/ADB, formal ten-phase result, or physical decoder I/O is validated here. No new compilation was needed: the owned binary was used only after its source/copy/generated-source/binary hashes were verified. No earlier broad-suite failure is relabeled by this review.
