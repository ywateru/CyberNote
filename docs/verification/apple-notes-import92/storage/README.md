# APP92 storage/converter phase

Product freeze `9bd6cc0f`. This is the source-independent first phase, not whole-feature acceptance. No Apple Notes, Android, microphone, GUI or package operations. Synthetic inputs only; real production Store, SQLite, managed files and archive import/export.

- `tests01`: initial 7 tests, 3 passed/4 failed because new archive plan omitted required built-in folder metadata. Retained original logs. Corrected plan includes existing built-in metadata; INSERT OR IGNORE never replaces these folders.
- `tests02`: corrected 7/7 passed, natural cargo exit0.
- `tests03`: 9/9 passed, adding raw-record inventory and missing raw-record retry checks, natural exit0.
- `tests04`: final freeze 10/10 passed, including original-order fallback attachments, natural exit0.
- `archive-regression`: directly affected existing archive suite 13 passed, 1 existing ignored subprocess worker. Parent test actually launches the worker for process interruption/recovery before and after SQLite commit. Natural exit0.

Initial compile also exposed sparse-checkout omission of five existing compile-time fixtures plus a missing BTreeMap type annotation; exact fixture paths were sparsely materialized and the source annotation corrected. No dependency or product policy was weakened. Cargo fmt's unrelated baseline changes were restored before product commit.

Coverage: additive import preserves local settings and unlocked keys; rich/schema-valid synthetic headings/marks/links/checklists/table/CID image; original dates; raw HTML/metadata separate managed JSON; source identifiers SHA256 only; duplicate retry after user edit; changed source copies without overwriting; reopen; managed inventory bytes and exportability; backup twice into a collision target plus real owner remapping and post-restore dedup; missing record cannot suppress a copy; locked/export-failed item creates no note or success record; SQL abort rolls folders/notes/attachment rows back and journal removes only this round's published files; inert script/remote resources; unplaced attachment warning and source order.

Raw records use a dedicated MIME and explicit file card. Their existing managed owner is the retry ledger: no second mutable table can drift from the target or full backup. A malformed/missing record is not accepted as success. Stable fingerprint excludes source maintenance dates, destination IDs and staging paths, and includes ordered attachment byte hashes, source hierarchy and actual content. A changed batch creates a fresh source-root hierarchy; user-moved previous copies are never taken as destination mappings. Normal archive recovery semantics are unchanged; dedicated append mode omits settings replacement and key clearing.

Pending: native read-only source worker, token/cancel/access boundary, UI/debug wiring and actual App/actual source acceptance. Converter supports the documented synthetic forms; actual Notes checklist/table/native attachment variants remain subject to research and explicit warnings, not claimed as complete.
