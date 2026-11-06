# APP92 actual App DOM and exact production worker

Source freezes: c5c8c72d (UI/bridge/debug/lean transport), bbb21116 (explicit nested module paths), adffa10c (cancelling heartbeat repair), 32a04a3e (DOM backup restore test). Backend build03 source inventory and immutable copied binary hash are in `build03/build.json`; the binary was copied before execution and each source/binary digest checked by the runner. No old immutable sync peer was changed.

`dom04/result.json`: **20 PASS, natural exit 0, 18.58460525 seconds**. Real bundled React App/Tiptap, UI handlers, exact production `apple_notes_import/core.rs`, actual Session/SQLite and managed filesystem ran. Only Apple Events Source, native window APIs and native file dialogs are synthetic. Tests did not call actual Apple Notes, a microphone, Android or Computer Use.

Coverage includes preview hierarchy/locked reason and no raw source IDs in HTML; rich heading/underline/link/checklist/table and original dates; distinct success/warnings/export-failure results; unchanged synthetic baseline/settings; PNG/WAV/TXT and raw JSON independent files; original PNG export byte hash; same-source dedup; cancellation; complete backup contents; same-data reopen; data-management entry/content smoke (not an exact category-byte/count assertion); full backup restoration with live attachment owners and dedup through the same production worker after restore; mobile App hides this Mac-only entry. No renderer exceptions. Runtime teardown awaited natural owned process/resource closure; runner would mark cleanup exceptions failed.

Original attempts are retained:

- build01 failed E0583 because Store's implicit child module path did not work through the lean `#[path=current/store.rs]` layout. c5c8 adds an explicit path consistent with sibling Store modules.
- build02 failed the equivalent nested `html` module path. bbb21116 adds explicit nested HTML/tests paths; no business behavior change. build03 naturally passed.
- dom01 failed before browser assertions because this sparse source checkout did not materialize existing `assets/mobile-paper-previews` assets. `git sparse-checkout add assets` restored tracked inputs; no product repair.
- dom02 passed 11 checks then its test invoked the pre-existing `archive.export` debug command while Preferences was open; native editor assertion refused the covered surface. The runner now clicks the actual backup button, calling the existing archive handler. No product access boundary was weakened.
- dom03 passed 17 checks naturally. dom04 adds full restore/ledger checks and direct panel screenshots, all 20 passed. dom01–03 stdout was visible in the tool transcript but not captured to files; result.json is original output. dom04 includes original stdout/stderr.

The independently found long-cancellation heartbeat failure is retained by the independent reviewer with the original component runner; adffa10c is its narrow fix. It is not relabelled a pass here until independent rerun admission.

Screenshots and HTML contain only explicit synthetic fixtures. Private real Notes content, actual databases, source IDs, private records and native source logs were not copied. Original PNG and complete backup files remain in the private execution directories, while checked byte/record assertions are in the result. This proves App/Store integration; it does not prove the packaged Mac's automation authorization, complete native special-object support or exact Apple Notes pixel parity.
