# SYNC87 native tool preparation: host checks pass, device pending

Date: 2026-11-06. Frozen source `7fd245ba` (initial tool `725c9b7d`).
All changes are within the assigned new native-tool/evidence paths. No product
Rust/TS, existing runtime, environment tool, main worktree or old device changed.

The final directory records eight bounded host commands with natural exit and
wall time individually. Eight Python unittest methods passed, and ten Node
identity/XML checks passed. Client/runner syntax and diff-check passed. The
old serial CLI was deliberately rejected with exit2 before ownership/ADB;
this is a rejection test, not an old-device action. Invalid request IDs and
unknown action strings were scrubbed from a process response. Final before/after
hash maps of all six source files are equal (`sourceChanged:false`).

The earlier fixture run validated all generated PNG chunk CRCs, one-second
16kHz mono 16-bit synthetic WAV with nonzero PCM, and all original file SHA256s.
The first invalid PNG constant and Python API compatibility failure are recorded
in `original-failures.txt`; they were host tool/fixture issues. The first guard
shell's overall exit0 is not treated as a Python pass. No historical failure was
replaced by the final pass.

**Device scope: entirely unexecuted.** There was no emulator boot, ADB invocation,
installation, real microphone access, CDP connection, native chooser operation,
actual native Store read/write or sync test. Existing resource state remains
stopped; the original approximately13-second unsaved recording was not read,
exported, backed up, restarted or otherwise accessed.

Root must first provide the exact new APK/root receipt and an independently
reviewed ready lifecycle window. The NDJSON session then needs actual device
validation of gallery/auto-focus/IME, chooser cancellation/multiple/continuous
attachments, image decode/info/export original-byte equality, same-data app
restart and emulator cold boot, UI pairing with a real desktop synthetic Store,
background/foreground reconnect and bidirectional note/media convergence.
`exportImage` remains explicitly incomplete for byte proof: it returns
`originalBytesVerified:false`; selecting an exact owned export destination and
pull/hash closure must be implemented against observed DocumentsUI before
claiming export pass. No prepared scenario is reported as native acceptance.

Tool usage/receipt contract and all remaining boundaries are described in
`scripts/debug/sync87-native/README.md`. Independent review remains required;
this author host result does not satisfy the review gate or fullsync goal.
