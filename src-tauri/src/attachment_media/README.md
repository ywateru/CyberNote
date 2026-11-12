# Managed media core — MEDIA99A

MEDIA99A core and MEDIA99B production integration are registered by `lib.rs`.
`MediaRuntime` is started exactly once with the application's shared Session;
UI consumers still use the legacy source path until MEDIA99 frontend migration.
Passing this harness is not native playback or end-user performance evidence.

## Ownership and integration

- Construct `SessionAuthority` with the application's exact
  `Arc<(Mutex<Session>, Condvar)>`. Its `authorize` implementation checks the
  current window incarnation, real `Session.sensitive`, actual attachment owner
  and current Store registration. There is no default-allow authorizer.
- Setup and trusted page lifecycle callbacks register actual host windows;
  acquire/release IPC captures an existing identity using its **injected real
  WebviewWindow label** and cannot register a renderer-supplied window. `WindowIdentity` has no Deserialize implementation; do
  not accept a label/incarnation supplied by JavaScript as authority.
- Construct `ThumbnailCache` in an app-owned **separate cache directory**, outside
  managed attachments and outside backup/sync inputs. Use the same cache object
  for the process. Start `MediaServer` with an explicit allowlist of application
  origins; its actual bound `base` is the only base passed to grants.
- `grant_original` is blocking metadata/open/header work: run it on a blocking
  worker. `grant_thumbnail` already moves decoding to a blocking worker and
  serializes generation with an async semaphore. Neither retains the Session
  mutex during file reads or thumbnail work. App IPC must wrap successful grants
  in `Session.tagged` and preserve the frontend access/metadata acceptance gates;
  if those reject a late result, release the lease instead of publishing its URL.
- On last frontend source reference, call `release` with the real window key.
  On destroyed window, call **both** `SessionAuthority.close_window` and
  `MediaCore.revoke_window`; reopening the same label gets a new incarnation.
- At access **prepare**, forward target notes to `revoke_notes` before renderer
  clearing ACKs. The regular Session check also rejects pending access on every
  body block; forwarding cancellation additionally terminates stalled sockets
  that are not polling their bodies. Do not call media hooks while holding the
  Session mutex. Metadata replacement/deletion similarly revokes old streams.
- Deletion/replacement hooks call `invalidate_cached_attachment` for affected IDs;
  this cancels their current leases and removes derived files. Workspace reset
  calls `revoke_all` and `clear_cache` alongside the real Session transition.
  Server shutdown cancels all streams, then drops the listener.
- `get_data_management` now adds optional `mediaCache: {version:1,bytes,files,quota}`
  under its existing global document authorization. Old totals/counts retain their
  Store-only meaning. `clear_attachment_media_cache` clears derived PNGs and
  thumbnail leases only; original playback leases remain live. There is currently
  no workspace-clear command. Any future workspace-clear must reuse this runtime
  cleanup within its real Session transition rather than introduce another reset.
  Settings/data-management rendering is deferred to MEDIA99 frontend work.

The existing full `readAttachment` path remains unchanged. Frontends must switch
list/gallery consumers to thumbnail grants, explicitly acquire originals for
preview/playback, and prevent ordinary file/offscreen cards from opening media.
MEDIA99C now supplies internal native HEIF/video-poster adapters (see below). Long-audio peaks, UI/resource retention and renderer
performance samples remain outside this core stage.

## File and authorization boundary

`Store.media_attachment(id)` is a detached registration descriptor, not a path
capability from the renderer. It rejects locked/deleted owners and the reserved
Apple-import MIME without reading internal JSON. All files of that **reserved**
MIME are conservatively excluded, including malformed records. `open` verifies
canonical attachments directory, no symlink directory/file, ordinary file,
registered size and the existing 100MiB bound. Unix `openat` anchors the file open
to a no-follow directory FD; an opened-file dev/inode/size/mtime/ctime stamp binds
a lease to this version. Every HTTP body read checks current Session/registration
before IO and again after IO, before emitting bytes. Replaced or mutated sources
cannot continue an existing lease. IO errors are not served as file metadata.

