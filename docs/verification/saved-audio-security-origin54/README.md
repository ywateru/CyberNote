# Saved recording playback: SecurityOrigin rejection (54)

Read-only diagnosis of the exact Mac15 runtime. Product source, configuration, user data, application state and recording files were not modified or loaded. No GUI, build, test, target/cache, database or audio file access occurred in this diagnosis. Only the diagnostic evidence in this directory was written.

## Runtime identity and evidence

- Source: `5a147d2c5b59fcd9ca0ce4398d89cb1bb5c34a5a` (all source reads used `git show` against this immutable commit).
- Running host PID: `33095`.
- Executable SHA256: `e727118f6bcfe0c22e325542616c276d9832a453d5cccf03bd29e84a15a89197`.
- Runtime identity and original observations: root workspace `docs/verification/recording-window54-mac-runtime/launch-identity.json`, `README.md`, and `18-saved-original-A.ax.txt`. Those existing records were read, not changed or copied into this commit.
- `runtime-media-filtered.log` contains existing macOS unified log records from the exact host PID in the bounded local interval `2026-11-05 11:43:00` through `11:48:00` (+0800). No private URL or recording data is exposed in the output.
- `fixed-source-excerpts.txt` preserves relevant code and the full exact Tauri configuration with original line numbers.

## Finding

The immediate observed saved-card failure is **WebKit rejecting the media source URL in SecurityOrigin checks**, before successful media loading. It is not evidence that the actual recorded codec cannot be decoded.

At `11:44:37.467`, host `notes-clone[33095]`, main `WebContent[33175]`, media element `16271291797070097017` logs, consecutively:

```text
HTMLMediaElement::isSafeToLoadURL(...) [url] was rejected by SecurityOrigin
HTMLMediaElement::mediaLoadingFailed(...) error = FormatError
HTMLMediaElement::noneSupported(...)
```

The same sequence recurs for the same media element at `11:46:18.776` during card retry. This agrees with the existing AX card reporting an unknown duration, disabled Play, and the message `当前设备无法播放此录音格式。` The exact code maps every `MediaError.code === 4` to that message (`src/audio-playback.ts:29–33`), so the displayed format diagnosis is too specific for this actual failure.

The relevant source difference is deterministic:

1. Saved attachment: `src/Editor.tsx:53–61` calls `readAttachment` and assigns `data:${x.mime};base64,${x.data}` directly to the audio player. `AudioPlayer` passes this source into the shared production controller (`Editor.tsx:104–134`). No `convertFileSrc`/asset protocol path is used here.
2. Child preview: `RecordingPanel.tsx:185–187` passes the paused snapshot Blob into `createRecordingPlayback`; `recording-playback.ts:41` calls `createRecordingPreview`, which creates a `blob:` object URL (`recording-session.ts:449–461`). This URL reaches the same `createAudioPlayback` implementation (`recording-playback.ts:149–157`).
3. The existing system log confirms child `WebContent[43356]` paused at actual position `204.70779979108605`, duration `2698.315`, at `11:44:03.798`, and later identifies its audio session as `Audio, Paused, File, opus`. This supports the observed child playback; it does not prove audible output.
4. The configured CSP already includes both `data:` and `blob:` in `media-src`. The source being rejected is therefore not explained by a missing explicit `data:` allowance in the shipped configuration. Logs name SecurityOrigin, not CSP. This diagnosis does not establish why the particular large data URL fails that check.
5. The store/read source retains MIME and bytes without transcoding: `bridge.ts:520–529` submits File MIME and base64; native `lib.rs:243–255` decodes base64; `store.rs:831–833` reads stored bytes and returns their base64 with the saved MIME. `bridge.ts:567–583` unwraps this reply. No static codec rewrite was found in the inspected path.

## Minimal implementation proposal (not applied)

For saved **audio** attachments, decode the read reply's base64 into a byte array, construct a `Blob` with the returned MIME, create an object URL, and feed that URL to the existing audio player and duration probe. Own this URL at the attachment-load lifecycle boundary, including stale asynchronous results and unmount/source changes. Stop/detach active media and probe resources before retiring a URL; ensure each owned URL is revoked once. Keep retries on a live source. Preserve sensitive-access stamp checks in `readAttachment`; do not add a direct file path bypass.

This aligns the saved-card source scheme with the child path already observed playing. It requires no CSP widening, permission changes, recording MIME preference changes, transcoding, data deletion or re-recording. The root was informed of this proposal and the exact log evidence before any product change; implementation remains delegated to the developer.

## Limits and acceptance still needed

- The original recording file, database and returned attachment bytes were deliberately not read. Exact persisted bytes/MIME, their integrity, and the final container have not been independently checked.
- The paused preview is a nonterminal prefix snapshot (`recording-session.ts:220–222,389–400`); the saved File is built from the final `onstop` Blob (`recording-session.ts:257`, `RecordingPanel.tsx:253–269`). Successful prefix playback does not prove the final bytes are playable. The SecurityOrigin rejection occurs before that question can be answered.
- A short or synthetic-file object-URL test alone cannot establish that the existing long recording is fixed. After an independently reviewed implementation and exact candidate build, actual UI validation must play the existing saved attachment, observe real advancing time, pause/retry as appropriate, and reopen the note/app to confirm persistence. Do not label this report a playback pass or product delivery.
- Main window source URL text itself is private in unified logs; identifying it as a data URL follows the exact immutable source path and existing matching card observations. No runtime URL was extracted.

## Log query

```sh
/usr/bin/log show --start '2026-11-05 11:43:00' --end '2026-11-05 11:48:00' --style compact --info --debug --predicate 'processID == 33095 AND subsystem == "com.apple.WebKit" AND (eventMessage CONTAINS "isSafeToLoadURL" OR eventMessage CONTAINS "mediaLoadingFailed" OR eventMessage CONTAINS "noneSupported" OR eventMessage CONTAINS "204.70779979108605" OR eventMessage CONTAINS "Audio, Paused, File, opus")'
```
