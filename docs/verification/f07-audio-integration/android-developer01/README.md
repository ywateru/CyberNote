# F07 + audio Android developer runtime subset

Captured 2026-11-03 16:18–16:27 UTC (2026-11-04 Shanghai). This is a limited developer check, not independent final acceptance or pixel parity approval.

## Package and source

Installed with `adb install -r`, preserving app data. Installed APK was read back and verified: 301366970 bytes, SHA256 `3edc4ad07524f630d694c0695cbde34bc4a02aa3c36f1fba0bd44a8de80574bf`. Actual build source HEAD `f4d3a0273de35e7fc4e59c595630ba76aa9a900b`; 216-input aggregate `a6b191546c39f2bf1c431e7547228a2714f79e355376a686380c89efd2299939`. Build and signing evidence is frozen in the sibling `build-candidate01` directory. Later documentation commits are not the build source identity.

Device `emulator-5580`, Android 11/API30, WebView 91.0.4472.114, PID9355. Physical size1080×2280, density440, no override. Launch was cold and successful. An immediate CDP startup read was too early and closed before readiness; a later bounded connection succeeded with PID unchanged. No observed app crash is inferred from that harness startup failure.

## Actual passed subset

The pre-existing real managed Opus/WebM attachment initially had platform duration Infinity. The card displayed `录音 · 1:06` while the actual audio element remained time0/paused. Explicit native Play advanced it to0.703411s; explicit Pause left it0.921484s/paused. The display stayed1:06 and sampled MediaError was null. This verifies finite display and original initial position/paused state for this file; null samples are not a complete platform media error history. The retained host microphone was OFF; this does not establish audible recording capture.

Native folder→list→media→list→paper navigation completed. On the paper note, native long-press selected bold Beta at39..43. More→paper sheet preserved the selection; choosing lines-small committed revision57; restoring grid-large committed revision58 and preserved selection/document. The expected paper revisions are56→58; media note revision30 remained fully unchanged.

Installation preserved the exact target note objects and attachment objects (4 notes / 1 attachment). The managed file `attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm` remained429547 bytes with SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`. Final authoritative workspace and installed APK hashes are in `result.json`.

## Observed blocker

Mobile CSS hides `.audio-expand`; actual display was none and its rectangle0×0. A single attempted native summary double-tap (two adb taps80ms apart) did not expand the audio; it focused the editor and opened the keyboard. Actual range/detail UI remained absent. The attempt and subsequent unreachable controls are preserved, not retried using DOM/CSS/state workarounds. Mobile slider and ±15s boundaries were not exercised and are not passed.

At the time of this Android run, desktop inventory had reported locked, so no Mac actions were performed in this run. Mac F07 runtime remained unknown then; later desktop availability or checks must be recorded separately.

## Evidence and handoff

`runtime-probe.mjs` observes DOM/media/editor selection and actual Rust workspace through CDP. Actions use native adb taps/long-press/double-tap/text; no synthetic DOM interaction, React mutation, editor/store mutation, or recorder wrapper was installed. `actions.jsonl` and timestamped JSON/screenshots preserve the actual sequence. No device XML was created.

Owned tcp:9227 forwarding was removed; no forwards remained at cleanup. Emulator PID3197 / session73263 retained. No uninstall, restart, wipe, data clear, permission reset, host microphone change, or source/package modification occurred. RECORD_AUDIO remained previously granted. Device handed off on paper note `1a0718dd-c71c-4192-89b6-bd58cb9ba475`, grid-large, Beta39..43, keyboard/menus closed, no recording; media last paused. Full state and limitations are in `result.json`.
