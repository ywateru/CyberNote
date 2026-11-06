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
