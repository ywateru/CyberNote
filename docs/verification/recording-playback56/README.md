# Saved audio Blob URL resource boundary — task 56

Source commit: `4ca29a8112da76c9e4892bec09b525dc1b487b20`.
Base: `c518aa7d9748a2dda59c51e225d3b26ac04c1b20`.

The saved-audio path now turns the existing authorized `readAttachment(id)`
response into an owned Blob URL, preserving the response bytes and MIME.
Loading generations own their resource; stale reads cannot allocate or publish
a URL. Replacement, retry and unmount stop the production playback controller
and duration probe before revoking its URL. Read and URL-construction failures
have a visible retry in the same editor. Other attachment kinds retain their
previous data URL behavior.

## Verification

The source and browser check were frozen together before this evidence run.
`source-manifest.json` records source hashes and confirms the working files
equal the committed files. Both recorded exact-source commands exited 0:

- `components/`: eight controlled browser checks, with no page errors or
  external requests. The full production NoteEditor, ReactNodeView, MediaView,
  attachment hook/resource, AudioPlayer and playback controller are exercised.
  Only authorized attachment responses and HTML media events/methods are
  controlled. Checks cover exact byte/MIME equality, MediaError4 and real retry,
  controller plus duration-probe cleanup order, late generations, read and
  createObjectURL failures, invalid base64, non-audio behavior, and late play
  completion after unmount. Every created URL is revoked exactly once.
- `build/`: `pnpm build` passed TypeScript and the production frontend build.
  Vite's existing large-chunk advisory is retained in the log.

The first preflight attempt also passed all eight checks and is preserved in
`preflight-attempt01/`. It ran before the source commit; the frozen files are
unchanged from that run. No failed attempt occurred. Each directory retains
command, exit status, elapsed time, stdout and stderr; browser directories also
retain the individual check results.

## Limits

The synthetic byte constants are deliberately not valid encoded audio. These
checks establish the resource boundary and actual production component/control
flow, not audio decoding or device playability. No native package was built, no
database or local audio file was opened, and no microphone or native GUI was
used. Actual WebKit playback, saved recording re-open, and same-source desktop
and Android package acceptance remain the parent's runtime verification work.
This evidence does not establish that the original Mac playback failure is
resolved.
