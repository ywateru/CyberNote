# FORMAT102 native preselection and delayed-hold case

2026-11-10, Samsung SM-G9500 / Android9 API28. This single additional case **did not reproduce** the original r2 panel loss. No product fix was made or established. Original r2 failure remains open.

The installed close-only v2 diagnostic APK was reused without build/reinstallation: version0.1.0, APK SHA256 `42a561bbff4611738c214c7b924263e8de01f69d79af9211c1ea0053a3da8178`, source fingerprint `e47728b9654af12607d6695a70dbbd90f87f9aa1f8e4e35fc0c3b7a1c27cab25`/439. Its two previously recorded full-lint failures remain unchanged; this is a limited phone diagnosis, not final-release acceptance. New fresh-process PID was10490.

Evidence: root `artifacts/mobile-format102-native-diagnostic-v2/device-delayed-case/`, including exact `actions.jsonl`,25 foreground guards, five wait checks, screenshots/XML/IME snapshots, PID-filtered fixed-tag logs, settings comparison and `result.json` with screenshot hashes. All ADB input was preceded by a foreground guard; each dependent input was followed by observation. The original user's notes were not selected. No package build, source change, new note, text entry, deletion or export occurred.

## Sequence and results

1. The app was initially foreground. Saved original IME/rotation, force-stopped/restarted normally for a fresh diagnostic budget, then accurately selected the existing self-created v2 note whose actual WeType title is `finalAndroidIME ` (list screenshot01 and editor02).
2. Before opening format, held title at original600,670 for800ms. Screenshot03 proves a nonempty full-title selection with selection handles and the OS text menu. This preparatory selection is distinct from the one later post-panel hold.
3. Tapped actual format button115,2810. Screenshot04 shows the full panel `[0,1860][1440,2900]` and retained nonempty selection.
4. Waited five explicit29-second chunks,145 seconds total. Each chunk only checked foreground and read the current PID's `CYBERNOTE_FORMAT102:I` tag. Because tool/observation overhead also elapsed, screenshot04→05 wall time was **369.807 seconds**, not exactly145. Screenshot05 proves that the entire panel and nonempty selection were still present immediately before the later hold. No diagnostic app records occurred during this time; log files contain buffer headers, so this is zero records rather than zero bytes.
5. Title bounds in XML remained `[96,600][1344,740]`; the only post-panel hold was exactly `swipe600670600670800`. Screenshot06 shows the full panel, full-title selection and OS menu together. Its fixed-tag log still had zero app records. Thus this case had neither observed idle close nor observed hold close.
6. As separately authorized, clicked italic once at the actual button396,2396. Screenshot07 visibly shows the selected own title slanted and the I control highlighted, while the full panel remains open. The title's updated timestamp/undo availability also changed. This was an intentional real formatting mutation to the self-created note; no zero-data-change claim is made. DB export/reload persistence was not audited in this bounded case.
7. Clicked manual format close once at1288,1956. Screenshot08 shows the full format panel gone and the editing toolbar restored. Exactly one diagnostic app record was then present:

```json
{"sequence":1,"kind":"panel","open":false,"blocked":false,"authorized":true,"visible":true,"reason":"confirm"}
```

This validates that the post-close sink was active, the100-event budget was fresh, and the absence of earlier events was not an exhausted or disconnected sink. IME/default/enabled-list and rotation settings were unchanged; `settings-comparison.json` records exact equality. No further device input followed manual close.

## Remaining prerequisite differences

This case intentionally covered real nonempty preselection plus a long idle gap, using an existing note and no composition. It did **not** reproduce the original typing/WeType state. The hold was OS-injected ADB, not a physical finger. Native ActionMode/channel delivery and the exact original composition remain unresolved.

Read-only action audit confirms **no diagnostic replay has used both the exact original marker and the original uninterrupted three-command typing sequence**:

| Case | Title bytes submitted | Enter/body timing |
| --- | --- | --- |
| Original r2 | `FINAL101-Android-IME-r2` | `text`→`keyevent66`→`text alpha%sbeta%sgamma`, same exec, no intervening screenshot |
| v1 new-note case | `FINAL102-Android-IME-r3` | Separate tools with snapshots; title→Enter about129s, Enter→body about105s |
| v2 phone case | `FINAL102-Android-IME` | Separate tools with snapshots; title→Enter about182s, Enter→body about117s |
| This delayed case | No text entry; existing `finalAndroidIME ` | Real preselection and explicit145s waiting, no new composition |

The later commands are structurally related but not byte/timing-equivalent. This report does not interpret their non-reproduction as proof of a repair or as a contradiction of the original07→08 failure. Any closer composition replay requires a new explicit bounded device gate; no such extra operation was undertaken here.
