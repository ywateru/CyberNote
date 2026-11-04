# U author verification — source candidate

Author phase for `docs/plan/tasks/app-smart-u-platform-ui09.md`. This is a source and controlled integration candidate, not native/device/pixel acceptance. No author stage or commit, no original Notes deletion, no GUI/ADB/user database access, no platform package, no dependency/lock updates or downloads were performed.

## Implemented boundary

- Strict TS physical/smart Folder branches and closed supported query schema; one legal-span projection drives membership, counts and first selection. The JSON corpus is shared by real Rust Store and TS production contracts.
- Dedicated Mac and mobile forms use independent drafts and real Rust Session CRUD/CAS. Empty selected tags are rejected; names survive draft mode toggles but presence queries persist no names. Used types are disabled in other rows. Mac `+` inserts after the clicked row using the measured menu order; creationDate/today is an explicit unsupported draft branch and cannot persist.
- Public smart Session actions and existing strict archive import/export are reachable after removal of the temporary legacy UI gate. Unknown versions/invalid entities continue to fail. O receipts, authority reads, passive metadata settings preservation and access barriers remain in place.
- Smart membership never becomes note ownership. New notes use default, move/parent targets remain physical, dedicated smart edit/delete uses definition CAS, deleting a definition preserves members and pending original note saves.
- Actual editors park through zero results, search and definition changes. A focused real composition can finish on its original editor while list/count show the current projection; access revocation still wins. Explicit import applies only a trusted successful restored selection, reusing cold-start validation; passive peer updates do not restore navigation.
- After a successful unique creation receipt but failed authority read, the form exposes a sync-only recovery view and cannot submit edited data as a second create. Unsupported-rule messages clear when the draft is corrected.

## Frozen identity

`source-identity.json` is the final author manifest. Its base HEAD is `7513095e6a12937fae275e730aa4890a4eb47b9e`; source changes are uncommitted on that documentation baseline. It hashes 463 files: tracked non-document product/config/check files, complete frontend source, the new checks, shared corpus and U transport/runners/harness. Runtime test databases and documentation are excluded from source identity. Built dist files and the transport are hashed separately.

Manifest SHA-256: `e004f398ba3ededdd0e2ff5dc1ce7984e52591c18a3f5b2e1b345624af86e45f`. The earlier candidate manifest remains byte-for-byte in `source-identity-candidate01.json` (SHA-256 `85199664bf42c226ab77df2dc2016c7ebaf7c6c302794fa4a1b1bf1abdbe8ab6`).

Final transport binary: `src-tauri/target/debug/notes-u-session-transport`, SHA-256 `943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4`. `transport-build02` compiled this wrapper against the production Store/Session modules; subsequent production Rust bytes did not change. Browser01–08 used the earlier wrapper hash recorded in each result; only the controlled wrapper gained export/import routing for the later archive case.

Final browser15 and build03 source snapshots exactly match their manifest scope. Browser14 ran all nine behavior groups before the final Mac-only margin calibration; the only differences are `smart-folders.css` and additional geometry fields in the browser check. Access01, toolbar01 and contract02 also preceded those style/observation changes. Host-check01 has identical final production Rust; the later form error-message correction, Mac margins and browser script differ. Typecheck02 preceded those corrections, while final build03 reran TypeScript compilation. Check correspondence is machine-readable in the manifest. No later production/script/corpus edits are part of this freeze.

## Final checks

All runners enforce 600-second bounds and at least 2 GiB free space. Rust uses locked/offline dependencies, jobs 2, and the exclusively held `src-tauri/target`. No old sealed D2/O ordinary evidence file changed, as recorded by each Rust runner.

| Evidence | Result | Meaning |
| --- | --- | --- |
| `browser14/result.json`, `browser14-data/results.json` | 9 passed, 0 failed; 7.684s; unchanged source | Complete behavior candidate mounted in real App/Editor/bridge and headless Chrome 156.0.8078.80, transported to persistent production Rust Store/Session; final Mac-only margin change followed |
| `browser15/result.json`, `browser15-data/results.json` | 1 passed, 0 failed; 3.008s; unchanged final source | Necessary Mac form recheck and actual final screenshots/geometry after the margin calibration; no repeated Rust tests |
| `contract02/` | 25 passed; 0.350s | Production query/entity/draft/projection contracts, including shared fixed corpus |
| `access01/` | 16 passed; 0.457s | Existing production access-response boundary |
| `toolbar01/` | 13 passed; 0.503s | Existing typed native-toolbar web boundary; not native runtime proof |
| `typecheck02/` | exit 0; 3.095s; unchanged source | TypeScript before final narrow form-error change |
| `build03/` | exit 0; 3.799s; unchanged source | Final TypeScript + production Vite bundle; existing large-chunk advisory retained |
| `host-check01/` | exit 0; 1.484s; final Rust bytes | Necessary one real host `cargo check --locked --offline --lib`; four dead-code warnings, no build failure |
| `run02/` | 12 passed, 70 filtered; 5.469s | Supported smart Store/Session paths, shared corpus, public CRUD/CAS and archive |
| `run03/` | 78 passed, 1 failed, 3 ignored; 4.362s | Full real Store/Session harness; one old frozen-ciphertext fixture path was missing in the new harness |
| `run04/` | that one test passed, 81 filtered; 2.513s | Added the harness `../docs` fixture link, then reran only the failed frozen-ciphertext test; no production fix or repeated broad suite |

