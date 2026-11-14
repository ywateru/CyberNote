# Account110 owned push continuation independent review

Verdict: **APPROVE** `da44bc51ca5e35e75e19b0963c7193a5120cd61e` for the bounded external-harness diagnostic described by the parent. This approves the harness, not a live result or acceptance. Main remains frozen at clean `29c878108b2ea421b5e4fccd71547206071fdbfa`; review writes are confined to the independent review tree.

The exact commit adds only `account110-push-continuation.mjs` and its device-free test. Independent `node --test scripts/verification/account110-push-continuation.test.mjs` completed **11/11 PASS, zero failed/skipped** on the exact committed bytes. No App, network, Cargo, target, database, grant or Noise operation was performed. Package verification below reads the artifact bytes without launching it.

## Execution and output boundaries

The CLI accepts only `--run --output` with a fresh fixed-prefix `/private/tmp` destination. Source HEAD/clean status, original failure hash, original runner/driver bytes, fixed package receipt and actual binary hash are checked before launch. Both input directories must be the fixed existing owned fresh-live03 A/B real nonsymlink directories. The original result is checked again after cleanup; source changes or cleanup failures prevent success.

Normal restore is used; there is no SignIn, credential copying, account enable, content creation or retry branch. Restoration requires ready/enabled profiles and an available peer, checks same-account subject in memory, and stops on error/authorizing. Before push, each original-origin specimen is located by its whole semantic note hash (including full document), and both attachment types are checked by disk bytes and production read_attachment bytes. Only booleans/counts are added to verification output. The pinned prior contains four specimens and eight historical content verifications; historical observations are not reclassified as new observations.

The facade delegates to the original unchanged syncOnce exactly once with direction push and the restored B target. It adds fixed sync.start/status/poll trace labels, without passing timeout overrides or altering the native expression or command. The existing driver request deadline and syncOnce's existing 200000ms observation budget remain unchanged. Start ACK, running observation and strict successful terminal receipt retain separate meanings. A timeout stops the continuation and closes owned clients; it never resubmits push. A running action at a timed-out IPC boundary remains uncertain, not declared cancelled or successful.

ActionTrace saves a finite begin record before invoking the traced request; a rejected begin save prevents that invocation. The 8192-record capacity is checked before the action. Trace fields contain fixed device/action/event labels, numbers, safe failure code and a finite native phase; they contain no expression, arguments, returned payload, error message or native diagnostic object. This is a completed writeFile-before-dispatch ordering guarantee, not an fsync/power-loss durability claim. Construction itself starts the native child before its ready call is traced; the one-push command is still gated by its own saved begin record.

Restore/status observations pass validateObservedStatus and safeStatusSample's strict full-schema validation and explicit projection. syncOnce statuses also pass the original strict parser, followed by safeStatusSample validation before storage. Unknown/raw data is never copied as a report fallback. Error receipts and cleanup use existing safe projections. Cleanup has lifecycle receipts from closeNativeClients; the declared cleanup.close action label is not actually emitted by this implementation. Completion is labelled single-push-succeeded-not-acceptance, never three-direction acceptance. The wrapper does not perform post-push full convergence verification.

## Independently checked identity

| Input | SHA-256 |
| --- | --- |
| Prior fresh-live03 result | `33b8150f542aa3eab1dfce2151923837cb693191df8edc6ece9996eee00f49fb` |
| Fixed package receipt | `8f1dc6d52f00732b9e76018ef76433404e23314573e5f59efb55b7c1832c13b0` |
| Actual same-package executable | `96192c49b6abcc9b689dad895203455c7ceefa713d2e17e15c7379ca85c7ef42` |
| Original device-actions runner | `20ddcc4aab9b766990e77a703c5af77678210daf8c247b59f78bf3a1275f212a` |
| Original native driver | `a78910f4ee8c972e27671f80458e23196ca74f0c578bbbf181b2a65bff163324` |
| New continuation harness | `639dc050cc7ddcb2be42c59671dae9146f4840528916473974dee35c3dd9eeb2` |
| New device-free tests | `0fed8b38b0dd59e84a8c76ed05789c0bfad9969260054bb191348f8e1fdd75cf` |

The prior still reports fail / push / NATIVE_TIMEOUT with allClosed. Runner/driver hashes match both that prior and committed source 29c87810. The imported SDK-diagnostic status helper also matches frozen source byte for byte. The package receipt names that same source and its actual executable matches its binary hash. The author tree's two reviewed files match the exact commit, and no imported runner/driver/status-helper changes occur between frozen source and the harness commit.

The 11 fixtures cover fixed arguments/labels, begin-before-call ordering, failed begin persistence and capacity rejection, finite error/phase projection, each of the three syncOnce IPC timeout boundaries without retry, successful terminal handling and failed terminal rejection. The reviewer ran only these synthetic device-free fixtures. No original failure, owned store, main source or live output was changed. There is no remaining review blocker for this exact harness; real execution remains separately controlled by the parent.
