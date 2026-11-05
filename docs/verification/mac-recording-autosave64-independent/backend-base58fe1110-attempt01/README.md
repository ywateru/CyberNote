# Task 64 independent unchanged-backend verification

This run verifies only the existing Store/Session protocol that task 64 proposes to reuse. It is **not acceptance of task 64 frontend autosave, recording, PCM decoding, UI, or a real device**.

- Exact base/source: `58fe1110eb3316558f83da9ec939f18b56688977`.
- Independent tree: `/private/tmp/apple-notes-mac-recording-autosave64-independent-01`, branch `verify/mac-recording-autosave64`.
- All 20 Store/Session input files were copied byte-for-byte into a new isolated harness. Their individual SHA-256 hashes are in `metadata.json`; `source-copy-verification.json` confirms the copies and end-of-run inputs match.
- Dependencies came from the repository's existing QA Store manifest/lock, with only the harness package name changed. Build was `cargo build --locked --offline` using the coordinator-allocated existing `/private/tmp/apple-notes-recording-window50-independent-target` cache. No cache was cleaned.
- Build exit 0 in 13.768 seconds; probe exit 0 in 0.667 seconds. One attempt, 14 assertion groups PASS.
- Binary: 7,372,560 bytes; SHA-256 `ca1c9c346be709e5bbc2cbb2bf7a2dd72f9d05a8c7bec0f85bcee25a86012c47`.

The independent probe is `scripts/check-mac-recording-autosave64-store-independent.rs`, executed by the accompanying Python runner. Product files were not edited. The harness owns production Store and Session, uses real save intents and actual SQLite/file operations, and inspects the actual private journal through a separate read-only SQLite connection. Media fixtures are distinct, complete 108-byte PCM WAV files with known equal-sized payloads.

## Observed boundaries

1. A successful real `Session.save` leaves the attachment journal `stored`. The explicit query finds the document reference and changes it to `committed`.
2. A byte-identical retry retains the same attachment identity. Equal-sized different WAV bytes with the same operation ID produce `attachment_operation_conflict` and do not overwrite the original file.
3. Independent immutable operations can be saved as successive references in one note document. The supplied current A body and B body remain exact, the A body has one attachment node, and both committed media files retain their expected bytes and recording dates.
4. Cancelling an already committed previous operation retains its file. Simulated document-reference Undo/Redo can reference the preserved old/new files. This is a DB-level save simulation, not a ProseMirror Undo/UI test.
5. Reopening storage retains committed files, while a new process Session cannot adopt the previous operation owner.
6. Four live worker processes reach explicitly recorded storage boundaries with Session/SQLite still owned. The parent then sends SIGKILL and waits for signal 9 before opening the actual database:

| Worker boundary | Result after reopen |
| --- | --- |
| Previous version ACK + query committed; new candidate stored without body ACK | Previous body/file retained; new unreferenced candidate metadata/file aborted and removed |
| Previous version committed; latest body ACK but latest not queried | Body has one latest card; latest bytes retained and journal recovered as committed; previous committed bytes retained |
| Both versions explicitly committed | Latest body/card retained and both physical versions preserved |
| Negative control: previous body ACK without query, then replacement committed | Latest retained; the now-unreferenced previous `stored` operation is aborted and cleaned, proving why the query barrier is necessary |

Each recovered store accepts a fresh operation under a new Session, safely cancels that unreferenced operation, and remains stable on a second open.

## Scope and handoff

This is synthetic local persistence evidence, not proof of recording validity, audibility, pause timing, media decoder correctness, mounted App/Window/Panel behavior, focus, or pixel parity. SIGKILL occurs after declared public Store/Session boundaries; this run does not inject failure inside individual filesystem writes. Existing tests for those internal boundaries are separate.

All databases, media fixtures, receipt files and copied harness sources remain under `artifacts/mac-recording-autosave64-independent/backend-base58fe1110-attempt01/`. No real Notes data, microphone, GUI, device, signing, permission, TCC, or old worktree was touched. The native/cache slot was released immediately after this probe.

When the exact committed task 64 source is imported, compare all 20 backend input hashes before reusing this evidence. Frontend races, actual PCM generation and close/ACK behavior still require separate independent verification.

`evidence-index.json` lists the immutable records in this run and the two independent probe sources; it excludes itself and the ignored artifact tree.
