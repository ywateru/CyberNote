# SYNC87 isolated native acceptance tools

All device access is restricted to `notes-sync87-isolated` / `emulator-5584`,
resource `/private/tmp/apple-notes-sync87-environment-01`. The reviewed existing
`scripts/debug/sync87-environment/lifecycle.py` owns the emulator lifecycle.
These tools never create/rebuild userdata, execute old smoke/IME scripts,
manage the ADB server, touch another device or use a real microphone.

## Device and package ownership

`guard.py` is the only ADB entry. Every command requires explicit serial/AVD,
checks recorded emulator PID/start time/command and console listener, then
confirms guest AVD name. There is no arbitrary ADB/shell operation. App identity
includes its exact PID, cmdline and `/proc` start ticks. Forwarding rejects
existing mappings; removal requires the unchanged serial/local-port/app-PID
socket tuple, even if that app has exited. CDP rechecks the app lifetime before
all calls, selects exactly one Tauri page on that process socket, checks its
WebSocket host/port/page ID, and requires absence of `__NOTES_DEBUG__` and
browser-preview storage.

Root provides the reviewed APK receipt with exactly these keys:

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

Android build17 or newer is required. Root separately checks signing and actual
embedded frontend identity. ZIP entries must exist; frontend resources can be
inside native ELF rather than invented assets paths. Before install, start and
CDP attachment, tools recheck receipt/ZIP hashes and installed APK original
bytes against the reviewed hash. No accurate new receipt has been supplied yet.

`client.mjs` uses actual CDP Input and native taps; its scrollIntoView only
exposes actual controls. Native `load_workspace` and `read_attachment` calls
are read-only observations. It never assigns editor documents, writes SQLite,
injects metadata, calls debug objects or installs a fake platform.

## Secrets and stdin

Invitations enter only in stdin memory or the in-memory peer result. They are
never command arguments, evidence, state files or logged IPC frames. NDJSON
is capped at32768 UTF8 bytes before parsing. Invalid UTF8/JSON/schema and
oversized input emit fixed typed messages with no request identity or exception.
The stream stops at the first failure and does not read beyond a byte overflow.
Action/input-stream/cleanup failures also use fixed messages. Valid request IDs
are bounded correlation identifiers and must contain no secrets. Screenshots
are refused while any sensitive input has a value; HTML clones scrub all input
values. Raw runtime exceptions are represented only by an event/count marker.

## Preparation and execution

Host-only commands, no emulator/peer process required:

```sh
python3 scripts/debug/sync87-native/check_guards.py
node scripts/debug/sync87-native/check-client.mjs
node scripts/debug/sync87-native/check-input.mjs
node scripts/debug/sync87-native/check-scenarios.mjs
node scripts/debug/sync87-native/check-roundtrip-text.mjs
node scripts/debug/sync87-native/run.mjs --mode prepare --output /private/tmp/notes-sync87-native-new-run
```

Preparation requires a new direct output directory. It creates synthetic
PNG/TXT/one-second PCM WAV plus separate desktop PNG/WAV names and hashes.
`check-scenarios` uses pure event schemas and an explicit native-read stub, and hashes
an inert synthetic executable file **without executing it**. This is tool-boundary
coverage, never Store/socket/native acceptance. `check-input` children have no
Python/ADB executable in PATH. Original failures and final evidence are retained
under `docs/verification/sync87-native/` with separate source freezes.

After root supplies accurate receipts and the new owned emulator is ready:

```sh
node scripts/debug/sync87-native/run.mjs --mode serve --output /private/tmp/notes-sync87-native-new-run --receipt /absolute/root-apk-receipt.json --peer-receipt /absolute/root-peer-receipt.json
```

NDJSON action sequence: install, start, pushFixtures, home, createNote,
attachments, exportImage, connectDesktop, roundtrip, backgroundRoundtrip,
reopen, coldBootPrepare, [root-controlled same-data lifecycle cycle],
coldBootVerify, close. Every action accepts optional requestId. Only standalone
pair additionally accepts invitation. observe, background and foreground are
available for directed inspection. Pairing timeout is40s. Any failure terminates
with exit2; root records natural process exit/wall independently. All outputs
remain outside watched repo until processes have closed.

The actions are **implemented but not device-executed**. Android11 DocumentsUI
English/Chinese labels are explicit and ambiguous/missing controls fail. Actual
UI differences must be fixed from preserved native evidence rather than bypassing
the chooser. API30 results will not establish other OS versions or real hardware.

## Exact original-byte image export

