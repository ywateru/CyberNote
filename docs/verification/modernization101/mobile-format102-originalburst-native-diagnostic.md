# FORMAT102 original-byte typing burst and delayed hold

2026-11-10; single explicitly authorized phone case, no further variants. Result: **not reproduced; no product fix established**. Original r2 failure remains open. Device input ended after manual close and original-settings comparison.

The already installed close-only v2 diagnostic APK was reused, without build/reinstall:0.1.0, SHA256 `42a561bbff4611738c214c7b924263e8de01f69d79af9211c1ea0053a3da8178`, source fingerprint `e47728b9654af12607d6695a70dbbd90f87f9aa1f8e4e35fc0c3b7a1c27cab25`/439. Its known two full-lint failures remain documented separately; this was not final-release acceptance. Fresh process PID13737.

Evidence root: `artifacts/mobile-format102-native-diagnostic-v2/device-originalburst-case/`. `actions.jsonl`, `typing-burst.jsonl`,31 foreground guards, screenshot/XML/IME snapshots, five wait checks, PID-only fixed-tag logs, exact settings comparison, tool copy and `result.json` with screenshot hashes are saved. No user note was selected or edited. Exactly one new self-created blank note was admitted through the normal plus button; screenshots01→02 establish this creation path. No deletion, export or settings change occurred.

The typing exception was limited to three consecutive commands in one exec. Each command had its own fresh foreground guard and timing record, without intermediate screenshot/XML, navigation or deliberate wait:

| Input | Duration | Gap after command |
| --- | ---: | ---: |
| `text FINAL101-Android-IME-r2` |1.533s |0.066659s |
| `keyevent66` |0.476s |0.062861s |
| `text alpha%sbeta%sgamma` |0.772s | immediate capture after completion |

Screenshot03 was captured by the same tool immediately after those commands. The submitted bytes match the original r2 three-command burst. WeType actually produced title `final－1AndroidIME－r2`, a collapsed caret, and the English composing string `alphabet'a'gam'ma` with candidate `alphabet啊干嘛`. This is closer to the original composition than the previous separate-tool typing, but **still lacks the original04 nonempty title selection and OS menu**. There was no attempt to manufacture a preselection.

One Back was then observed immediately; screenshot04 stayed in the same owned note and the candidate disappeared. Original blank tap120,1745 was observed separately in05. Actual format button bounds were `[32,2724][212,2900]`, so115,2810 was correctly targeted. Screenshot06 showed the complete format panel. Every dependent input after the typing burst was a separate guarded tool followed by observation.

The app then waited five29-second chunks,145 seconds explicit sleep total, with only foreground checks and current-PID fixed-tag reads. Tool/observation overhead made the measured screenshot06→07 gap **563.630 seconds**. Screenshot07 showed the full panel immediately before the hold; no prior app diagnostic records existed (log buffer headers are not app records). Title bounds `[96,600][1344,740]` contained the original600,670 coordinate.

The only hold was exactly `swipe600670600670800`. Screenshot08 simultaneously shows selected substring `1AndroidIME`, its OS menu/handles, and the full format panel. Fixed-tag records remained zero. As authorized, one italic click at396,2396 then visibly slanted only the own selected substring and highlighted I; screenshot09 still shows the full panel. One manual-close click1288,1956 restored the editing toolbar in screenshot10. Only then the sink produced its single record:

```json
{"sequence":1,"kind":"panel","open":false,"blocked":false,"authorized":true,"visible":true,"reason":"confirm"}
```

This proves an effective fresh post-close sink and no observed idle/hold close in this case. Default/enabled IME and rotation settings compare exactly equal before/after. The self-created title/substr italic change was intentional and preserved; no DB-immutability or export/reload-persistence assertion is made. Hold input was OS-injected ADB, not a physical finger.

Despite the matching original command bytes and actual short inter-command gaps, the original preexisting nonempty selection was not attained. This result is therefore a bounded non-reproduction with a recorded remaining difference; it does not retract the original r2 failure, explain its cause, or justify a speculative access/Back/timeout change. No additional native variants were run after this case.
