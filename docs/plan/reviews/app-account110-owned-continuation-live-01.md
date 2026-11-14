# Account110 actual same-owned continuation independent result review

Verdict: **PASS for the separately executed same-owned continuation**, with the original fresh-live03 run still **FAIL / push / NATIVE_TIMEOUT, cause unknown**. The actual receipt supports completed-Push persisted-state verification, new explicit Pull and Both, finite idle/reverse exclusion, offline-directory behavior, and normal restarts on the same reviewed product. It is not a fresh-run PASS, a new Push observation within this harness, or three-platform acceptance.

Reviewed read-only on 2026-11-14 (Asia/Shanghai). Report is left in the independent review tree. No App/device/network operation, new test, database/attachment/grant/Noise read, cleanup or source mutation was performed. The reviewer read safe result/package/tool evidence and hashed the existing executable without launching it. Owned libraries remain untouched for the parent.

## Exact result and source identity

Result: `/private/tmp/account110-device-actions-owned-continuation-01/result.json`, **2,003,633 bytes**, independently computed SHA-256 `246c0f624784e16797a9d27a871a9d5af2da482e9b3f8db099e7c6fa017a21ca`.

| Identity | Independently checked value |
| --- | --- |
| Product | `29c878108b2ea421b5e4fccd71547206071fdbfa` |
| Harness | `7d9e48285fbb80300d666981e2771b073fcb053b` |
| Harness SHA-256 | `b830a116342f1ef91d622b8bf12b1c60c9bbf321917f8c397fb6c3a6722d8334` |
| Original runner SHA-256 | `20ddcc4aab9b766990e77a703c5af77678210daf8c247b59f78bf3a1275f212a` |
| Original driver SHA-256 | `a78910f4ee8c972e27671f80458e23196ca74f0c578bbbf181b2a65bff163324` |
| Actual executable SHA-256 | `96192c49b6abcc9b689dad895203455c7ceefa713d2e17e15c7379ca85c7ef42` |
| Package receipt SHA-256 | `8f1dc6d52f00732b9e76018ef76433404e23314573e5f59efb55b7c1832c13b0` |
| Original fresh FAIL result SHA-256 | `33b8150f542aa3eab1dfce2151923837cb693191df8edc6ece9996eee00f49fb` |

Harness hash matches its reviewed Git object. Runner/driver bytes match both the original FAIL receipt and frozen product source and are unchanged in the harness source. The fixed package receipt and actual binary hashes match the result. The original FAIL result was rehashed independently and still contains that failure. The result records clean harness entry, `productAfter={head:29c87810...,clean:true}`, `harnessAfter={head:7d9e4828...,clean:true}`, and `originalResultUnchanged=true`. Initial product cleanliness/source is a mandatory reviewed prelaunch gate; no separate raw productBefore object is serialized. These are source-gate observations plus pinned code, not a claim of continuous monitoring between observations.

## Actual phases and evidence consistency

Result status is exactly `continuation-pass-original-fresh-run-still-failed`, with no failure field. All **11 checks** are pass. All **11,052 action rows** form 5,526 consecutive matched begin/returned pairs with matching device/phase/action, valid ordering and nonnegative duration. There are no failed action rows. There are exactly two sync.start requests: one Pull and one Both, both from A. No new Push is submitted.

| Phase | Observed receipt and reviewed checks |
| --- | --- |
| Completed-Push state | A2/B4 original notes checked against prior pinned semantic expectations; complete attachment/metadata/disk/production-read checks and reverse DB/blob/manual/account-staging exclusion; 13 idle samples / 5,157ms |
| Pull | One sync.start; runningObserved true; strict successful target/direction/finished receipt required by original syncOnce; full allowed/forbidden checks; 12 idle samples / 5,057ms |
| Both | One sync.start; runningObserved true; strict successful terminal required; complete union/full-byte checks; 17 idle samples / 5,086ms |
| Local edit isolation | Two existing shared notes edited locally and seven new notes created across the full continuation (Pull2/Both2/idle2/offline1); this idle phase checks local edits/new notes and unchanged peer protocol fingerprints; 6 samples / 5,096ms |
| B offline | Normal close followed by retained same directory row, expired online lease, sync unavailable and hidden summary; A then saves its offline-only note |
| B restart | Same ID/name required; complete local divergence retained without hidden transfer; 7 idle samples / 5,578ms |
| Both final restarts | Same IDs/names and complete persisted notes/attachments/local divergence; 7 idle samples / 5,616ms |

