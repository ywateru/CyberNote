# Managed thumbnail platform provider — MEDIA99C

This private plugin exposes **zero renderer commands**, has no guest JS and grants
no filesystem/asset permissions. `build.rs` uses `Builder::new(&[])`; plugin and
App `cargo check` generate no command permission/reference/schema source files.
The Rust host obtains `Provider` from managed state and calls `thumbnail` only
with a File already opened and version-checked by the existing media core.
Android `@Command thumbnail` is reachable only through the host's private
`PluginHandle`; it is absent from Rust invoke handlers and permission manifests.
Do not add it to a renderer command list.

## Ownership and bounds

`MediaRuntime::start` remains the portable/native-free constructor.
`start_with_provider(..., Some(Arc<dyn ThumbnailProvider>))` injects the native
provider in production. The trait receives `VerifiedFile`, MIME, maximum target,
source pixel budget and an authorization callback. It returns RGBA, never a URL
or path. Cache authorization, source version checks, PNG encoding/complete cache
validation, atomic publication and eviction remain in `attachment_media`.
Provider failure does not grant authority. Basic raster formats have the existing
bounded portable decoder fallback on `unsupported_media` only; cancellation,
busy, IO and stale authority do not trigger fallback. SVG always uses the existing
restricted local resvg implementation.

- Registered source <=100MiB; target <=1024px on either axis, RGBA <=4MiB.
- Source images/video frames <=24M pixels. Decoder/framework internal allocation
  is not an exact RSS guarantee. Framework limits and actual device memory remain
  FINAL101 evidence. PNG cache uses the core's existing encoded-size bound.
- One OS decode worker across the process. The normal cache semaphore additionally
  serializes generation. Host checks authorization/cancellation every <=50ms and
  has a 10s delivery deadline. Late results are discarded, never cached.
- OS decoding cannot always be interrupted. After timeout/revocation the worker
  continues owning its duplicated FD until it actually ends; its busy guard stays
  held, rejecting further native work with `media_busy`. We never start an
  unbounded series of detached decoders. A permanently stuck system decoder
  requires application restart. No success is manufactured for it.
- Android returns only bounded derivative RGBA encoded for internal plugin IPC;
  original bytes are never serialized. FD and derivative IPC are not exposed to
  the WebView. FD duplication closes on all normal/error completion paths.

## macOS implementation

`macos/thumbnail.m::notes_media_thumbnail` is the shared host-only C ABI. It can be
linked directly into a native-free measurement harness without Tauri or copying
its implementation. It receives fd/registered length, video flag, target/source
budget, caller-owned bounded RGBA buffer, and dimensions out parameters. It
returns 0 success, 1 unsupported/corrupt input, 2 bounds violation, 3 timeout.
It does not own the caller FD; it duplicates it for platform callbacks.

A real `/dev/fd/N` AVURLAsset probe failed for both frozen faststart and tail-moov
MP4 with AVFoundation -11828/OSStatus -12847 on macOS26.4 arm64. Production uses
an internal AVAssetResourceLoaderDelegate instead: private custom URL, 64KiB
positioned `pread`, one serial request queue, yields between replies, maximum
32MiB cumulative video input and a 9s reader deadline. AVFoundation's initial
all-to-end request is not assembled in a Vec/NSData; it can cancel and seek to
metadata. Unsupported/costly videos fail explicitly. AVAssetImageGenerator uses
maximumSize and preferred track transform. Frames are synchronized with a late
callback owner; cancellation cannot write a stack pointer or leak a late CGImage.
Only MP4/H264/AAC has actual video evidence in this stage; the current resource
loader advertises MPEG4. Other containers/codecs are not promised.

ImageIO uses a direct FD data provider, bounded pread calls, no whole-source Data,
no eager full-image cache, source dimension preflight, thumbnail max size and EXIF
transform. CoreGraphics premultiplied RGBA is converted to straight RGBA before
shared PNG encoding. Both image and video probes preserve caller file offset;
images also pass from an unlinked private FD, demonstrating no path reopen.

## Android implementation

The trusted call synchronously duplicates the Rust FD with
ParcelFileDescriptor.fromFd before queueing the single native worker, verifies
registered length, and closes the duplicate after decode. BitmapFactory bounds
preflight + power-of-two sampling keeps the intermediate near 2x the requested
edge; platform ExifInterface applies orientation/mirroring. Final output is fit
within the target and checked again by Rust/core.

VideoBudget is the actual shared pure policy. API27+ uses
MediaMetadataRetriever.getScaledFrameAtTime, with source dimensions <=24M pixels.
API26 permits getFrameAtTime only for <=1,000,000 source pixels, then fits output.
It explicitly rejects larger frames; there is no unbounded decode-then-shrink
compatibility fallback. All operations use setDataSource(fd,0,registeredLength),
never a renderer path or public FileProvider URI. Source metadata checks are
platform best effort, not a defense against a defective system codec.

## Capability and evidence matrix

| Type | Portable core | macOS26.4 native probe | Android implementation / evidence |
|---|---|---|---|
| PNG/JPEG/GIF/WebP/BMP | bounded first frame | all passed at 480x270 | BitmapFactory + bounded portable fallback; SDK compile only, device pending |
| SVG | restricted resvg, no external resources/text | same core; not passed to ImageIO | same core; not passed to BitmapFactory |
| HEIC/HEIF | unsupported | HEIC sample passed ImageIO; HEIF variants platform-dependent | system BitmapFactory capability; device/API dependent, not yet measured |
| AVIF | unsupported | AVIF sample passed ImageIO | system codec/API dependent, not yet measured |
| MP4 H264/AAC faststart/tail moov | no portable poster | both passed actual FD→cache→HTTP test | scaled API27+, bounded small-source API26; device pending |
| Other videos/codecs | unsupported | explicit unsupported if platform cannot decode; no claim | platform-dependent; no device claim |

EXIF90 JPEG passed at 270x480. Corrupt inputs, closed FD, too-small input-pixel
budget and >1024 target are rejected. Tests below do not constitute Tauri/Android
release playback, hardware RSS or all-codec certification.

## Reproduction

From repo root:

```sh
python3 plugins/tauri-plugin-notes-media/scripts/check-macos.py \
  --videos /private/tmp/cybernote-delivery/artifacts/media99-fixture/originals \
  --report /private/tmp/media99c-mac.json

NOTES_MEDIA_TAURI_ANDROID=/path/to/tauri-2.12.5/mobile/android \
python3 plugins/tauri-plugin-notes-media/scripts/check-kotlin.py

CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
MEDIA99C_FIXTURE=/private/tmp/cybernote-delivery/artifacts/media99-fixture/originals \
cargo test --offline --locked \
  --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml \
  --features native-provider-probe --test provider -- --test-threads=1
```

The Mac script requires Pillow with AVIF fixture encoding and Apple's sips. It
compiles only the actual decoder and isolated probes. Kotlin check uses cached
Kotlin2.2.10, Android36 SDK and already-built Tauri2.12.5 Android classes; it checks
the actual production Kotlin and seven API/pixel policy cases, without Gradle,
APK or device. The native harness's feature links the exact production C file.
The default harness remains native-free. Test providers for deliberate bad bounds
and in-render revocation are explicit contract tests; actual MP4 poster/cache/TCP
proof uses the real provider separately.
