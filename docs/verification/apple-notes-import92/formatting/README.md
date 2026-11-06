# APP92 source block formatting repair

Product freeze `6febd39f`. Real02 previously proved copy/reopen/dedup/source-before-after, but a later read-only check of its private raw snapshot and target document found a genuine converter formatting defect. Source 6 div / 1 nested h1 / 4 br plus 6 outside formatting whitespace tokens produced 12 text blocks, including 10 whitespace-only blocks. Nonempty content lines, stored original plaintext, raw HTML and dates matched; this does not excuse the extra visual blank paragraphs. No real source content appears here.

All regression strings are manually synthetic. `original.stdout.txt` and `original.stderr.txt` retain the unmodified converter's **three real failing tests**, natural cargo exit101. The source fixture is six div elements, one nested heading, four explicit brs and outside LF tokens. Additional exact-schema fixtures cover explicit empty div, inline marked text with spaces, pre text/newline/tab and NBSP. A real Store copy checks raw HTML, exact stored plaintext and dates rather than recomputing plaintext from the resulting document.

The narrow fix classifies only HTML ASCII space/TAB/LF/CR/FF text as candidate formatting. It removes that token only when neighboring structural siblings are block boundaries or edges, with at least one block neighbor. Meaningful inline runs, all content within pre, NBSP and whitespace-only explicit elements remain. The neighbor scan is linear; it does not repeatedly scan long whitespace runs. No schema, plaintext, source script or target publication algorithm changed.

`fixed.stdout.txt` and `fixed.stderr.txt`: **14 affected Store apple_import tests PASS**, natural cargo exit0. Cargo compilation reported8.81s; test body0.34s. Original run exact command:

```
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path src-tauri/Cargo.toml formatting_whitespace -- --nocapture
```

Fixed run differs only in test filter `store::apple_import::tests::` to include existing affected storage/converter regression checks. Original and fixed stdout/stderr are retained unchanged. Wall-clock process timing was not separately captured; cargo-reported times above are not claimed as full elapsed time.

No Apple Notes events, real snapshot reads, Android, browser/GUI operations or package builds were performed. Target84 was checked unused before this work and explicitly released after tests; independent three-fixture review follows. Source dedup repair `bc558` was separately cherry-picked as `9f6f72af` so the branch contains the currently approved source adapter for later exact builds; it was not invoked in these tests.
