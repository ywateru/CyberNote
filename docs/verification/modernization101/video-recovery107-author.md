# Video recovery107 — author candidate

2026-11-11. Ready for independent review; no commit/stage or native build performed.

Video attachments now show actual HTMLMediaElement errors and an explicit “重试视频” action. Retry uses the existing authorized hook to acquire a new source URL; it does not silently retry the failed URL or run an automatic loop. A finite remembered position is restored only within the new source's finite duration/seekable range, followed by actual playback. Failed restoration/playback is visible.

`VideoAttachment` owns the element lifecycle. Current element/source tokens, owner identity, enabled state and disposed-source checks reject stale events/promises. Navigation, access/epoch loss, offscreen release and actual original-source invalidation cancel pending recovery. Initial activation retains native controls/autoplay; later source changes do not resurrect playback without explicit retry. Local retry count is excluded from owner identity; true original-pool invalidation remains included. Audio is unchanged.

Exact candidate scope: `src/Editor.tsx`, `src/use-attachment-media.ts`, new `src/VideoAttachment.tsx`, focused `scripts/check-video-recovery107.mjs`, and a 191,755-byte exact copy of an existing owned synthetic 3-second MP4. Before bytes and original absence records were saved before edits. [After manifest](../../../artifacts/video-recovery107/after-manifest.json) freezes every current SHA and the [22,259-byte text patch](../../../artifacts/video-recovery107/source-diff.patch) (SHA256 `83bd67d942802f75374730bac111ad6fbeb30db704680f17e87fb635c848804a`). The MP4 remains at its recorded repo path with exact SHA/size rather than an inline binary patch. This comparison uses saved before bytes, not the unrelated dirty HEAD diff.

Validation completed:

- Final `pnpm typecheck`: exit0 (session89447).
- `node scripts/check-video-recovery107.mjs`: exit0, eight focused real App/Chrome HTMLVideoElement checks. Actual HTTP404 produces native MediaError, visible feedback and no automatic reacquire. Explicit retry changes URL; a real trusted `seeked` event records 0.8 seconds on the new URL and subsequent playback passes 1 second. Negative cases cover detached events, actual offscreen visibility release, same-field original invalidation with a delayed grant, navigation and access/owner loss. [Result](../../../artifacts/video-recovery107/browser/result.json), [trusted seek evidence](../../../artifacts/video-recovery107/browser/restored-seek-events.json).
- First script failure is retained: it used obsolete debug `selectedNoteId` instead of actual `selection.noteId`. Corrected only the test contract, then reran once successfully. [Failure](../../../artifacts/video-recovery107/browser-first-script-failure/failure.json).

[Verification record](../../../artifacts/video-recovery107/verification.json) records exits and cleanup. The successful runner's finally closed its owned Chrome/context/Vite/HTTP and removed its own temporary runtime directory. Fresh process inspection found no owned107 runner/typecheck/Vite. An unrelated any-work Vite was untouched. Original failure/result evidence remains.

The HTTP lease server is a focused browser fixture, not the production Rust expiry server. This stage does not prove Mac/Android native playback recovery, identify the original Mac stall root cause, close Android102, or modify the frozen106 packages. Independent review and later exact-source native delivery remain separate gates.

## F1 correction for independent rereview

The independent StrictMode first-mount probe found cleanup correctly removed src but replayed setup did not restore it. The only product delta from the reviewed candidate adds a valid-owner/source-guarded src assignment in setup. Cleanup still pauses/removes src/loads, and the existing disposal, owner, activated/autoplay and retry policies remain intact. The original candidate component/patch/hash manifest are retained under `artifacts/video-recovery107/candidate-before-f1/`; the original independent failing `strict-result.json` is unchanged.

The same independent actual-component probe (only output path changed to preserve failure) now reports matching live src, readyState4, networkState1, connected=true and sourceDisposed=false. The affected eight App/video checks passed again, followed by `pnpm typecheck` exit0 (session43224). New outputs are under `artifacts/video-recovery107/after-f1/`. The canonical after-manifest and full original-before patch now represent this F1-corrected candidate; the four-line-only incremental patch is `after-f1/f1-diff.patch`. No Rust/native/device checks or packages were touched.
