# Candidate02 Android developer finite controls sequence

2026-11-04 Asia/Shanghai. Build source fabafcf9723e400c67fd842f870dad9d4ae79d19, 219-input aggregate 5ca8801e643c187fe2aa2ddcae3b8ba512331a2103bb436d7731efbffc9cab69. APK /private/tmp/notes-f07-audio-android-candidate02-a50dded8.apk, 302058218B, SHA256 a50dded89fd89e58cc674564bfde5823fce00e6339ccbcfdcbc0c4e1f20b3501. Installed using adb install -r; actual installed base.apk was read back and matched size/hash. Exact installation/launch output retained in install.json. Successful COLD launch, PID10504; emulator-5580, Android11/API30/WebView91.0.4472.114, physical1080×2280/density440, no override. Existing emulator PID3197/session73263 retained. No emulator restart/wipe/uninstall/data clear/permission reset or host mic change. Host microphone remains inherited OFF; no recording capture was attempted.

All UI actions used native Android taps/long-press/swipes/back navigation; CDP only read DOM/media/editor selection and actual Rust load_workspace. No DOM click/dispatch, product/controller call, editor mutation, CSS override, platform wrapper or observer was used. The retained runtime-probe.mjs is the actual harness and actions.jsonl records native coordinates/timestamps. JSON and original PNGs are local artifacts.

The original managed Opus/WebM was used without modification: note a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3, attachment cb3fa001-9d73-4580-b959-38481fbba90b, 429547B/SHA256 cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f. Its summary displayed 1:06 while the actual main audio initially had duration Infinity/currentTime0/paused. One normal title tap exposed enabled range with max66.004 and ±15 controls; viewport remained393×751, no IME. The separate mobile arrow remains display:none by design; the tested accessible title is now the normal mobile expansion entry.

Actual native controls sequence:

- Play sample0.555184s/playing; Pause8.174468s/paused. Tool approval/dispatch timing extended this interval, so this is not claimed as a1–2s playback test.
- Range drag aimed approximately30s reached29s, with range value and actual currentTime both29; no repeat to force exact30. +15 reached44, -15 returned29, all paused.
- Native range near start reached4.6; -15 clamped to0. Native range near end reached61.3; +15 clamped actual media position to66.004. On this last seek platform duration changed from Infinity to66.004. Range max stayed66.004; native HTML range step0.05 represents the final slider value as66, within0.004 of media position. ended remained false; no full-play-to-ended acceptance is claimed.
- One title tap collapsed the detail. Range disappeared, audio stayed paused at66.004, viewport unchanged and no IME.

All sampled MediaErrors were null. Runtime exception arrays cover only the short per-probe connections; they do not establish absence of all historical media events/errors. Playback was not assessed by audible output and does not validate microphone capture.

One necessary shared-host smoke: folder→media→list→paper. Original paper note1a0718dd-c71c-4192-89b6-bd58cb9ba475 opened with its own full body and no audio. Normal long-press selected Beta39..43; More→横线与网格 hid IME and kept selection; Cancel returned Beta39..43, grid-large and keyboard closed. No style mutation or full previous paper/IME matrix was repeated. Actual Editor/View/DOM/React key identities were not measured in this finite sequence.

Before/after install and final complete target notes, attachment metadata and counts match exactly (4 notes/1 attachment). Media revision30 and paper58 unchanged, both complete JSON documents unchanged, bytes/hash unchanged. Full target snapshots are in before-install-store.json, after-install-store.json and final-store.json; result.json records exact comparisons and sampled positions.

Owned tcp9227 forward removed, remaining forwards empty; no persistent CDP observer/remote session/device XML. Final safe page: paper note, grid-large, Beta39..43, menus/IME closed, no recording/audio visible; media last paused. Formal Android handoff follows this freeze. This is finite developer runtime evidence, not independent acceptance, pixel parity, audible recording, all IME states, new attachment submission or all Notes features.
