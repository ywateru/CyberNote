# Window activity deferral: developer self-check

Only toolbar.m changed relative to the preserved b6bb05d failure package. Window key/resign notifications capture their active value, enqueue on the main dispatch queue, retain only a weak controller and check !disposed before calling send:. Existing send suppress/disposal guard and Rust label/binding validation remain in force. No App, Editor, store, lock, Android or File menu changes.

Build: pnpm mac:build exit0, default features []; frontend build and Rust native host compiled. Build identity and all 98 production input hashes are retained beside this report; source inputs unchanged after build. Executable SHA256 ec1cf0d829b03f4b234d982c3d28af22ba401cf1549d47e6cba2baf7f4efb61e. The actual app bundle executable was launched with RUST_BACKTRACE=1, stderr captured in process.stderr.log. The GUI was exercised through CUA, not injected events or direct destroy calls.

Observed passes in this developer check:

- With main and independent daily TODO windows present, independent editable body clicked, one Cmd+W closes that independent window and shows the surviving main window. cmdw-body-before/after AX and raw images retained. Read-only process/window check confirmed PID91995 still alive, main window67001 on screen. stderr0 bytes.
- Reopen independent note through real context menu; actual File menu 关闭窗口 (performClose:) clicked; independent closes and main remains. file-close-independent-after retained.
- Reopen independent note; switch to main through actual Window menu; CmdShiftF focuses real native search text field; Cmd+W closes main and exposes the retained independent daily TODO. search-close-main-before/after retained. No text edits introduced.

Limits: these are developer checks of three actual close paths, not independent acceptance. No pending-save branch, failure/conflict guard, or cold-reopen save claim. No actual marked IME in this iteration. The focused search screenshot exposes a separate visual defect (placeholder overlaps magnifier and rectangular focus ring); visual parity remains failed and is not covered by this lifecycle fix.