Together run03 + run04 cover all 79 non-ignored Store/Session tests successfully. Run03 remains visibly failed and is not relabeled as a clean single run. The three ignored subprocess-worker tests retain their existing status.

The final browser groups exercise:

1. Mac default/empty warning/cancel, draft tag cache, unsupported date rejection then supported pinned conversion, single create under double click, real count/list update.
2. Mac edit CAS conflict, explicit latest-definition recovery, cancel, zero/return with same Editor and Undo.
3. Global search/cancel, smart exclusion from move targets, definition removal back to physical source, new note in default without tags/pin.
4. Mobile filter ×/Back rollback, condition check without entity write, upper check with a single actual create.
5. Actual compositionstart, Chinese replacement inside a committed tag, true zero list/count with same editable Editor/DOM and pending original owner, actual compositionend/final transaction parking, ACK and Rust authoritative no-tag document.
6. Peer definition change during composition with held real save response: same editor/Undo, byte-identical local settings, true list, pending preserved until completion/ACK.
7. Committed creation followed by controlled read-delivery failure, sync-only retry and exactly one persisted definition/create request.
8. Smart cold selection, explicit real archive import restoring transaction-remapped IDs, failed missing archive without navigation change, unknown saved folder falling back to default.
9. Unique pinned result unpin returning to physical source; current definition removal while save response is held preserves same editor, original physical owner and pending content through ACK.

## UI candidate captures and limits

Final Mac images are `browser15-data/mac-default-form.png`, `mac-empty-warning.png` and `mac-tags-pinned-form.png`; the unchanged mobile hierarchy is captured in `browser14-data/mobile-filter-tags.png`. They contain no earlier unsupported-native-toolbar transport banner. They are browser layout artifacts at desktop 1280×900 or mobile 390×844; navigator.platform is explicitly Linux so the web shell is tested. They do not prove native macOS toolbar binding, Tauri IPC delivery, device keyboard/safe areas, actual mobile runtime or zero pixel difference.

The Mac candidate uses the measured half-scale hypothesis, not a demonstrated point/pixel conversion. Checkbox x is dialog left +21 CSS px and description x is +43 CSS px. Relative to dialog top, name input is 55 CSS px (source border 110 image px), checkbox is 96 (source 192), combination is 146 (source 292), first rule is 197 (source 394), second rule is 239 (source 478), with 42 CSS px pitch. Description box y is 116 while the original glyph-ink y is about 116.5 under this mapping; these are different measurement primitives. Title box y is 21 and original title ink starts around 22.5. Selectors are 25 CSS px tall versus a half-scaled 24 image-pixel-derived candidate, and the two-row dialog is 337 CSS px versus about 335 under the candidate mapping: the remaining 2 CSS px difference is explicit. Browser15 records the full DOM geometry. A matching original/clone native capture pair remains required.

Unfinished capability/UI items remain explicit: full date controls and other local rule types; exact native/mobile pixel validation; original mobile upper-form and ×/Back behavior evidence; original smart-delete/reference confirmation behavior; original mobile folder context preview-card/grid appearance (the existing context menu remains). All three available draft types being occupied currently disables further `+`; that is a temporary local capability limit, not an original Notes claim. No F17 or overall product acceptance is closed here.

## Retained attempts

- An early unlogged typecheck exposed new integration type errors, fixed before the recorded passing checks. `typecheck01` passed but its source hash changed while Rust formatting ran; it is not frozen verification.
- `run01` failed compilation because a new test used `unwrap_err()` requiring Folder Debug; the assertion was narrowed to inspect the error without changing the production type.
- `browser01` passed the first three desktop groups, then used an ambiguous mobile `#A` locator. `browser02` selected a Mac platform in a transport without native notes-ui binding, yielding an error banner. The locator was scoped and platform explicitly made Linux; `browser03` passed mobile.
- `browser04` invoked scheduled Editor focus then mutated before the DOM actually received focus, so its retention premise was absent. `browser05` completed an entire-document selection with empty composition data and did not satisfy the existing actual-completion range proof. Synchronous DOM focus and a real Chinese tag replacement produced `browser06` pass; no production bypass was introduced for these fixture failures.
- `browser07` passed peer composition; `browser08` passed unique-receipt recovery.
- `browser09` injected an observation property referencing `archive` before initialization. The hook became a deferred closure. `browser10` expected old IDs after importing duplicate archived IDs; the existing transaction correctly remapped them. The assertion was changed to authoritative imported settings, and `browser11` passed. `browser12` passed only-pinned/pending deletion.
- `browser13` passed all nine groups. Visual review then found a real draft-error-clearing omission: after replacing the rejected creationDate row with pinned, the old unsupported message remained. The shared form draft setter now clears that message; browser14 verifies the correction and all groups on final source.
- `build01` passed before the narrow form-error correction, and build02 passed after it. Root then identified cumulative Mac vertical spacing drift in browser14. Using the same 1:2 candidate mapping, only the title-to-name, checkbox-group and combination margins were adjusted; browser15 verifies that form and captures the resulting 55/96/146/197 CSS y offsets. Build03 is the final production bundle. This pure style calibration did not repeat Rust tests or broaden behavior claims.

All attempt directories, logs, controlled transport rows and isolated SQLite/backup fixtures are retained. Browser runners close their owned contexts/browser/listener/Vite server and end the Rust child input in `finally`; all known author tool sessions have completed. The author releases the shared host target at SOURCE-READY STOP and performs no further source writes, staging, commits or device work.
