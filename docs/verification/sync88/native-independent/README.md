# sync88 Android18 / Mac28 independent exact package audit

**PASS-BOTH-PACKAGE-IDENTITY.** No blocking package identity findings. Root was sent exact Android18 receipt data immediately after audit completion; this is not native runtime or sync acceptance.

## Execution and provenance

Accepted sync87 audit functions were reused unchanged. Tool freeze `c7c6e115` changes only the docstring labels and owned temporary extraction prefix to sync88; extract-assets.mjs is byte-identical to the accepted template. Template/review hashes are retained in provenance.json. Both tool files still matched their frozen git objects after execution.

The single complete audit naturally exited0 in **9.21011975 seconds** outer / **9.142455 seconds** inner. Twelve real read-only subprocesses with exact argv, natural status, timing and stdout/stderr hashes are in run01/commands.json; raw streams and outer process metadata are retained. There was no build, signature mutation, download, app launch, installation, ADB/device operation, microphone or user data access.

Android source is `2956f8fb49d8fd5b76cdcaa8de2be82126b8cfcb`; Mac source is `cf593d6303f62469a857e09e13385651737e4aac`. Each321 input entry matches build-before, build-after, current source and the exact commit object. Both input lists match each other. Against Android17 the sole changed product input is src/Preferences.css, SHA256 `98c78d2eea6a53abe3ce7d294adafe8a565c02d0e8cf12b7aa0ed928ef0f288f`, identical to independently approved viewport88. Source identity is rechecked at audit end.

## Exact artifacts

| Artifact | Bytes | SHA256 |
|---|---:|---|
| `/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync88/备忘录-Android18.apk` |236444967|`c2c5c2ce528c83cca9bc0a31740af3614ce778a529e51df7c5554dd31718bd5c`|
| `/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync88/备忘录-Mac28.zip` |6694058|`8199b8feeccc548a08d5921f4473b50f0156661a021bc29e41f0ead95f76aa2d`|

Android native receipt entry: `lib/arm64-v8a/libnotes_clone_lib.so`, **211140864 bytes**, SHA256 `8030d033d09cbbd349726edba6ec7fb635b6c0c5ad02b060126b7c04f40992d9`. APK ZIP CRC, duplicate/path safety, ELF64 little-endian AArch64 and sole arm64 ABI passed. Actual package is com.local.notesclone, launch activity com.local.notesclone.MainActivity, versionName0.1.0/versionCode1000, minimum26/target36. Android18 is the artifact label.

apksigner verifies v2; actual debug certificate and debuggable flag remain development configuration. Actual allowBackup=false and referenced compiled backup/data-extraction exclusion XML trees match frozen sources. Signature/manifest/resource raw evidence is retained; OS backup/restore behavior is not tested.

Mac original strict codesign exit1 is preserved (`code has no resources but signature indicates they must be present`); derived strict0 is local adhoc, TeamIdentifier not set. Only the executable and CodeResources paths differ. All Mach-O sections match. Complete20775104-byte prefix equality is checked while masking only LINKEDIT vmsize/filesize and code-signature datasize; normalized prefix SHA256 `fea96cd8d9c5181c7d0de28911130c6f5765c1985772798ef7b5edb811489808`. ZIP bytes and permissions match the derived app; no notarization claim is made.

## Embedded frontend and fallback identity

Actual Mac original, Mac derived and Android native resources were bounded-scanned/Brotli-decoded. Mac and Android embedded records are identical. Three JS/CSS files match frozen snapshot bytes; HTML raw bytes differ while complete ordered parser tokens match. Actual production frontend excludes __NOTES_DEBUG__, SyntheticMediaRecorder and __DEBUG_PLATFORM__; this does not mean the development native binary lacks all debugging facilities.

| Embedded resource | Bytes | SHA256 |
|---|---:|---|
|assets/index-Cd_C-xBt.js|1085373|`9db1203eb6fdf37ceb7338541943c28671f40645ec3af453d94788f836c374cf`|
|assets/index-DZHLsM9K.css|98510|`bf15e2454e138690b79e84342f072c8333a598266c3487ba04f66c5bc75138ca`|
|assets/native-recording-access-1xHBG_Gb.js|1018|`f29d1db22ee98ad976032ae07a5b697804f747afc15056630139e2cc5ab6497e`|
|index.html|478|`7ca3f5921229c2d3de9ab52f453dcc2f62d5fecb078a16b9783bb455a6c39837`|

The extracted actual CSS retains desktop min(760px,calc(100vh…)) before the dvh equivalent, and mobile height100vh→100dvh and max-height100vh→100dvh in order. The supplemental check retains exact rules and sole changed input in product-delta.json. It performs only read-only source/previous build manifest/extracted asset checks, with no package rebuild or repeated full audit.

Original Android17 actual overflow, original UIA/public XML observation error and old packages remain preserved. This audit proves accurate artifact identity and the intended CSS made it into both binaries. It does not prove Android chooser selection, IME visibility, actual settings pairing, bidirectional text/media convergence, reconnect/reopen/cold boot, recording hardware or original Notes pixel parity. Root must issue the authority receipt; sole-device operator must perform remaining actual acceptance on isolated5584, preserving all original devices and unsaved recording.
