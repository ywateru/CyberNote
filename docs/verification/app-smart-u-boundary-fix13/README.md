# U-F1 / U-F2 author fix verification

Bounded task: `docs/plan/tasks/app-smart-u-boundary-fix13.md`. Base HEAD is `677e82846e854c7f55647ead979a1d0a9734b3c8`; its product baseline is `d576b50d3e72f4a85a16dcda1852c787d868d870`. The original independent review remains blocked historical evidence. Its source files, failure probes, logs and results were not edited or relabeled.

## Changes

Only the six allowed existing files changed:

- `src/smart-draft.ts`: `nextDraftRuleType` selects the first unused representable type in tags → creationDate → pinned order. Addition consumes that same helper, builds the pinned draft when appropriate and inserts after the clicked key. New keys use the current maximum plus one so immediate consecutive additions cannot collide on a clock millisecond. Other rows and token caches remain intact.
- `src/SmartFolderForm.tsx`: the Mac plus disabled state consumes that same helper. Two occupied types leave plus enabled; all three occupied types disable it. No style change.
- `src/smart-folders.ts`: combine checks its original value is a string and exactly all/any; string coercion and the return type assertion are removed. Rust validation is unchanged.
- `docs/fixtures/smart-projection09.json`: the two independently proven array-combine counterexamples are shared invalid fixtures. Two valid queries with identical tags/pinned rules and different all/any modes preserve the mixed-facts distinction. The corpus now has 14 valid cases and 12 invalid cases.
- `scripts/check-smart-contract.mjs`: adds the third-type capability/insertion/removal and unique-key assertions, plus successful supported submission after removing the date branch. Every represented type is removed/re-added in the production draft helper; unaffected rows and caches are checked.
- `scripts/check-smart-ui.mjs`: adds one actual production form scenario covering third-row pinned, insertion after either selected row, used-type options, all-three disabled, unsupported submission rejection with draft/token/name preservation and zero backend create calls, removal/re-addition, then supported real Rust save.

CreationDate/today remains draft-only unsupported. Three rows are not accepted by a relaxed persistent schema, skipped or silently saved. Removing the date leaves the existing supported tags/pinned schema and allows a real save. No Rust production code, stylesheet, Editor, media/archive/metadata/access protocol, dependency or lock changed.

## Exact source and reused runtime

Final `source-identity.json` SHA-256: `0940c3cb398ae82cf703f60136dbaa10614975d77f08f99fa7532e8dc3ce59ad`.

The manifest hashes 466 files: the prior complete 463-file product/check/corpus identity updated for the six allowed files, this new bounded runner and both original unchanged independent probes. All six new check snapshots exactly match the final manifest scope. The 125 protected `src-tauri/` product/config files are byte-identical to the prior frozen manifest. Both reused independent probe files are also compared with the exact base-commit blobs.

The existing production Session transport is reused without rebuilding or modifying it: `src-tauri/target/debug/notes-u-session-transport`, SHA-256 `943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4`. Every new runner records that same before/after hash. The existing Store/Session harness imports the same production Rust modules; its one corpus test was recompiled for the changed included JSON fixture. There was no repeated real host check, full Rust suite, full nine browser groups or platform build.

## Checks

Each attempt directory is new and refuses overwrite. The runner enforces at least 2 GiB free space, a 600-second command limit, locked/offline Rust dependencies and jobs 2. Shared host target remained author-exclusive. No new command failed; all recorded source snapshots were unchanged throughout their checks.

| Attempt | Result | Evidence |
| --- | --- | --- |
| `contract01` | 30 production contract cases passed; 0.249s | Shared valid/invalid corpus, strict entities, draft/cache/addition and projection; `contract01-results.json` |
| `contract02` | Original independent two-input probe passed; 0.246s | Both array inputs now TS `smart_invalid` and real Session `smart_invalid`; raw requests/responses in `contract02-data/results.json` |
| `rust01` | One shared real persistent Store corpus test passed, 81 filtered; 2.343s | Same 14 truth cases and 12 invalid queries, including both arrays; no Rust production changes |
| `browser01` | One expanded actual form integration passed; 2.794s | Third-type insertion/disabled state, caches and rejection, no create on unsupported submit, supported recovery persisted through real Rust; `browser01-data/results.json` and transport rows |
| `browser02` | Original independent third-row probe passed unchanged; 2.132s | Exact former failure route now has enabled plus on tags/date and inserts pinned after first row; `browser02-data/results.json` |
| `build01` | Final `pnpm build` passed; 3.411s | TypeScript + Vite bundle. Existing large-chunk advisory retained; no dependency changes |

`git diff --check` passed. Final post-manifest hash verification is recorded in `final-source-check.json`.

The original independent probes are invoked directly from their existing paths; new outputs go exclusively under this directory. The successful new runs do not change the original d576b50 blocked review or its failed `browser02`/`contract02` records.

## Limits and stop

`browser01-data/three-draft-rules-rejected-preserved.png` shows the real mounted three-row draft after rejected submission. It is a controlled headless web-shell artifact, not a native/device or pixel pass. Actual App/Editor/bridge calls the same persistent Rust Session/Store transport; only native delivery and test observation are controlled. No GUI, ADB, real user database or original Notes deletion was used.

The wider U/device/F17/product acceptance remains open, including other rules, original unproven states and exact platform pixels. This batch only resolves the two specified P2 source boundaries pending another author's independent review.

SOURCE-READY STOP: no author stage/commit. All known owned runners completed; browser runners closed their contexts/browser/listener/Vite and ended Rust child input in `finally`. The shared target is released. No further source, script, corpus or evidence writes occur after the final source check.