Core Unix primitives are supported on the target macOS and Android platforms.
Other OSes return an unsupported media error until they have a secure file-open
adapter. The source boundary preserves existing Store ownership and does not
broaden filesystem/asset scopes.

## HTTP contract

The service listens only on `127.0.0.1:0`, allows exact Host/application Origin,
GET/HEAD only, and uses unguessable, nonpersistent UUID capability paths. A
missing Origin is accepted because native media requests may omit it. HTTP is a
**bearer URL** boundary: the service knows its issuing window/lifecycle but cannot
prove which actual WebView initiates each HTTP request. Do not claim the scheme
handler's `webview_label` property for loopback HTTP. Do not log grant URLs or
serialize them to note documents.

| Request | Result |
| --- | --- |
| GET without Range | Complete 200, exact Content-Length, demand-polled file body |
| GET single closed/open/suffix range | 206, exact Content-Range/Length |
| HEAD | Same metadata, no body reads |
| Invalid/overflow/unsatisfiable/multiple range | 416, bytes */length |
| Missing/released/stale/unauthorized lease | Empty 404 without media metadata |
| Wrong Host/Origin | Empty 403 |
| Unsupported method | 405, Allow: GET, HEAD |

File IO is asynchronous to the runtime via bounded `spawn_blocking`/positioned
reads, with **at most 64KiB per read**. Positional reads avoid cloned-FD shared
seek offsets. Hyper supplies HTTP parsing and body backpressure; no full-file
Vec/Base64/Blob or multipart assembly is used. There are at most 32 concurrent
connections; write/body and kernel buffers are bounded separately. Disconnect,
release, revoke and server shutdown drop response state/file handles. A blocked
socket also has a connection-level cancellation watcher. `no-store`, `nosniff`
and a sandbox CSP are set. Idle leases are swept and grant count is capped.
Bytes already delivered to kernel/browser cannot be recalled: renderer source
clearing and playback stopping before access ACK remain mandatory.

Android release uses `src/main/res/xml/network_security_config.xml`: base HTTP
is denied, with one exact `127.0.0.1` exception. The debug resource overlay keeps
existing LAN/ADB Vite behavior and is excluded from release. Gradle delivery
version logic remains unchanged. CSP adds `http://127.0.0.1:*` only to img/media
and connect (bounded short-audio waveform fetch); no localhost wildcard, global
HTTP or expanded attachment asset scope. App Origins are exact production
`tauri://localhost` and `http://tauri.localhost`; debug additionally includes the
configured dev URL's serialized origin. Missing Origin remains a documented bearer
URL limitation, not WebView authentication. No ATS exception is added without
actual Mac evidence; FINAL101 must verify Mac ATS and Android release playback.
No native bundle is built by the harness.

## Thumbnail contract

PNG/JPEG/GIF/WebP/BMP first frames decode through image with disabled default
codec features, explicit input dimension/pixel/decode-allocation limits, EXIF
orientation and bounded output dimensions. Cache output is always a real small
PNG. SVG uses resvg with no filesystem/network/data-image resolver and no system
font probing. This intentionally **restricted SVG** subset supports vector shapes,
paths, gradients and clipping. SVG104 adds horizontal `text`/`tspan` with x/y/dx/dy,
anchors, fill and normal baselines through usvg's text feature. One pinned,
unmodified NotoSansCJKsc-Regular.otf (16,437,364 bytes, OFL1.1) is embedded from
`src-tauri/fonts`; no system-fonts, fs or memmap fontdb features are enabled.
Unknown families/bold/italic use this single Regular as a documented approximation.
Text is limited to 1024 Unicode scalars, 128 text/tspan elements, 4096 positioning
values, finite bounded lengths and positive font size. Trusted nominal outlines
are capped at 100,000 operations **before** shaping, then transformed text paths
at 100,000 segments. Each meaningful chunk/style span must match its actual
layouted glyph text and outline; missing glyphs, dropped chunks and ambiguous
multi-glyph cluster expansion reject the whole source. This conservative profile
may reject otherwise valid complex text; it never labels a partial rendering as
success. Zero-sized/removed text and vertical/textPath layout are unsupported.
Text SVG style attributes use an allowlist; style elements and external/escaped
CSS are rejected before shaping. Existing vector-only ordinary stylesheet,
inline style and local paint support remain, without initializing the font DB.
Embedded images, use/pattern/mask/filter, foreignObject and animation remain
`unsupported_media`. All resources still have disabled resolvers; full SVG or
arbitrary font/effect fidelity is not promised. Native HEIF/AVIF/video poster
capabilities and their explicit platform limits are documented below. Original file operations remain available on unsupported thumbnails.

