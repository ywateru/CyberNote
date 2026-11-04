# APP-002-AUDIO-CARD-01 independent verification

2026-11-04. Frozen source: `9303b48492a83ac21fe596591295d4973eb6f517`; baseline `96b226317d07877db65c6ea215bab73dd4cfb78e`. Review tree `/private/tmp/apple-notes-audio-card-review01`. This evidence supports the source/controlled-runtime conclusion in `docs/plan/reviews/app-002-audio-card-static-01.md`; it is not a platform package or original Notes pixel acceptance.

## Identity and provenance

`opening-identity.json` independently checks all 238 product inputs and all 143 developer evidence files against their manifests. Product aggregate is `5d1690457ff9dfca2905309e495a28583173e47744984087ba181a85177af295`; developer evidence aggregate is `8cf18395af1f13fb41dd5257605e40863b9c88afa96bea066bfba9c247b1063f`, manifest SHA `b8de7a70f7fc0bfc66bd49ec99a02bd434802cee9e4a2d2b7df9b53c7402f1e4`. No mismatch. Missing sparse assets were verified against their exact frozen Git object, not silently omitted. Current Rust source hashes also match developer compilation metadata. The old developer CLI was identified before any use; it was then independently recompiled from this review tree.

`rust-run01/metadata.json` records the exact offline/locked test and build commands, frozen Rust inputs and independently compiled CLI SHA `a2df38d0b246c8128985ceb911f7dc5cb25fe8745e05c4f131fdaf67d1fc14fe` (6,012,488 bytes). The difference from the developer CLI is expected from the independent build/source paths; no claim of binary reproducibility is made. `closing-identity.json` verifies the product aggregate again and all 11 copied Store/Session files, including both JSON schema/corpus inputs. Extra tests use a separate harness whose production files are identical except for one appended `cfg(test)` module declaration in copied `store.rs`. No production source, dependency, lock, or existing check script was changed.

## Independent execution

| Evidence | Result | Actual boundary |
| --- | --- | --- |
| `rust-run01/test.txt` | 47 passed, 0 failed, 3 ignored dedicated crash workers | Complete frozen Store/Session suite. The workers are invoked explicitly by parent tests; includes actual process exits at after_prepare/after_store_commit, public/journal snapshot equality, original authorization, archive and compensation contracts. |
| `rust-run01/build.txt` | exit 0 | New line-oriented CLI with real Session/Store, independently compiled offline/locked. No Tauri macro/native host build. |
| `integration-run01/result.json` and five `transport.json` | 5 passed; no pageerror/external request | Actual mounted Panel/RecordingSession, AST-extracted actual App closures, production Submission/bridge/SaveQueue, actual Rust Session/token/window owner/SQLite. Controlled hardware, React setters, Editor command host and IPC transport. |
| `ui-run01/result.json`, PNG and transport | 8 passed; no pageerror/external request | Actual Editor/React NodeView/MediaView/AudioPlayer, production bridge, authorized real Rust reads. Controlled HTML media events. 320/390 mobile and 1280 desktop. |
| `rust-extra01/test-run01.txt` | 5 passed, 0 failed, 20 additional data configurations | Independent tests written by reviewer; details below. |
| `session-authority01/result.json` and transport | 8 passed | Actual CLI sensitive reads reject wrong session/epoch/absent note epoch; invalid direct dates reject atomically. Authorized date/bytes returned by the original read chain. |
| `mac-compare01/result.json`, PNG and identity addendum | pass | Same-input actual baseline/candidate desktop components: geometry equal, compact-card PNG bytes exactly equal. One controlled Chrome fixture only. |
| `regressions/01.txt` | typecheck exit 0 | Frozen frontend types. |
| `regressions/02..06.txt` | 21 App parent, 25 attachment submission, 8 cancellation, 26 Session, 16 preview groups passed | Production source boundary regressions with the platform limitations reported in their own output. |

