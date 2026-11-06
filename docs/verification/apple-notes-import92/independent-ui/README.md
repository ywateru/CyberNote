# APP92 UI independent review

## Original cancellation blocker

Reviewed UI source c5c8c72d23666848789bca085f121d5e635e4be0 (plus unchanged module-layout bbb21116). `pnpm typecheck` passed, natural exit 0.

The independent runner mounts the actual React AppleNotesImport component in Chrome and substitutes only its import IPC boundary. After cancel, the synthetic worker returns two cancelling heartbeats then cancelled. Original component02 naturally exits 1: only one status poll, phase remains cancelling after 1450 ms, no finish callback, no renderer error. Ignoring a cancelling heartbeat also prevents the state-dependent polling effect from scheduling its next poll, leaving import busy ownership unreleased. Both browser/server close normally.

component01 is a preserved harness setup failure: Vite default app routing served the existing main page and the component handle never appeared. No product assertion ran. The runner was corrected to custom app routing for component02.

The test uses synthetic titles/keys, no actual Notes/source/Store/device access and no Cargo build. `component02.observed.html` preserves the original failure DOM. The local vite-cache is derived and excluded from evidence.
