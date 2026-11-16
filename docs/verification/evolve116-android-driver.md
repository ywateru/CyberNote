# evolve116 owned Android driver — preparation only

2026-11-17. Base `280584f36da5826e41c37bf735b4e9e9e21bb072`, branch
`codex/evolve-116-android-driver`. This is an executor for an **already running,
foreground, installed, debuggable App on an owned emulator**, not a build,
installation or acceptance result. Real execution waits for the main thread's
112/115 integration, exact APK and resource scheduling; no further user approval
is implied. No product, old Samsung driver or build-flow change is included.

## Prepare without a device

Node 22 supplies fetch/WebSocket; no new dependency, Playwright or Tauri target
is used. `prepareOwnedAndroid(config)` and the CLI only validate the eight
explicit fields. They do not inspect the filesystem/device or create evidence.

```sh
node scripts/verification/evolve116-android-driver.mjs prepare /absolute/private/config.json
```

Config template (replace the hash with the exact scheduled APK's lowercase
64-character SHA-256; package/activity must match that APK):

```json
{
  "adb": "/Users/water/Library/Android/sdk/platform-tools/adb",
  "adbServerPort": 5037,
  "serial": "emulator-5580",
  "avd": "evolve116_api36_arm64_dc8cf7db",
  "package": "com.local.notesclone",
  "activity": "com.local.notesclone/com.local.notesclone.MainActivity",
  "expectedAPKsha": "<actual scheduled APK SHA-256>",
  "evidence": "/private/tmp/evolve116-owned-run-UNIQUE"
}
```

No inherited device, package or endpoint defaults. Extra config fields are
rejected. Do not put invitations/account credentials in config or argv.
The local ADB server port is explicit; the driver never installs or launches
anything, nor starts/kills/restarts adb. It checks the existing daemon protocol
against the local adb client's version before each device command, rejecting
an unavailable/incompatible daemon. The daemon must remain available and stable
during execution; this preflight is not an atomic reservation of that daemon.

## Scheduled module use

```js
import { readFile } from 'node:fs/promises';
import { connectOwnedAndroid } from './scripts/verification/evolve116-android-driver.mjs';

const config = JSON.parse(await readFile(process.env.EVOLVE116_DRIVER_CONFIG, 'utf8'));
const client = await connectOwnedAndroid(config);
try {
  const ui = await client.readUI();
  const settings = await client.readSettings();
  const sync = await client.readSync();
  // The orchestrator decides what non-sensitive observations to preserve.
} finally {
  await client.close();
}
```

`evidence` must be a fresh canonical absolute directory with an existing parent;
the driver creates it as 0700 or requires its existing owner/mode to match.
Symlinks (including noncanonical ancestors) are rejected. `identity.json` is
created once, mode 0600, and never overwritten; reconnect uses fresh evidence.
It contains explicit target identity, verified PID/boot ID and owned forward,
and `acceptance:false`; no note text, invitation or inherited environment.

Child processes keep HOME unchanged and explicitly use an evidence-local Android
user/emulator/AVD/key directory. AVD identity uses guest `ro.kernel.qemu` and
`ro.boot.qemu.avd_name`, never host AVD discovery, emulator-console auth tokens,
snapshots or locks. Unsupported/missing identity properties fail closed.

## Small API surface

| API | Behavior |
| --- | --- |
| `readWorkspace()`, `readNote(id)`, `readSettings()` | Read the real App's `load_workspace`; note result includes its document and attachment references. No SQL or alternate Store. |
| `readSync()` | Real read-only `sync_command/status`, with access expectation freshly read from the workspace. |
| `assertSyncIdentity({workspaceId,deviceId,peerId,endpoint})` | Require exact workspace, local device and distinct peer with exact ws/wss endpoint; peer count alone is insufficient. Call after bounded read-only polling establishes readiness. |
| `readUI()` | Read viewport/client/visual width, DPR/scale, the unique visible non-hidden/non-inert editor's document/selection/focus, format presence and App class. No visible Editor returns `editor:null`; multiple visible Editors fail with `UI_EDITOR_AMBIGUOUS`. No debug adapter or synthetic state mutation. |
| `readNativeState()` | Read guest `wm size/density/user-rotation` and `dumpsys input_method`; returns in memory, not automatically logged. |
| `click(selector)` | Require one enabled, visible, unobscured target inside the viewport; dispatch one CDP mouse press/release, with identity recheck between events. No auto scroll/retry. |
| `fill(selector,value)`, `insertText(value)` | Bounded in-memory CDP input. `fill` clicks, Ctrl+A, inserts; it does not log/persist the value or pass it to adb argv. This is data preparation, **not native IME evidence**. |
| `tap(x,y)`, `longPress(x,y,ms)`, `back()` | Android OS input, with physical guest pixel coordinates supplied from current observations; no historical WebView/keyboard offsets. Longpress 500–2000ms. |
| `rotate(0..3)` | Guest `wm user-rotation lock`; changes only this target. The orchestrator records/restores guest rotation deliberately; close does not silently write settings. |
| `createReverse({hostEndpoint,guestEndpoint})` | Explicit loopback ws/wss URLs with explicit nonprivileged ports and matching protocol/path. Uses `--no-rebind`, returns the exact mapping plus serial/package. Persist this non-sensitive return as topology evidence if used. |
| `close()` | Idempotent; blocks new operations, waits for an active operation, closes CDP and only removes still-exact owned mappings. |

