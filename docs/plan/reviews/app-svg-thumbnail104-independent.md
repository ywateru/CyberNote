# SVG104 independent review — rejected

Date: 2026-11-10. Reviewed author `a72521bceb7ff6ac71d002841106cd767ad2ba12` against product baseline `e521306ea61a4d28ac9de44752524a4f2a838cf0`, exact 21-file change. Independent reviewer did not edit product code. This review does not authorize root integration or native package claims.

## F1 — P2 blocking: vector presentation URLs bypass explicit unsupported boundary

Contract: task `app-svg-thumbnail104.md` and `analysis/svg-thumbnail104.md` require external file/network/data resources to be rejected, preserving the restricted renderer's explicit unsupported result rather than silently omitting unsupported paint.

`src-tauri/src/attachment_media/svg_text.rs:168–199` returns from the vector-only branch after checking forbidden elements, href and style, but does not validate other presentation attributes. The text branch checks all attribute values. Independent actual Store → concurrent `grant_thumbnail` → production renderer/cache probes confirm all of these vector-only inputs succeed and each leaves one PNG cache entry:

- `<rect x='10' y='10' width='40' height='40' fill='url(http://127.0.0.1:9/private)'/>`
- `<rect x='10' y='10' width='40' height='40' stroke='url(file:///private/secret)'/>`
- `<rect x='10' y='10' width='40' height='40' fill='url(data:image/svg+xml;base64,AAAA)'/>`

These are wrapped in an ordinary 400×180 white SVG with no text. Three concurrent requests share one generation, so deduplication succeeds but caches the unsupported rendering. The independent test `external_presentation_attributes` intentionally fails until the policy is enforced. Disabled resolvers remain intact: this finding does **not** establish network/file access or leakage. It establishes accepted unsupported input and a silent successful derivative contrary to the promised rejection contract. Fix the vector preflight boundary while retaining valid local paint and stylesheet behavior; return the product change to the author.

## Independent checks and evidence

- Added review-only `harness/review104.rs`, its integration entry and harness registration. Uses the real Store, SessionAuthority, MediaCore, decoder and cache, not a renderer stub.
- `partial_span_and_visible_window`: missing scalar inside an otherwise valid text span, hidden sibling Text and zero-size child all reject without files; valid visible Chinese/Latin beside an off-viewport tspan produces actual differing pixels. Every probe makes three concurrent same-ID requests and asserts one generation for successful results.
- `css_variants_and_budget`: comment-split import, CSS escaped URL function, uppercase external URL in text style, 1025-scalar text and excessive tspan count reject without files.
- `late_access_and_source_change`: real Session prepare or same-length/new-inode source replacement at the post-render authority boundary must discard the old result, with one generation attempt, zero successful publications and no cache/temp files. The first test draft's hook was one authorization call too early; its attempt-count assertion caught that and was corrected. This was a review-tool issue, not a product regression. Initial output is retained.
- Independently reran the author's four focused real-module groups: **4/4 pass**. Fifty existing originals are read only, hashes match before/after and same-source no-text ROI contrast passes; fresh independent output is `svg104-independent/frozen50.json`. Chinese/Traditional/tspan/anchors, Store/HTTP/cache/replacement/revocation and resource/budget groups also pass. No 503-fixture copy or recreation.
- Font binary independently measured as 16,437,364 bytes, SHA256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`, Git blob `dc15562470b4f842321894787a0d066879ccff8b`; embedded name records independently parsed for Adobe copyright, Noto Sans CJK SC Regular and OFL1.1 metadata. These agree with pinned source/README. OFL text and attribution are present, with no claimed font modification. Machine-readable result: `../analysis/svg-thumbnail104-evidence/independent-font.json`.
- Production lock retains all old package versions and adds exactly the twelve documented text dependencies. Cargo feature graph retains no system-font/filesystem/memmap font loading. Static Binary slice, one-face initialization, per-render missing flag, fallback returning None, front-loaded nominal-glyph budget and post-conversion segment checking were reviewed. Per-span `layouted` versus source comparison is materially stronger than global PNG nonempty.
- Cache version is `media-thumbnail-v3-svg-text` and includes the pinned font SHA in its key. Existing source stamp/authorization/atomic-publish boundary remains unchanged. Product fingerprint's existing recursive `src-tauri` walk includes the font/license directory; author’s font-byte mutation/stale-stamp evidence is consistent with the actual algorithm. No need to change fingerprint scope.

Artifacts: `svg104-independent/final-tests.txt`, `initial-tests.txt`, `author-scope-rerun.txt`, `frozen50.json`. Shared root target, two jobs, incremental/debug disabled, offline locked Cargo. No native package, Android device or formal performance benchmark was run. Font compressed-package cost/RSS, all Unicode/complex shaping and actual final Mac/Android text thumbnail behavior remain outside this review. Initial `visibility:collapse` success was not reported as missing glyph: intentionally hidden SVG text is a distinct semantic case.

Decision: **rejected for F1 only**. Other passing evidence is retained for a narrow repair review; do not rerun unrelated media matrices merely because F1 is fixed.