The five integration cases each delay microphone permission nine seconds, observe first start at `2026-11-03T15:59:59.000Z`, record 2.5 seconds, pause three days, resume 0.1 seconds and finish. Normal submission, lost first store response, two body ACK failures followed by actual Panel retry, post-ACK refresh failure, and old-target late store all retain the original date/file/operation. Four committed cases cold-open a new Rust process with a new token and return the same date/bytes. The old-target case inserts nowhere and is not reopened because the unreferenced operation is deliberately eligible for existing safe compensation. Repeat requests changing date or known→unknown conflict without changing workspace or file bytes.

The independent extra Rust probes cover:

- Eight malformed persisted public values, including booleans/containers/decimal JSON and u64 maximum: cold open followed by read/workspace reports an explicit error; all five logical tables, media bytes and existing media mtime remain unchanged.
- Seven malformed nonterminal journal values: cold open fails explicitly before cancellation; all prior logical rows and media bytes remain unchanged.
- Version 1 with missing date and explicit null, each imported twice: independent attachment/note IDs and paths, correct document references, exact bytes and unknown dates; re-export stays version 1.
- Version 2 with date zero and maximum date, imported twice: four distinct attachment paths, correct remapped references, two copies of each exact date, unchanged source rows/bytes, and version 2 cold re-export.
- Public date changed to null or another valid value while journal date stays fixed: query and cancellation both report deferred/managed_identity_changed, preserving complete Eq protection and all rows/bytes.

All first independent executions passed. There was no product defect or failed assertion to hide. The Mac comparison result's `baseline`/`candidate` object keys overwrite its initial commit-string fields through object spread; raw output is preserved. `identity-addendum.json` records the exact commit identities and independently verifies both baseline source hashes against Git. This is a fixture-reporting detail, not a product change.

The full staged whitespace check reports four raw-log whitespace lines (three final blank lines and one interleaved Rust test-status line ending with a space). These are preserved tool output bytes, not edited source or hidden test failures. The authored report, README, probes, JSON and copied source inputs pass the whitespace check when raw `.txt` captures are excluded.

## Reproduction commands

Use a new output directory, existing installed dependencies/browser, and coordinator-exclusive allocation of the existing host target. No install/download/upgrade or target copy is needed. Each output/compile/browser phase was guarded at >=2 GiB.

```sh
AUDIO_CARD_RUST_FILTER='' CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target python3 scripts/check-audio-card-store.py docs/verification/app-002-audio-card-independent-01/rust-run01

NOTES_AUDIO_CARD_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-audio-card-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-audio-card-integration.mjs docs/verification/app-002-audio-card-independent-01/integration-run01

NOTES_AUDIO_CARD_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-audio-card-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-audio-card-ui.mjs docs/verification/app-002-audio-card-independent-01/ui-run01

CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo test --locked --offline --features rusqlite/hooks --manifest-path docs/verification/app-002-audio-card-independent-01/rust-extra01/harness/Cargo.toml review_date_probes -- --nocapture

NOTES_AUDIO_CARD_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-audio-card-store node docs/verification/app-002-audio-card-independent-01/session-authority-probe.mjs

NOTES_AUDIO_CARD_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-audio-card-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/app-002-audio-card-independent-01/mac-baseline-compare.mjs
```

The two reviewer scripts have fixed fresh directory names; choose new names in copies if reproducing. Regression commands and exit codes are captured in `regressions/commands.json`. The temporary test stores here were created directly by these runs from synthetic values; no user/device database or audio was copied. All own child processes closed, host target was explicitly released to root after the closing identity check, and the pre-existing `node_modules` symlink remains. Closing free space: 5,794,025,472 bytes.

## Limits

No GUI, ADB, platform build/install, native Tauri serialization, microphone, valid encoded audio/audibility, device lifecycle or device cold start was exercised. Media input and browser readiness/progress are controlled. App saving uses its actual extracted closures, not a mounted App shell. Authority invalidation in the UI probe covers pending bridge responses; existing App teardown and actual Session prepare checks are separately inspected/tested. Unknown original recording-date semantics, long/hour duration format, dark mode, expanded gestures/menus and all original Notes high-resolution pixel parity remain unknown. Desktop PNG equality is only a regression comparison of the clone against its own baseline for one identical fixture.