Manual pairing can use `click/fill` on the actual sync settings controls;
invitation is supplied only in caller memory, never an argument to a shell or
the CLI. Read-only polling is the orchestrator's responsibility; no automatic
write retry or full scenario runner is included. Do not snapshot/log sensitive
fields or dump the caller's CDP input. This driver exposes no screenshot API.

## Identity, lifecycle and cleanup

Before creating a forward, require emulator/AVD/boot identity, a single installed
`/data/app/.../base.apk` whose guest toybox SHA-256 matches `expectedAPKsha`, one
PID with matching cmdline, and one resumed Activity matching the explicit
component. Split APKs and ambiguous resumed activities are intentionally rejected.
Then attach only the unique page of that PID's WebView, on the expected Tauri
origin and local CDP authority. A wrong WebView can require temporary forward
creation for discovery; no input is sent and only that forward is cleaned.

Every public operation rechecks AVD, boot, APK, PID, foreground and page identity.
An operation failure stops the session; no write is replayed. Concurrent operations
are rejected. If the App/PID/page changes, explicitly close and arrange a new
session after observing the new state. This is bounded preflight, not an atomic
device transaction; an external change after the check cannot roll back input.

The shared lifecycle primitive is reused unchanged. A per-UID/server-port/serial
lease lives at canonical `/tmp/evolve116-driver-<uid>-<port>-<serial>.lock`
(`/private/tmp` on macOS), mode 0700; it prevents this driver controlling the same
emulator through different evidence directories concurrently. Existing leases
are never auto-adopted/deleted. It does not coordinate unrelated external tools.

Cleanup rechecks AVD and boot generation, even when the App has left foreground.
It compares the full serial/local/remote forward tuple and exact reverse port
pair before removal. Unrelated or replaced mappings are retained; no remove-all.
If the device/boot changed or cleanup fails, close reports failure and releases
only its token-verified lease; retained mappings require main-thread review.
Timed-out mapping creation may have taken effect without a confirmed receipt;
the driver does not guess ownership, adopt an existing mapping or replay it.

## Verification and acceptance limits

```sh
node --check scripts/verification/evolve116-android-driver.mjs
node --check scripts/verification/evolve116-android-driver.test.mjs
node --test scripts/verification/evolve116-android-driver.test.mjs scripts/verification/sync108-android-lifecycle.test.mjs
git diff --check
```

Directed tests use **fake transport**, a fake adb executable and a tiny loopback
protocol fixture, never the installed adb or a real adb daemon/device. Coverage:
initial identity mismatch means zero device writes; late identity/page changes
stop input; wrong/ambiguous WebView cleanup; concurrent/closed lifecycle; lease
ownership across evidence directories; exact mapping cleanup/replacement;
invitation/error redaction and no replay; strict device-free CLI; local child
environment isolation and daemon protocol mismatch. These are executor tests,
not APK, native WebView/InputConnection, Chinese IME or synchronization acceptance.

Preparation verification actually run on Node **v22.16.0**: both `node --check`
commands passed; directed driver plus unchanged lifecycle regression tests
**29/29 passed**, zero failed/skipped (27 driver cases + 2 lifecycle cases).
`git diff --check` passed. The test CLI prepare case used an intentionally
nonexistent adb path and confirmed it created no device/evidence resources.

No real boot/install/build/IME action occurred in this preparation. Built-in
Chinese IME, FORMAT102, actual 320 CSS px, rotation/Back/gesture behavior and
recording sources remain scheduled device checks. Debug/CDP candidate evidence
does not transfer automatically to the final signed APK.

If sync uses a reverse, record guest endpoint → this serial's owned adb reverse
→ host endpoint → the independently identified peer, separately from the CDP
forward. Only existing **manual pairing without account credentials** is in the
planned scope. ADB-assisted results do not prove LAN/mobile/public connectivity,
account synchronization or account three-client acceptance.

## Incremental readUI correction after independent review

2026-11-17: independent review `b8c7afb6` identified one blocking P2: the first
`.tiptap` may belong to an earlier parked `SearchEditorHost`. The original
failure evidence `/tmp/evolve116-independent-W1xn2F/` and the review are retained
unchanged. This author correction awaits independent incremental review.

`readUI` now excludes disconnected nodes, hidden/inert ancestors, CSS hidden
visibility, display-none/zero-opacity hosts and nonpositive/absent rectangles.
Only the one remaining Editor supplies noteId, document, selection and focus;
neither noteId nor focus is used to guess or disambiguate the target. Zero
visible Editors returns null (including collection pages retaining parked DOM).
Multiple candidates fail before reading either Editor's state and stop the
driver session with the explicit `UI_EDITOR_AMBIGUOUS` code.

The fake transport's canned UI result was replaced with VM execution of the
driver's actual Runtime.evaluate expression and a CDP-style JSON round-trip.
Four added cases cover earlier hidden/inert parked hosts plus other invisible
nodes before the true current Editor, no Editor DOM, only parked DOM, and two
visible Editors sharing one noteId with only one focused. Parked/ambiguous state
getters assert if read. This remains a DOM semantics fixture, not native/React
or WebView acceptance.

Incremental commands: both driver/test `node --check` checks passed;
`node --test --test-reporter=spec scripts/verification/evolve116-android-driver.test.mjs`
passed **31/31**, zero failed/skipped. `git diff --check` passed. No large group,
real adb, App/device action, boot/install, native build or shared target was used.
