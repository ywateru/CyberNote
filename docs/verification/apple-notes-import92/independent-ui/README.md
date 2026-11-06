# APP92 UI independent review

## Original cancellation blocker

Reviewed UI source c5c8c72d23666848789bca085f121d5e635e4be0 (plus unchanged module-layout bbb21116). `pnpm typecheck` passed, natural exit 0.

The independent runner mounts the actual React AppleNotesImport component in Chrome and substitutes only its import IPC boundary. After cancel, the synthetic worker returns two cancelling heartbeats then cancelled. Original component02 naturally exits 1: only one status poll, phase remains cancelling after 1450 ms, no finish callback, no renderer error. Ignoring a cancelling heartbeat also prevents the state-dependent polling effect from scheduling its next poll, leaving import busy ownership unreleased. Both browser/server close normally.

component01 is a preserved harness setup failure: Vite default app routing served the existing main page and the component handle never appeared. No product assertion ran. The runner was corrected to custom app routing for component02.

The test uses synthetic titles/keys, no actual Notes/source/Store/device access and no Cargo build. `component02.observed.html` preserves the original failure DOM. The local vite-cache is derived and excluded from evidence.

## Repair and final UI admission — PASS

Frozen UI chain: c5c8c72d → bbb21116 (lean nested module paths only) → adffa10c (cancellation heartbeat) → 32a04a3e (DOM runner assertions only). The exact original component model, wait duration and assertions were rerun; only output filenames/source metadata changed. component03 passed natural exit 0 / 6.632019792 s: three polls, final cancelled, onFinish(false) exactly once, no renderer errors, browser/server closed. Component SHA is dcfcfb0bb63bd0eab1edb7cd31c1f2c7651cf7ce1915aa7e8be829ca4c6f79fc. The narrow fix accepts cancelling→cancelling heartbeats while continuing to refuse cancellation regression to scanning/importing and terminal regression.

Independent final typecheck passed. A fresh normal Vite production build to an owned private output passed. Existing browser production-exclusion check passed with no page exceptions: debug API absent, URL parameters cannot enable it, no four standard debug/Mock markers in three JS/HTML/JSON files. Platform OS fixture is injected by this browser check only. No Cargo target, real Notes, device, microphone or user database was used. Raw command exits/timing/stdout/stderr and bounded production summary are retained here.

Static final review covered: Mac main-window-only Data entry; pending/owned single-job protection; preview opaque selection and locked/unreadable reasons; terminal results/warnings; generation/mount rejection of late responses; original-owner/token cancellation after access change; App network cancellation/draft flush/recording and quit protection; busy cleanup; typed IPC/access-stamp rejection; production Tauri uses fixed SystemSource while debug Source exists only in the separate lean transport; frontend debug handlers remain inside DEV plus explicit VITE_NOTES_DEBUG gates. No remaining blocking finding in this reviewed UI scope. This is UI admission, not native signed-app Apple Events/TCC/package acceptance.

## Author complete App evidence audit

Independently read frozen author evidence 7342a9db + 5c596933 and final runner 32a04a3e. build03 manifests 55 backend inputs; every hash matches bbb21116 Git bytes, and build reports sourcesUnchanged with natural build exit 0. DOM04 reports 20 passed checks / 18.58460525 s, and the runner's real App/core/Session/Store assertions support rich text/date/media/raw independent files, image export original bytes, additive baseline/settings, repeat dedup, cancellation, complete backup and restore with raw owners/dedup, same-data reopen and mobile entry exclusion. Original build01/02 and DOM01/02 failures are retained; they have not been relabelled passed. The data inventory assertion is only nonempty UI content, not independent exact byte/count verification.

Embedded JXA remains b33 SHA dca43bc464514bb14572ce2181faf0ce11d821d76ed532512cfadee4fab5cba8; DOM used only synthetic OS Source and never executed this embedded script. Fixed source bc558 SHA6d05 was separately reviewed, and designated real-source integration is separate. No claim that DOM04 is a freshly rebuilt combined native binary. No claim of ordinary source attachment export success, full-library/special-object fidelity, packaged authorization, or original pixel parity follows from these checks.
