# APP92 fixed JXA source independent admission

**PASS for fixed-script source-only scope** at `b33a5838` (local cherry `a2fd6cd3`), under protocol `9a7e079d`. No blocking finding in the reviewed source-only boundary. Not native-host, actual Notes, product UI or attachment-file acceptance.

Reviewed full `src-tauri/src/apple_notes_source.js`, author's29 VM checks and syntax receipt, and canonical private protocol. Source SHA256 `dca43bc464514bb14572ce2181faf0ce11d821d76ed532512cfadee4fab5cba8`.

Independent `review-source.test.mjs` uses a new synthetic VM facade. **14/14 passed**, natural node exit0 /0.058102667s. `checks.*` and exact result retained. No real Application/osascript execution, source reads, filesystem export, device or Rust use. VM only replaces the OS boundary; actual frozen source is executed unchanged. No author test rerun needed.

Static calls are fixed `Application('Notes')`, collection/property getters and attachment `save` to one of the exact supplied `Path` strings. No source make/set/delete/move/import/show/activate, source DB/filesystem access, Notes termination, ObjC filesystem API, shell or arbitrary-code dispatch. One structured JSON argv; unknown keys/modes are rejected before Application. Requests/actual result content are private host data, not diagnostics. Error returns use finite reasons and integer numeric codes, not message/stack.

Independent checks cover unknown code/selectors and malformed paths before source calls; duplicate accounts refusal; collapse of repeated identical global folder objects; missing folder metadata with hostile error accessors; ancestry cycle affecting note readability without body access; locked-before-body and relocked-after-read; note-id mismatch before body; exact original attachment object/order and supplied paths; nullable metadata; denial abort before second save; native-10000 per-item failure;1001-attachment refusal before any save; moved-folder instability.

Protocol boundaries remain explicit:

- Path checks are **lexical absolute/same-parent/unique only**. This JS cannot prove destination freshness, ownership, mode, no symlink, ordinary-file output, file size/MIME or actual save bytes. Native host must allocate them and verify exact regular outputs. `status:ok` after a save invocation is not exported-file success.
- Scan reads no bodies; returns required hierarchy fields or unreadable affected notes rather than inventing a root. Complete hierarchy validation, duplicate note/raw output validation, opaque preview keys and account-scoped identity binding remain mandatory host validation; the VM checks do not claim real collection bridging or every source race is verified.
- Stable read compares ID/title/folder/modification date plus final lock state, exactly as protocol; no claim of whole-source byte snapshot isolation or full attachment export success. Count/string bounds are finite but host still needs bounded raw-output capture and process deadlines/cancel, killing only its own child.
- Hidden attachment paths/URL auto-download are absent. Nullable name/CID and export failure are retained for host classification. Actual Notes research still has3 failed exports and no ordinary-file success; these host tests do not expand that capability.

All source content here is synthetic. Product source was not modified by reviewer. Host/UI/source integration and actual read-only Notes→isolated Store evidence remain pending.

## Stable-ID normalization delta

`bc5585115b1eb72921e8056aa05bc80483c43b10` independently admitted, source SHA256 `6d05ee7ec69b0ac5509cfdb29fc335ae6e7c005415bbb6fe83eb715ab274843d`. Only scan row normalization changes: the first full metadata record for a stable ID is retained; exact JSON-equal repeats coalesce; any title/folder/status/reason/code difference refuses the entire scan with finite source_changed. Host strict duplicate refusal is unchanged. Scan still uses bounded raw collection and unique-note cap, no body access.

New independent VM delta7/7 natural0 (exact time in dedup.result.json): identical locked rows and identical unreadable numeric-code rows coalesce; first occurrence order; conflicts in account/folder, numeric code, lock status or title refuse scan; duplicate rows do not consume cap and unprocessed rows retain truncated=true. Original fixed-source14PASS not repeated. No Notes/osascript/Rust/device operations.

Actual first source→Store failure and the older real response's identical duplicates are separate evidence: the current attempt only reported scan-phase error without code, so its exact cause is not established by these VM tests or the older duplicate sample. This admission permits a designated actual rerun; it does not relabel the original failure as passed or claim the current failure's cause was logged.
