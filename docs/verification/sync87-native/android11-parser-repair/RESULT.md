# Android 11 native guard parser repair

Actual first-stage runner exited 2 before home/createNote. Guard install required exactly `Success`, but the real owned Android installer returned `Performing Streamed Install\nSuccess`. Independent read-only installed check rejected Android 11 randomized `/data/app/~~token/com.local.notesclone-token/base.apk` paths before reading/hash-checking the installed APK. The original failure and fixed-command diagnostic are preserved here. These are host parser defects; no product claim is made.

Minimal repair accepts exactly the two known successful installation stdout formats. Installed APK parsing is now stricter: one optional `~~token` parent, exact package name plus installation token, and only `base.apk`. No traversal, other package, split APK, extra path, multiple lines, shell suffix, or empty randomized token is accepted. Reviewed receipt, APK/entry hash, device ownership, AVD/PID and full installed-byte hash checks remain unchanged.

Twenty host-only guard tests pass, including actual positive strings and malformed/failure/path negative strings. All subprocesses are forbidden in the unit runner. Actual acceptance is paused until independent review of this frozen repair.
