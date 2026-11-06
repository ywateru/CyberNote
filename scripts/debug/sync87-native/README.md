# SYNC87 native acceptance tools

Scope is only `/private/tmp/apple-notes-sync87-environment-01`,
`notes-sync87-isolated`, `emulator-5584`. The environment lifecycle is owned by
`scripts/debug/sync87-environment/lifecycle.py`; this module never boots it or
creates/rebuilds userdata. Never run the old smoke/IME scripts.

`guard.py` is the only ADB entry. Every invocation requires explicit serial/AVD,
checks owned emulator PID/start time/command and console listener against the
reviewed environment state, and confirms exact guest AVD name. It provides a
bounded operation allowlist; no arbitrary shell/ADB passthrough. CDP forwarding
requires actual app PID plus `/proc` start ticks and rejects takeover. Removal
requires the unchanged exact recorded forwarding tuple, including after app
exit; it does not remove a reused mapping. No device enumeration, server
management, microphone operation or old-device command exists.

`client.mjs` rechecks that app lifetime before CDP calls. It accepts exactly one
Tauri page in the socket belonging to that app PID, verifies the WebSocket port
and page identity, and requires absence of `__NOTES_DEBUG__` and browser-preview
storage. Input uses actual CDP Input events and native Android taps. The
`load_workspace` native IPC call is read-only observation. It never assigns a
Tiptap document, writes SQLite, injects metadata, invokes debug commands or
installs a fake platform. Native keyboard checks inspect real input_method.

Screenshots are refused while a sensitive pairing/invitation input has a value;
HTML evidence is cloned and input values removed. Invitations enter only over
stdin, never command arguments, state files or evidence. NDJSON is limited to 32768 UTF8 bytes before parsing; oversized streams stop
without waiting for a newline. JSON/UTF8/schema errors emit fixed typed messages
without request fields. All action errors also use fixed messages, never raw
exception names/messages. Valid request IDs are protocol correlation identifiers
and must not contain secrets. Runtime exceptions record only a count/event marker.

## Root package receipt

Root must supply a reviewed JSON file with exactly these fields before install
or start. The tool verifies complete APK SHA256 and each **actual** ZIP entry.
Android frontend assets can be embedded in native ELF; never invent ZIP assets.
Root separately verifies embedded frontend/resources, build provenance and signing.

```json
{
  "authorizedBy": "root-sync87-package-review",
  "apk": "/absolute/reviewed-new.apk",
  "sha256": "64 lowercase hex",
  "sourceCommit": "40 lowercase hex",
  "buildLabel": "Android17",
  "package": "com.local.notesclone",
  "activity": ".MainActivity",
  "entries": {"lib/arm64-v8a/libnotes_clone_lib.so": "64 lowercase hex"}
}
```

Build must be 17 or newer. Before start and CDP connection, `pm path` and the
installed package bytes must match the reviewed APK hash. No old16 package is
accepted. Device installation/launch remains unexecuted until receipt delivery.

## Host-only preparation

Run from this worktree, no emulator required:

```sh
python3 scripts/debug/sync87-native/check_guards.py
node scripts/debug/sync87-native/check-client.mjs
node scripts/debug/sync87-native/check-input.mjs
node scripts/debug/sync87-native/run.mjs --mode prepare --output /private/tmp/notes-sync87-native-new-run
```

Preparation creates only new host synthetic PNG/TXT/PCM WAV and metadata. Output
must be a new direct `/private/tmp/notes-sync87-native-*` directory. It does not
invoke ADB. Do not overwrite previous failed runs or evidence.

## Native session after root package review

Only while the reviewed lifecycle reports the new owned emulator ready:

```sh
node scripts/debug/sync87-native/run.mjs --mode serve --output /private/tmp/notes-sync87-native-new-run --receipt /absolute/root-package-receipt.json
```

The NDJSON stdin interface accepts `requestId` (bounded nonsensitive identifier)
and `action`. Available actions are install, start, pushFixtures, home,
createNote, attachments, exportImage, pair, observe, background, foreground,
reopen, close. Only pair additionally accepts invitation in memory. Request IDs
and operation names are logged, but arguments, invitation values, socket frames
and raw native IPC calls are not logged. Root must retain natural process exit
and wall time independently. Any failed action terminates the sequence with
exit2, retaining the original failure.

Actual UI scenarios are **prepared, not yet device-tested**. The chooser helper
has Android11 English/Chinese DocumentsUI labels but deliberately fails on
ambiguous or missing nodes. It must be adapted to observed native UI evidence
if necessary. `exportImage` currently confirms the native save acknowledgement
and explicitly returns `originalBytesVerified:false`; completing exact owned
save-directory selection, pull and SHA256 comparison is still required before
native image export can pass. `reopen` checks a new app process on unchanged
emulator data; emulator cold boot and real desktop peer orchestration remain
root-coordinated integration tasks. Pairing needs an independently running
real desktop Store/transport and uses actual settings buttons. Native receipt,
IME, OS chooser/provider, lifecycle and real sync are not established by host
self-tests. API30 will only establish Android11 emulator behavior.
