# Frozen 9c648b1f narrow host review

Core retry/resume checks pass. Two P2 test-tool findings remain; this is not complete native acceptance.

This review covers the exact frozen author client, runner, guard and original host checks at `9c648b1f`. `source.json` records their SHA256 values and exact Git-object equality. The reviewer tree required the intervening `9103a179` and `d26037bf` in addition to the five initially named changes; otherwise its runner was not the frozen runner. Local history maps those changes without editing main.

`check.mjs` executes exact extracted function bodies with synthetic host dependencies. It makes zero ADB calls, opens no device or emulator, performs no build, reads no invitations or user Store, and writes only this evidence directory. It does not execute the runner entry point. Ownership checks are a static source assertion here, not a claim of device-runtime validation.

| Process | Natural exit | Wall seconds | Checks |
| --- | --- | --- | --- |
| Independent frozen function checks | 0 | 0.028965292 | 22 |
| Existing `check-client.mjs` | 0 | 0.027443333 | 21 |

The independent checks cover a successful single read-only UIA exit137 retry; refusal after a second137; no retry for other exit, diagnostic, malformed or unrelated failures; no replay of a failing tap; early refusal of failed/ambiguous/disabled DOM targets; coordinate mapping; retained ownership validation on the guarded native path; fixed primary step logging; reopening the exact current owned synthetic note; and Store observation before opening the chooser. Both negative witnesses below also reproduce successfully. Their passing test status means the weakness was reproduced, not that the weakness is acceptable.

## P2: Home evidence can accept an invisible gallery

Frozen `scripts/debug/sync87-native/run.mjs:87` waits for gallery DOM existence, checks a two-token computed grid template, and checks the add button's own dimensions and color. It does not require positive gallery bounds or verify that the editor is hidden. The exact `home` body accepts a host fixture whose gallery is 0×0 when the add button is 56×56 and computed columns are `160px 160px`; it proceeds to the snapshot and returns success. See `result.json` finding `home-visible-assertions`.

Strengthen the assertion to inspect the visible mobile page, gallery bounds within the viewport and the hidden editor before recording home evidence. This witness concerns the assertion contract. It does not prove the actual app displays an invisible gallery.

Root has independently examined `actual-01/home.png` as a gallery. The old `home-filled.png` was reported by the author as an incorrectly named editor screenshot from a prior ratio experiment; it is excluded from this review and must not serve as formal home evidence. This review reads neither screenshot nor its DOM payload and makes no independent visual acceptance claim.

## P2: Secondary attachment diagnostics copy arbitrary guard messages

Frozen `scripts/debug/sync87-native/run.mjs:70` classifies the primary step reason using fixed strings, but copies any parsed string `error` and `message` into `attachment-guard-failures.jsonl`. The exact function records the synthetic marker `SYNTHETIC_PRIVATE_SENTINEL` passed in a guard message. `guard.py` can put up to500 decoded stderr characters in that message. See `result.json` finding `guard-detail-arbitrary-message`.

Limit secondary error/message diagnostics to fixed known classifications (including the exact exit137 case), or store a fixed unknown-error reason. Do not retain arbitrary subprocess stderr. The preserved actual failure is the fixed empty-stderr137 message and has no sensitive content. This is a logging-contract weakness, not evidence that a real invitation or other secret has been logged; pairing has not occurred in the reviewed stages.

## Preserved actual progress and limits

Only explicitly named safe files from `/private/tmp/notes-sync87-native-actual-01` were read. `actual-safe-evidence.json` records observation time, source hashes, copied-file hashes and the precise step-log prefix cutoff. The source logs remain untouched and may receive later experiments. Client events are live-log observations and are not uniquely attributed to a particular stage.

- Stage01 retry01: `install`, `start`, `pushFixtures`, `home`, `createNote`; natural exit0, 19.918746625s, recorded tool commit `febe6174`. Root's additional real new-note/IME/save evidence is outside this host review.
- Stage02 retry06: `attachments`; natural exit2, 37.573118375s. The actual step log records chooser opening then cancellation passing (3.184933458s and0.602901125s), reopening the picker passing (8.70273275s), and multi-selection failing (17.09323175s). The earlier failures are preserved in the copied prefix.
- `chooser-multiple-failure.stdout.txt` records fixed `Refused: no active owned emulator`; it is retained separately rather than treated as proof of a product attachment defect.
- Later selector/resume experiments are excluded by the exact prefix cutoff. Native multiple/continuous attachment persistence, image export, pairing, desktop roundtrip, background and cold-boot acceptance are pending, not PASS.

This evidence-only commit must not be cited as full sync87 native acceptance. The next source fix should receive a separate narrow recheck, retaining these original witnesses and actual failures.
