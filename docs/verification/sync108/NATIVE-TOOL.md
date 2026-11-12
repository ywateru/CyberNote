# Native stdio tool handoff

Status: initial implementation frozen for Mendel wiring. Node syntax checks and
rustfmt pass. No Rust compilation or native suite run has been performed by this
worktree; the shared `/private/tmp/cybernote-sync108-target` was not used. The
runner suite is an initial draft pending execution and review, not test evidence.

Files:

- `src-tauri/src/sync_e2e.rs`: actual main webview eval / existing event plugin
  transport; bounded serial stdin NDJSON; prefixed stdout replies.
- `scripts/verification/sync108-native-driver.mjs`: owned child lifecycle and
  bounded framing/request library.
- `scripts/verification/sync108-native.mjs`: initial two-desktop suite.

## Wiring patch (Mendel owns these existing paths)

Add beside the existing module declarations in `src-tauri/src/lib.rs`:

```diff
+#[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
+mod sync_e2e;
```

At the end of the normal `.setup(|app| { ... })`, after managing the Session,
media and sync states and before the final `Ok(())`:

```diff
+            #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
+            sync_e2e::start(app.handle())?;
             Ok(())
```

In `src-tauri/Cargo.toml`:

```diff
 [features]
 access-boundary-proof = []
+sync-e2e = []
```

The module additionally has the same crate-level cfg guard. Release builds
exclude it even if the feature is accidentally selected; ordinary debug builds
exclude it without the explicit feature. With both compile gates satisfied,
`NOTES_SYNC_E2E=1` is still required. No new production invoke or network server.

## Static debug build and launch

Build the frontend with exactly:

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 pnpm build
```

Then build a debug native binary with `--features sync-e2e` and embed this static
dist. Use the main agent's approved target directory/build scheduling. For a
direct Cargo build, enable Tauri's `custom-protocol` feature as appropriate to
embed static assets; do not launch the Vite dev URL. A release binary cannot
carry the driver. Record the binary, source and dist hashes and build command.
This frontend deliberately differs from production in DEV, NODE_ENV and the
debug registration gate. The native build also differs by feature, debug
assertions, and the child-only environment switch.

After the startup isolation implementation is ready:

```sh
node scripts/verification/sync108-native.mjs \
  --binary /absolute/path/to/debug/notes-clone \
  --output /private/tmp/sync108-native-FRESH
```

`--smoke` runs two-native startup/identity/cleanup only. It is not full-suite
evidence. Output must be fresh and outside the source tree. The runner copies
one binary and starts it twice with `--data-dir` and independent new roots.
`result.json` contains hashes/check names/lifecycle and immutable read-only
post-exit SQLite evidence. Raw stdout noise, stderr, request arguments,
invitations and exception messages are not recorded. Pairing strings remain
in memory only. Snapshot is blocked while the invitation DOM is present.

Optional `--build-record JSON` verifies `binary.sha256`, `sourceSha256` and
`staticFrontendSha256` against the runner's corresponding fingerprints. Without
it the report explicitly does not assert matching embedded build provenance.

## Protocol

Set `NOTES_SYNC_E2E=1` only on owned test children. stdin accepts one complete
UTF-8 JSON object per newline:

```json
{"id":1,"timeoutMs":30000,"action":{"op":"ready"}}
{"id":2,"action":{"op":"execute","command":"note.create","args":{}}}
{"id":3,"action":{"op":"state"}}
{"id":4,"action":{"op":"eval","expression":"document.querySelectorAll('input[type=file]').length","arg":null}}
{"id":5,"action":{"op":"shutdown"}}
```

Actions: `ready`, `execute`, `state`, `snapshot` with `options`, `idle`, `eval`
with bounded JavaScript expression and JSON `arg`, `shutdown`. Requests are
limited to 2,100,000 bytes including newline, expressions to 128,000 bytes,
results to 8,000,000 bytes, deadlines to 1–60,000 ms. Eval inserts the expression
directly into the native eval script and does not change CSP or use JS eval.
It is intentionally a test-only capability; callers can operate real DOM and
FileList objects and must avoid extracting or recording private keys.

stdout protocol lines start with `@@SYNC108_NATIVE@@`. The first frame has
`type: hello`, protocol 1, pid and window main. Response frames have `type:
response`, matching id, `ok` and either `value` or `error.code`. Other stdout
lines are discarded by the Node transport. Commands execute serially. Each eval
uses a fresh random event name and nonce captured only in that main webview's
closure, checks its Tauri window metadata, and returns through the existing
`plugin:event|emit` to `app.listen`. App events do not expose a trustworthy
caller window; the unbroadcast random event/nonce is the request binding.

Rust timeout stops dequeuing and requests nonzero process exit because it
cannot cancel an already active JS handler. The Node owner enforces bounded
shutdown and records any SIGTERM/SIGKILL fallback as failure. Shutdown and clean
EOF await the real `app.flush` and `waitForIdle` before requesting normal native
exit. No synthetic Session, quiet reply or business SQL writes are involved.

The draft suite covers pairing existing notes, bidirectional full Chinese body
and formatting, folder/pin/paper/tag projections, original PNG/TXT hashes,
delete/restore, actual offline process restart, concurrent keep-all through
real confirmation buttons, paused persistence/restart, and repeated sync.
Attachments currently use the existing synthetic File[] debug handler and the
real attachment/save pipeline; it does not claim OS picker interaction. This
suite still needs native execution and corrections before acceptance.