Default limits: 1024px maximum output dimension, 24M input raster pixels,
128MiB decoder-allocation budget, 2MiB SVG input/10K XML nodes, 8MiB encoded PNG,
256MiB cache quota; constructor parameters allow tighter limits. Decoder
allocation limits are library best effort in addition to strict dimensions and
pixel checks; they are not a claim about exact RSS. One generation runs at a
time; same-source requests queue and hit the same cached file. Keys contain the
attachment ID/registration, opened file version, algorithm version, pinned font SHA256 and pixels. SVG104 bumps the algorithm to
`media-thumbnail-v3-svg-text`; old derivatives are not reused as text-capable output.
Hits do not read/decode the original bytes (authorization still stats the source).
Every hit validates the complete small RGBA8 PNG frame and finishes through IEND
with PNG/Adler checksums enabled; checking only IHDR dimensions is insufficient.
Warm and restart hits use the same check. Invalid IDAT, truncated endings or
unexpected encoding remove the derived file and regenerate it under the existing
source authorization checks. Cache validation streams at most 8MiB encoded data,
uses an explicit decoded frame of at most 4MiB and a separate PNG internal
allocation budget of 16MiB; no directory-wide startup decode is introduced.
`output_bytes` can tighten the 8MiB cache bound but cannot increase it.
Atomic private temp files, size-capped writes and anchored renameat/unlinkat
prevent partial cache publication or redirected mutations after directory swaps.
Source replacement invalidates old cache versions; corruption regenerates;
LRU/quota and explicit invalidation/clear reclaim files. Restart reconstructs its
index from disk; stale interrupted temp files are removed. Cache files never
become valid leases without checking the source attachment's current authority.

## Reproducing the core checks

Use only the integration test target, so Store/Session compile as production
modules and their unrelated historical fixture-dependent unit tests are excluded:

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 cargo test \
  --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml \
  --test media -- --test-threads=2
