# APP92 storage/converter independent review — blocked freeze

Reviewer inspected product freeze `9bd6cc0f874b34c6b2c10f51f8f7c9e82ba6cba1` (local cherry `764cbc9d`). No real Notes/source data, devices, microphone, UI or package operations. Synthetic inputs only, production Store/SQLite/managed attachment files. This is phase1, not Session/native/UI acceptance.

## Actual checks and original failures

`checks01` cargo exit101: this sparse review checkout omitted four existing compile-time archive fixtures. No assertions ran. Materialized only the tracked fixture directories; retained original stdout/stderr. No product correction.

`checks02` cargo natural exit101: 3 passed, 2 failed, 1 ignored subprocess worker. Parent actually invokes the ignored worker twice and verifies process exit77; it is not skipped crash coverage.

- PASS: existing note/full workspace/settings/open key survive SQL-trigger failure; no incoming managed files remain; retry succeeds and preserves settings/key.
- PASS: source attachment name `../../outside.txt` and source id `../source-id` cannot choose managed paths; actual managed bytes are readable and no outside file appears.
- PASS: real child process death at dedicated append's shared `before_commit` and `after_commit`; reopen finds respectively zero/one committed notes and raw records, no orphans, preserved settings. Retry respectively imports/deduplicates.
- **P2 BLOCK**: `<p>普通正文</p><svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0L1 1'/></svg>` loses SVG entirely, yet actual Store result is `imported` with no warnings. Independent assertion expected `imported_with_warnings`.
- **Same P2**: `<p><u>应保留下划线</u></p>` loses underline with no warning, although current Editor schema has an underline mark. Preserve supported semantics or explicitly report loss; raw retention alone cannot justify complete-success UI.

Both counterexamples exercise `Convert::nodes` default semantic pass-through, not source-adapter behavior. Original author notified to make a narrow conversion/reporting repair. Actual source checklist/table/native-object compatibility remains unverified; these are controlled synthetic counterexamples.

## Static review boundaries

Dedicated `append_only` omits settings UPDATE and key clearing, preserving normal backup-import behavior. Current archive validation, non-replacing managed file publication and journal recovery remain shared; incoming paths/IDs are generated. Raw records are explicit managed JSON file attachments, not SQLite blobs or an independent success table. Raw fingerprint excludes dates; real owner metadata plus valid readable raw determines retry. A changed-content batch creates new hierarchy; an all-existing batch creates none. Source key account scoping must still be supplied by the future fixed source adapter; phase1 receives a source id string. Session authorization/cancel/draft/recording gating, export-file sniffing/ownership and source-worker confinement are later stages, not claimed here.

## Reproduction and fixture integrity

`review-tests.rs` is the independent fixture. For this run only, appended the following test-only include to `src-tauri/src/store/apple_import.rs`, then restored the product file byte-for-byte before evidence commit:

```rust
#[cfg(test)]
#[path = "../../../docs/verification/apple-notes-import92/independent-storage/review-tests.rs"]
mod independent_review;
```

Exact cargo command/target/duration/exit are recorded in the result JSON. Target84 was used only after author explicitly released it, and released after this run. No broad suite rerun. Author test evidence is distinct and not used as substitute for these results.

## Narrow repair recheck

Product repair `9f1eb115793c02144ea2a6e52eed08c4c4061554`: maps `u` to schema underline; unsupported semantic tags/objects and CSS now emit fixed warnings. Static delta leaves Store/file transaction code unchanged.

`repair03`: **3 passed, natural cargo exit0 /12.677661542s**. Original SVG and underline assertions in unchanged `review-tests.rs` pass. One added `review-css-tests.rs` case covers font-size/font-family/text-align and checks actual managed raw JSON preparation retains exact original HTML. No repetition of unchanged passed transaction/crash/path tests.

First attempt to write the repair harness failed before file creation/cargo because cherry-pick reapplied the sparse exclude to evidence; materialized only this evidence directory, then ran `repair03`. No product/runtime assertion was bypassed. Test-only includes restored after run. Target84 released. Original `checks01` and `checks02` failures remain intact.

**Phase1 admission: PASS after narrow repair.** This covers source-independent Store/converter and existing journal integration only. Fixed source worker, host ownership/regular-file validation, Session gates, UI, actual Apple Notes and final package acceptance remain separate pending stages.


## APP92 real-source spacing finding: independent synthetic repair admission

**PASS for 6febd39f2219f716eb0ada1d02ec407b6e62f86d.** Frozen independent fixtures dc312b33 + b7196467 were executed unchanged. Fixed converter/prepare: 3 passed, natural cargo exit0 /13.570975541 s. A distinguishing control then temporarily restored only the prior converter html.rs and reran the exact same fixtures: 3 failed, natural exit101 /2.736313583 s. Every temporary include and converter change was restored; Git product bytes match frozen6feb. No real Notes/source, device or user data was read. Target84 was exclusively handed over and immediately released after these checks.

- Six div /one nested h1 /four br /six outside ASCII newline tokens: old converter produces12 blocks where6 required; fixed produces exactly6, heading level1, matching ordered text and4 hardBreak nodes.
- Explicit empty div/br/inline spaces and bold: old converter produces7 blocks where4 required; fixed retains explicit empty paragraph, hardBreak nodes, exact inline spaces and bold.
- pre and NBSP: pre text remains exact, including leading/internal spaces, newline and tab; separate explicit NBSP div remains content. Old converter additionally inserts formatting paragraphs (5 vs3); fixed has exactly3.

Each fixture also calls actual prepare_one, decodes the separately managed RawRecord bytes, verifies valid source/content fingerprint, exact original HTML/plainText and unchanged dates. The repair changes only sibling ASCII whitespace admission and adds regression tests; it does not change raw creation, fingerprinting, plaintext/date handling, managed files or warning insertion. Static review confirms skipped candidates are only text tokens of space/tab/newline/CR/formfeed and both neighboring non-format siblings must be structural blocks or an edge with at least one block. Explicit elements and NBSP never qualify; direct pre content is excluded. Unknown tag/style warnings remain on the original nodes path, not bypassed by this filter. No remaining blocker in the assigned real-note simple block-formatting repair scope.

Execution order was fixed PASS first, then prior-code failing control; filenames preserve that order rather than pretending an earlier baseline run. Initial independent fixture draft accidentally contained only3 br despite its4-br assertion; this was corrected before any execution by b7196467. No fixture failure was counted as a product defect.

Real02 worker copy/reopen/retry/source-preservation evidence remains separate: its worker PASS did not prove document spacing fidelity. These synthetic checks do not establish packaged Apple Events authorization, complete source rich-object coverage, actual source attachment export, or pixel parity. Final mainline assembly/build and private retained-snapshot conversion are separate root-managed gates.
