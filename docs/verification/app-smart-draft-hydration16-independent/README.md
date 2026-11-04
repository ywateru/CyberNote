# Smart draft hydration16 independent evidence

Scoped PASS for `src/smart-draft.ts` SHA-256 `a97480a10d85fcb50091987af187d0132608528349748f6488715988004abca6`. No confirmed P1/P2/P3 finding. Review is `docs/plan/reviews/app-smart-draft-hydration16.md`.

The source diff is one explicit persisted value → draft pinned mapping. Geometry15 files and other319 listed inputs retain their reviewed byte identities; seven canonical tools unchanged. `input-initial.json` and `input-final.json` protect320 current inputs and19 author/historical/tool files, including the original failing before evidence.

One bounded headless production-React/adapter run passes20 truth cases,16 desktop/mobile form cases and6 independent additions,329 assertions/0 failures. Added checks load the actual saved baseline adapter to reproduce false→true, reject14 invalid inputs through production validation, and exercise four desktop/mobile×false/true save-conflict retries with query/id/revision preservation. There are no page errors or external requests. Original author failure and current source hashes are checked; no product is modified to reproduce baseline behavior.

`attempt01` contains full result and desktop/mobile false screenshots; command/stdout/stderr are retained. Only isolated in-memory callbacks and production components are exercised. Remount does not prove process restart or database persistence; simulated conflict does not prove backend CAS. Actual new exact package/device/restart acceptance remains for root.

No Git, platform build, GUI/ADB, user DB, App bridge, downloads, product/tool/source changes, target/shared cache operation, stage or commit. Only owned fixture cache under this directory was written and is retained after shutdown; it is excluded from the evidence index. STOP; shared target/cache released.
