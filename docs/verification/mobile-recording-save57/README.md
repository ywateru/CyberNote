# Mobile recording save — actual editor commit boundary

Source: `c25cf7fb0a085a3b01108d23cc4e0286f847f56e`.
Base and baseline App: `9167db94908ac635b026220e782878447c9e16a7`.

Only mobile recording target validation waits for an actual parent layout
commit after a successful current trusted synchronization. React runs the
mounted child SearchEditorHost's gate layout first. Validation then obtains a
fresh live snapshot and retains the existing complete rebindAttachmentTarget
checks. The wait does not change the original target, documents, stamps or
versions. The same path covers validation before storage, after storage and
before query recovery from a rejected storage response.

Pending waits have individual abort controllers. Sealing or finishing aborts
current waits; a later legitimate sealed cancellation can establish its own
wait. Hook unmount rejects pending waits. This avoids waiting on isEditable
forever and preserves the existing cancellation/operation/real document ACK
flow. Desktop recording Session, A/B ownership, the attachment journal, access
rules, database and audio format are unchanged.

## Exact-source verification

- `components/`: 17 serial controlled browser checks mount actual React App,
  NoteEditor, SearchEditorHost/Gate and RecordingPanel, using production bridge,
  authority, target/submission and SaveQueue. The only simulated boundaries are
  native IPC responses and recording hardware/media events. No React `act` or
  copied target-validation implementation restores the editor.
- The first check runs the exact baseline App through the same delayed native
  read. The gate has actually committed blocked=true before the response is
  released. It rejects with the original message: available and isEditable are
  false, while trusted synchronization, note/scope/editor/owner, both document
  representations and versions remain unchanged. The new App passes the same
  scenario, waits at both storage boundaries, stores/inserts once and keeps the
  real sheet open until the held document ACK is released.
- The remaining checks reject actual note navigation, changed owner/editor
  document/trusted raw document/epochs/authorization, destroyed editor and
  invalidated synchronization. Deliberate editor changes retain their ordinary
  autosave; they cannot admit the recording attachment. Stored-response loss
  recovers via the same operation after a third real commit validation. A
  stored second-boundary rejection retries the same File/operation. Two failed
  document saves retain the sheet and node; the subsequent same-File retry
  obtains ACK without another store/insertion. Stored cancellation, sealing
  and App unmount terminate waiting without deadlock or late insertion.
- `desktop/`: one necessary regression uses the existing AST-extracted actual
  App parent closures and production PM bookmarks/submission/bridge/SaveQueue.
  Original A edits, Undo/Redo and B editing remain intact; the recording is
  inserted once into latest A without focusing it. Retransmission retains the
  File and the owner remains until child closure. This is not a mounted desktop
  UI or native-window test.
- `build/`: `pnpm build` checks TypeScript and production frontend bundling.
  The existing Vite large-chunk advisory is retained.

Each exact-source directory contains its command, elapsed time, exit status,
stdout/stderr and check results where applicable. `source-manifest.json`
confirms the tested working files equal the frozen commit and records hashes
and tool paths. The default component run has no case filter.

## Preserved preflight history

All attempts and logs are retained under `preflight/`; no failure was erased.
These failures were in the new harness, and did not require changing the
product fix:

| Attempt | Result and correction |
| --- | --- |
| 01 | Initial folder page hides note rows; enter the folder before the note. |
| 02 | Use the actual mobile “录音” button label. |
| 03 | Pause before tapping mobile Done, matching the existing interaction. |
| 04 | A deliberately changed editor body performs its legitimate autosave; assert zero attachment storage/insertion instead of zero ordinary saves. |
| 05 | A note epoch change can legitimately cancel and release the obsolete ticket; assert rejection/termination and no attachment side effects. |
| 06 | Destroyed editor can likewise release its obsolete ticket; assert no hang or attachment side effects. |
| 07 | The existing ACK path automatically retries the first save; fail both initial save attempts to exercise the visible Panel retry. |
| 08 | All five selected behavior checks passed; cleanup exposed an incorrect native Back listener mock. The installed official API returns a handle with unregister(), which the harness now returns. |
| 09 | Full 17 checks passed. A diagnostic panel selector was corrected to the actual recording-sheet and explicit before/after ACK sheet assertions were added before freezing source. Exact-source output is authoritative. |

Attempts 07 and 08 selected the still-incomplete cases using the recorded
filters in the manifest. Other component attempts used the default full run.
The separate desktop preflight passed on its first run.

## Limits

This establishes a reachable baseline defect and the production React commit
boundary fix. Device evidence did not identify its failed predicate, so it
does not prove this was the only cause of the Android10 failure. Synthetic
capture bytes are not valid encoded audio. No native package, GUI, ADB,
database, local audio file or microphone was accessed. No claim of native
playability, cold-start persistence or Apple pixel parity follows from this
evidence. The original Android10 in-memory File and failed-save scene were
left untouched. Independent review and a same-source isolated device run are
still required.
