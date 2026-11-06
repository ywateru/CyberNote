# SYNC87 native text-convergence assertion repair

2026-11-06. Author source `cb202998a12231b6526b94c2e9348856d6c4e577`, review baseline `d122daf3`. This repairs only the P2 host acceptance-tool finding in the independent completion review; no product/body-loss claim is made. Source changes are limited to scenarios.mjs, its README contract, and the new check-roundtrip-text.mjs host runner. No shared runtime/dependency file changed.

## Changed acceptance boundary

Each direction captures the actual sending Store's complete document/plainText after attachment commits. Mobile source must exactly contain its run marker, newline and full `Android真实输入与保存`; desktop source must exactly contain its marker and complete ` desktop real Session input` suffix. The capture deep-clones the complete document, including attachment nodes and attributes, so later source mutations cannot silently change the expected value. Absent sending entity, absent document and incomplete intended source text reject rather than establish an empty baseline.

The receiving Store must then expose the same note ID, full plainText equality and deep structural equality of the entire document, plus expected media metadata. Missing text/document, marker-only prefixes, incorrect/truncated text, plainText-only/document-only corruption, changed structural nodes and missing attachment document nodes cannot satisfy the gate. The normal bounded wait permits transient incomplete propagation to settle. Existing media original-byte checks and exact attachment identity remain in place. Only after mobile-to-desktop full equality may desktop creation begin; only after desktop-to-mobile full equality may native original reads/display/export begin. Mobile editor display now checks the entire expected desktop text rather than only its marker. Successful future native result records hashes of the actually matched full body/document for both directions.

## Necessary host validation only

Frozen source was committed before the recorded tests. Exact argv/stdout/stderr, natural exits, complete subprocess wall times and all native-tool/shared-dependency file hashes before/after are in processes.json. Before/after maps are equal.

- New complete-text runner: **43 assertions, natural exit0**, complete outer wall **3.921447792s**. It tests the real exported roundtrip function with explicit host workspace/media stubs. Nine corrupt receiver variants run in each direction: missing plainText, missing document, empty, wrong, truncated, plainText-only truncation, document-only truncation, changed document structure and missing attachment nodes. Each actually reads receiving workspace and must reject before its next acceptance stage. The mobile failure cannot reach desktop create/media verification; the reverse failure cannot reach native original read. An exact-body positive reaches a deliberate host sentinel before native operations. A transient marker-only receiver must wait for the full source snapshot.
- Existing scenario boundary runner: **33 assertions, natural exit0**, complete outer wall **0.504515625s**. Receipt/dependency/path/hash/actual-page admission boundaries remain intact.
- Both affected JS syntax checks and git diff whitespace check naturally exit0.

All311 tracked product/native/config/plugin files mapped in unchanged-product-map.json match their exact d122daf3 baseline bytes. Three shared runtime/transport/reference dependency files still match3352b913 through the existing scenario check. The prior82 host checks, independent guard9 checks and candidate build10 single-DOM10 results remain historical; they are not relabeled as having exercised this repair.

## Preserved review and limits

The original independent counterexample and BLOCKED report remain unmodified in completion-tools-independent/ and docs/plan/reviews/. The counterexample documented an acceptance assertion gap, not actual product body loss. This author result awaits the independent narrow re-review and does not change that gate by itself.

No Rust process, backend receipt, browser/DOM, socket, emulator, ADB, native CDP, APK installation or microphone was used in this repair. No actual native roundtrip, foreground restore, restart, export chooser or cold boot is claimed. Original mobile data/roughly13-second unsaved recording remains untouched. Root requires final backend11 and final merged APK provenance for future native execution; candidate build10 smoke was not repeated because no runtime/transport wiring changed.