The push guard requires a direct run-state and exact manifest path/hash. Export
preparation derives `/sdcard/Download/notes-sync87-RUNID/exports-N`, N=1..20,
creates a new directory and verifies the known filename does not exist there.
The actual system save UI navigates Downloads -> exact run directory -> exports-N;
the filename field must equal the known original without a renaming workaround.
After the real save acknowledgement, pull can read only that run/index/manifest
filename into the corresponding new local exports-N directory. It rejects
symlinks/existing output, requires expected original size, verifies SHA256 before
exclusive fsynced publication, and returns originalBytesVerified=true only then.
There is no arbitrary pull path. The earlier incomplete false result is removed;
implemented code does not imply provider byte acceptance until actually run.

## Real Rust desktop peer

Root provides a second receipt with exactly:

```json
{
  "authorizedBy": "root-sync87-peer-review",
  "binary": "/absolute/immutable/notes-current-attachment-transport",
  "sha256": "64 lowercase hex",
  "sourceCommit": "40 lowercase hex",
  "buildLabel": "build10"
}
```

Build10 or later is required: earlier build08/build09 candidates were blocked.
The binary must be direct, executable and match its reviewed hash. No build or
backend process is launched without the receipt. Its hash is checked again at
close. The peer reuses `../runtime.mjs` and `../rust-backend.mjs` from frozen
sync86-dom3352b913, transplanted by root as candidate dependency0c3de151.
The exact three-file map (including reference sync-rust-dom.mjs) is checked at
open/close and recorded; full frontend/source fingerprints are recorded before
and after. No private runtime copy or mutable external worktree is used.
`desktop-peer.mjs` opens only a new desktop-peer Store below this run output.
The runtime mounts actual React/Tiptap App DOM, registers that actual page as
main, continuously polls Rust events from every response through one sink, and
delivers notes-sync/access/metadata to the App handlers. Only those handlers may
produce quiet/access replies; this tool never invents probe/ready/access ACKs.
There is no headless_apply, temporary fake participant or database write bypass.
Runtime cleanup unregisters the actual page, stops the poller, drains events,
closes its browser/server and awaits only its own child process. Browser window,
provider and media boundaries remain simulated; this is not a native Mac app.
This candidate dependency has not yet passed build10 actual DOM acceptance.

The peer advertises the Android emulator's10.0.2.2 host alias on a selected local
service port. No VPN, tunnel or user route is changed. Invitation is held in
memory while actual mobile settings buttons pair. Mobile-created text/media are
observed through the real desktop Session. Before any next stage, roundtrip
captures the sending Store's complete document/plainText after attachment commits,
checks mobile marker plus full Chinese body or full desktop intended input, then
waits for exact receiving document/plainText equality (including attachment nodes)
plus expected media names. IDs, prefixes and media bytes alone cannot satisfy it.
The receiving desktop/mobile full-body proofs are recorded as hashes; mobile DOM
must expose the full desktop text. Missing/wrong/truncated/plain-only/doc-only
body faults and document/attachment structure changes are checked by the actual
roundtrip host-stub runner before its next stage. Those explicit stubs are never
native or network proof. Original read, export and separate
managed-file SHA256 are checked. Desktop creates text through actual App/Tiptap commands and PNG/WAV through
actual FileChooser/FileReader/attachment/document handlers backed by real Rust.
The desktop provider itself is the browser synthetic boundary. Mobile validates native original reads,
actual editor/image/audio display, then saves the synced PNG via DocumentsUI.
Peer close records PID, natural exit/signal, page error counts, dependency maps, hashes and timings;
raw stderr/request frames/invitations are never serialized.

## Foreground, restart and cold-boot boundaries

backgroundRoundtrip puts the actual app home after UI flush, disconnects its
owned CDP socket, pauses desktop service, saves a desktop update, resumes desktop
and returns the app foreground. It reconnects/reverifies PID/CDP and waits for
actual native convergence without a mobile sync_command. reopen checks a new app
lifetime on unchanged emulator data and preserved documents/attachments.

coldBootPrepare captures only synthetic note/attachment observations, closes
CDP/owned forwarding and force-stops this new app. It returns an explicit
awaitingOwnedLifecycleCycle marker. Root must then stop the reviewed old cycle
and start the same-data cold/no-snapshot reviewed cycle; this tool does not
signal an external supervisor or recreate any disk. coldBootVerify requires
changed guest boot UUID and emulator lifetime while userdata device/inode/size
remain equal, rechecks reviewed installed bytes, starts/reconnects the app, and
compares actual native documents and original media. This split is a scenario
skeleton until root performs and records the real lifecycle cycle.