```

Harness profiles disable debuginfo/incremental output and never include Tauri or
native plugins. It directly includes real Store/Session/sync source files and
uses temporary stores. It tests TCP Range/no-Range/HEAD, exact body bytes,
concurrent seeks, slow-consumer read-ahead, disconnect/release/shutdown cleanup,
real Session token/window/prepare/deletion/locked-owner checks, managed file and
cache symlinks, source replacement, actual post-read/pre-publish authorization,
PNG/JPEG/GIF/WebP/BMP/SVG thumbnails, persistent hits/deduplication/LRU,
output bounds and cancellation before atomic publication.

`MediaMetrics.bytes_read` counts streaming payload disk reads, not MIME header
probes, decoder internals, kernel copies or WebView decoded memory.
`peak_read_block` is per read, not total process RSS. Hardware memory/startup/
scroll/seek performance still requires the planned isolated large-media sample
and actual Mac/Android release packages.

## Production lifecycle and IPC — MEDIA99B

`runtime.rs` owns the single server/core/authority and host window registry.
Setup registers existing windows; trusted page-load callbacks register future
ones. IPC captures a `WindowIdentity` before awaiting workers, never accepts
label/incarnation from the renderer, rechecks the issued lease after IO, and
returns original `Session.tagged` access/metadata stamps. `bridge.ts` validates
owner/purpose/bounded dimensions/exact loopback URL, then passes the real
AccessGate and MetadataGate. Rejected late/malformed grants are released through
the issuing window. Failed cleanup cannot publish a rejected URL; native
revocation/expiry remains its backstop. Browser preview has no silent native
source fallback; `media_unavailable` is explicit.

Every production document event, including `SyncWindows.emit`, passes
`emit_document_event` after the Session lock is released. Prepare first installs
an operation-scoped deny range, cancels active responses and removes derivatives
for all registered target attachments, including caches with zero active leases.
Capturing IDs before sync deletion preserves cleanup after registration removal.
The deny is additive to Session authority, never an allow policy: ordinary
Session checks still execute on every block. Quiet-sync prepare is not
`Session.pending`; the explicit deny prevents reacquisition until that exact
operation's terminal event. Overlapping prepares each require their own terminal
ID; unrelated/old terminal events cannot resume them. Cache cleanup on abort is
safe because thumbnails are reconstructible. Metadata receipts invalidate named
attachments and reconcile only changed identity/version/access leases, preserving
ordinary editing/pinning and unrelated-note playback. Cache IO failure must not
suppress document/access event delivery. Host Destroyed closes the incarnation
and revokes its leases; Exit stops the listener and all bodies.

The native-free `--test platform` target invokes this same production runtime,
real Store/Session, actual TCP bodies and a second real synchronized Store for
tombstone deletion. It covers creation/tagging, real window lifetime/release,
stalled 24MiB no-Range cancellation, quiet-sync suspension and overlap, source
replacement, zero-active-lease soft/sync-deletion cache cleanup, optional stats,
cache-only clear and explicit start/stop errors. `scripts/check-attachment-media-bridge.mjs`
loads the production bridge/gates with only IPC transport controlled, including
late access/metadata rejection and exact production network config. It does not
claim native decoding, browser media policy, Android release or Mac ATS proof.


## Native provider — MEDIA99C

Production injects a host-only `ThumbnailProvider` through
`MediaRuntime::start_with_provider`; portable `start` remains available to the
native-free transport. The provider gets VerifiedFile and limited target/source
pixels, returns bounded RGBA and never owns Session authorization. Core checks
source/authorization before work and before atomic publication. No JS schema,
filesystem scope, existing scan API or attachment registration changes.

See [platform provider contract](../../../plugins/tauri-plugin-notes-media/README.md)
for the actual Mac FD resource-loader implementation, API26/27 Android budgets,
capability matrix, deadlines/cancellation and reproducible probes. The native
probe feature links the same Mac source into the existing real core test harness.
Cached PNG hits still validate complete bounded frames/CRCs and do not invoke the
provider or decode the original. Basic raster fallback is portable/bounded only
on explicit unsupported_media; SVG stays restricted resvg.

Internal metrics preserve bytes_read/read_operations as total HTTP payload disk
reads, and add original_bytes_read/original_read_operations plus
thumbnail_bytes_read/thumbnail_read_operations split by lease purpose. They count
actual read attempts including a block later discarded on revocation; they are
not necessarily delivered network bytes or OS physical disk IO.
thumbnail_generation_attempts and thumbnail_source_logical_bytes count generation
attempts and registered source sizes, including failed attempts, **not decoder
reads**. thumbnail_generations remains successfully published derivatives;
thumbnail_output_bytes counts their encoded bytes (including a derivative removed
by a final authorization rejection), not HTTP traffic. thumbnail_hits includes
complete small-PNG validation and no original byte decode. No URLs/tokens or
additional JS metrics IPC are introduced.


## SVG104 focused evidence

`harness/tests/svg104.rs` executes the same production Store/cache/HTTP pipeline.
Four focused groups pass: Chinese/Traditional/Latin+tspan/dxdy/anchor pixels,
missing/partial chunk/resource/budget negatives, actual derivative/cache/source
replacement/revocation, and frozen50 per-file SHA plus text ROI comparison to
the same SVG with text removed. Frozen sources are read in place, never edited.
50/50 text ROI comparisons change 844–903 pixels at 800x600 output. Original
media/platform/review99a/review99b regressions pass (16+7+2+1). Small per-image
JSON and author commands are under `docs/plan/analysis/svg-thumbnail104-evidence`
and the104 task. This is native-free author evidence, pending independent review;
no new Mac/Android app build, packaged-font validation or benchmark is claimed.
