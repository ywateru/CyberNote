# 55296767 separate text/media stages: P2 visibility findings

The new execution boundary is source-admissible, but the stages must not close the requested actual-visible-UI acceptance until the two P2 witnesses are fixed. Both new stages can write successful evidence while the observed editor has 0×0 bounds. This report does not identify a product rendering failure.

Only the delta from reviewed `406c76f7` to `55296767` is covered. Four changed files exactly match the freeze. The client, guard, normal UI helpers and DesktopPeer are unchanged from406c; `source.json` and `source-delta.patch` record the mapping and source hashes. No earlier suite was rerun.

| Host process | Natural exit | Wall seconds | Result |
| --- | --- | --- | --- |
| Independent new-stage boundary checks | 1 | 0.234911917 | 6 pass, 2 visibility witnesses fail |
| Author focused full-text convergence checks | 0 | 0.844633208 | 5 pass |

The independent fixture executes the real `textRoundtrip`, `desktopMedia`, `openNote` and `goHome` implementations. Only Store/DOM/native-read boundaries are synthetic. The `synthetic-*` directories contain host fixture outputs, never actual Android/native acceptance evidence. In particular, an `actual Android` scope string inside a copied function's synthetic output is not a claim of device execution here.

## P2 witnesses

- `textRoundtrip` opens the note through the real helper and waits for `.tiptap.innerText.includes(completeText)`. The hidden synthetic editor retains that text and reports 0×0 bounds. The stage saves state, calls the snapshot boundary and writes successful `text-roundtrip.json`; the expected rejection test fails. Neither the stage nor the helper observes editor bounds or CSS visibility.
- `desktopMedia` verifies received document, attachment IDs/owner and exact original bytes, then waits for any decoded `.tiptap img` and audio duration. A 0×0 editor with decoded synthetic descendants passes both gates and the stage writes `desktop-media.json`. The expected rejection fails. The DOM decode predicates are also not tied to the expected note/attachment identity.

The two original inputs live unchanged in executable `check.mjs`. The hidden fixtures differ from positive fixtures only in their explicit `hidden:true` editor bounds. Preserve both witnesses for the repair recheck.

Require the currently selected expected note's actual editor to have visible bounds/CSS inside the viewport. Evaluate the full text and decoded media within that same expected editor; bind image/audio elements to their expected attachment owner/identity. This tightens the acceptance proof without adding device control or data mutation mechanisms.

## Checks that pass

The focused author tests reject truncated plainText and changed document structure in both directions, rather than accepting only a marker. The independent positive text path reaches both full text proofs. Positive desktop media checks both originals by length/SHA256 through the real `assertNativeOriginal`; corrupt bytes refuse before save or snapshot. Missing image decode and missing audio metadata each refuse; wrong attachment ownership refuses before native original reads. Both new protocol actions accept only their existing action/requestId fields and refuse injected URI, path, noteId, document or invitation fields.

The new stages reuse the existing real DesktopPeer's synthetic note/media creation and native read-only Store/authorized attachment observation. The native client and guard ownership implementations are unchanged. The author names the text stage as text-only and media stage as desktop-to-Android originals; Android picker/native export remain separate and are not silently marked accepted.

No ADB, emulator/device action, actual UI, media decoder, network, microphone, invitation, user Store or main write was used. All successful function outputs are explicitly synthetic host fixtures. Actual text/media UI evidence, file selection/save/export and sync acceptance remain open.
