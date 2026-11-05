# Recording playback56 independent review

Verdict: **SOURCE-READY**, no reproducible blocking source defect within task56.

Exact reviewed source: `4ca29a8112da76c9e4892bec09b525dc1b487b20`, base `c518aa7d9748a2dda59c51e225d3b26ac04c1b20`. Only `src/Editor.tsx`, `src/attachment-media.ts`, `src/use-attachment-media.ts` and `scripts/check-recording-playback56.mjs` changed. The first input manifest was written before execution and all four fingerprints remain unchanged. This evidence commit changes no product source.

## Review findings

- The saved audio source decodes the existing authorized attachment response base64 into a Uint8Array/Blob and forwards its saved MIME. No direct file path, new native command, permission/CSP/encoding/database change or capture-session change was introduced. Synthetic byte checks include zero, high-bit and 255 values; tested MP4 and WebM/Opus MIME values are retained.
- The hook owns each resource within the effect generation `(id, kind, retry version)`. Cleanup invalidates the generation before disposing. A late response checks liveness before constructing a URL; a stale failure cannot overwrite the new generation. Current media/failure is additionally filtered against all three generation keys.
- The source binds the real AudioPlayer controller cleanup. Source disposal invokes that cleanup before URL revocation, independently of React parent/child passive-cleanup ordering. Controller disposal invalidates pending play promises, stops the duration probe, removes main listeners, pauses and clears media sources. Bound releases and source disposal are idempotent in this production path. The actual main player and duration probe both clear before the old URL is revoked; every created URL is revoked once.
- Attachment read, invalid base64, URL creation and invalid recordedAt failures stay visible and retry the same authorized attachment id while retaining the editor instance. Existing platform media error/retry behavior runs through the unchanged production playback controller; it does not substitute a guessed duration or success.
- Non-audio image/video/file sources retain their previous exact data URL behavior. Actual same-id type changes were exercised, including a stale rejected audio read during a newer video read.

## Finite checks

1. `components-first/`: unmodified author check, actual NoteEditor/ReactNodeView/MediaView/hook/AudioPlayer and production createAudioPlayback, eight groups PASS on first run. Raw output: `components-first.log`.
2. `boundaries-first/`: evidence-local copy preserves the original eight assertions and adds only two necessary groups: same-id audio/video/file generation transitions with stale rejection and active-player disposal; invalid metadata fails before allocation then retries the same id. All ten groups PASS on first run. Script: `check-recording-playback56-boundaries.mjs`; raw output: `boundaries-first.log`.
3. `pnpm build`: PASS on first run; existing Vite chunk-size warning retained in `build-first.log`.

No failed attempts occurred. Browser suites were run serially. No page errors or external requests were observed in either suite. Browser cache files are intentionally ignored and excluded from the evidence index.

## Limits

Controlled read responses and HTML media events use synthetic byte constants; they do not establish actual encoded media decoding, audible output, Mac WebKit acceptance, mobile device behavior or Apple pixel parity. This review did not run GUI, microphone/TCC, database/audio-file access, Rust checks, native/package builds, old matrices or task55 reruns. Root owns exact-source Mac16/Android10 packaging and actual saved-card playback/reopen acceptance. Source readiness must not be presented as that runtime acceptance.