The Pull sync trace spans 67,029ms (one start, 410 status calls, 410 polls); Both spans 53,244ms (one start, 307 status calls, 307 polls). These are wrapper sync-segment elapsed times, not standalone backend/transport timings. Five ready returns correspond to initial A/B, B reopen and final A/B reopen. Seven ui.create, nine ui.edit and seven ui.attach returns agree with seven new notes plus two existing-note local edits.

All **110 verification rows** contain matching semantic hashes, two attachments, storedFilesMatch and productionReadsMatch. Every verification of each original specimen equals its prior original semantic pin. Counts are consistent with reviewed pre/post-direction execution: completed-Push A2/B4, Pull A9/B10 across pre/post snapshots, Both A15/B14 across pre/post snapshots, idle A9/B9, B-restart A10/B9, final A10/B9. These totals count verification observations, not distinct notes.

Final distinct specimen sets are A10/B9. Only A retains idle-a/offline-a, only B retains idle-b. Among shared notes, semantic hashes differ only for both-a and both-b, matching the intentionally separate local edits. Those local hashes remain unchanged through B and final restarts. All original note hashes remain unchanged throughout.

Full-data, reverse database/blob/account-staging, summary, offline identity and protocol-fingerprint assertions are supported by the reviewed source's mandatory control flow and the final passed gates. The result intentionally does not retain raw DTOs, note bodies, registry IDs, database rows or every intermediate hash. The reviewer has not independently recomputed those from owned stores or inferred past intermediate state from final data. No unstored terminal DTO or summary snapshot is claimed to have been independently observed.

## Cleanup and limits

All **five native lifecycle receipts** report naturalExit=true, exitCode=0, exitSignal=null, exit/close observed, closeConfirmed=true and no forced signals. Native cleanup is `{allClosed:true,failed:false}`. This independently verifies report consistency; the safe receipt contains no PIDs, so it is not an independent OS PID-absence check.

Absence probes: **77/77** closed, exit 0, no signals, allClosed=true and hadFailures=false. Fingerprint probes: **42/42** with the same clean lifecycle. No reader process is left unconfirmed in the receipt.

Each of the six idle windows has at least two samples, exceeds 5 seconds, and stays within its 30-second total budget. This establishes finite sampled isolation only. Historical owned Push successes and this completed-Push state check remain separate evidence; the original fresh NATIVE_TIMEOUT is not explained or overwritten. No new login/package or retry branch is represented by this harness. Archive-byte/document review can follow separately once the author prepares the safe archive; pending archive submission does not block this read-only actual-result verdict.

## Subsequent safe archive verification

Archive commit `3cc7492c64f1a6bf8308490a534791486a35c85a` adds only `docs/verification/account110/native/owned-continuation01/`. All four SHA256SUMS entries match. Its deterministic gzip has a zero timestamp and is 83,515 bytes; decompression gives exactly the independently reviewed 2,003,633-byte result, byte for byte, with the same `246c0f62...17a21ca` hash. The separate uncompressed hash pin matches. Every shared summary field and independently derived action/verification/final-note/final-attachment/probe count agrees with the full result. No second execution or cleanup was performed.

The archive README correctly separates the original FAIL, independent continuation, and later GUI work. One documentation wording correction is recommended: replace its assertion that roots remained clean at their revisions "throughout runtime" with the actual evidence boundary, namely checks before launch and after cleanup. The result/source gates do not continuously monitor Git state. This does not change the actual-result PASS verdict. Subsequent A-only owned GUI startup is a separate authorized phase and is not part of this receipt or review.
