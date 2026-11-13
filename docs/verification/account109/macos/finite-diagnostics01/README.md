# Two-desktop read-only finite authentication diagnostic

Result: **both desktops connected**, with both native statuses reporting `ready`,
enabled, profile present, no error, remote online and remote connected. The
bounded diagnostic took 78,486 ms from process start through its last poll,
within the 120-second limit. Seven status changes were retained after deduplication.

Verified binary:
`artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone`, 203,095,936 bytes,
SHA-256 `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2`.
The supplied [identity-receipt.json](identity-receipt.json) records source
`39c1420d23daaa9397036d24826219e1bd2b89ff` and embedded identity. This run independently
checked the complete executable hash and receipt agreement; it did not repeat
embedded-asset verification or run a build.

[diagnostic.mjs](diagnostic.mjs) uses the existing `NativeApp` helper directly,
without importing or starting the full account runner. Its exact dependency is
archived as [native-driver-source.mjs](native-driver-source.mjs). The original
data directories were `/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a`
and `desktop-b`, with the original left/right slots. All eight inherited proxy
variables were blanked for the two child processes.

The diagnostic issued only real `account_command` status reads. It did not call
login, cancel, sign-out, enablement, syncNow or any editor/debug mutation, and did
not read/copy/clear grants. Sanitization occurred inside the webview before
status replies crossed the diagnostic pipe. Only fixed state/error code/stage/
providerReason values and status booleans were retained; no profile identifiers,
URLs, tokens, raw error messages, stdout/stderr bodies or browser data were logged.
No authentication or network error was observed.

[note-snapshot.py](note-snapshot.py) used SQLite `mode=ro` and `query_only` to read
only the original full note documents/plainText before launch and after natural
shutdown. Full originals stayed in parent-process memory; only per-note hashes
were archived. Each store originally held one note. Every original document and
plainText compared equal after shutdown. Both stores then held two notes: the
already-enabled native background runtime synchronized the originals while the
diagnostic observed status. This run claims preservation and connectivity; it
does not claim a full bidirectional attachment or account acceptance suite.

Both children closed naturally: A PID 72183, B PID 72184, exit code 0, null
signals, no forced signals. The lifecycle is recorded in [result.json](result.json).
No desktop process from this diagnostic remains running.

Fresh output: `/private/tmp/account109-desktop-real-39c1420d-diagnostic01`.
The helper, dependency source, supplied identity and results are also archived
here. No builds, Cargo target access, ADB or browser operation was used for this
desktop diagnostic. No commit was made.
