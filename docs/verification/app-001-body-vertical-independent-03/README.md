# Body vertical 03 independent evidence

2026-11-04. Exact reviewed candidate: `b2f3570783361a5754e3a213730a72d201ddde7a`. Product baseline: `8463ed896847f891fd4fd5579affb253a11d681b`; actual candidate parent: `4d86a7d3dc5bb421331527ab88fdf2e056cb0850`.

Decision is SOURCE-READY for the bounded Mac all-paragraph CSS candidate only. Full scope, observations and limitations are in `docs/plan/reviews/app-001-body-vertical-03.md`. This directory supplies no native or pixel acceptance.

`prepare.py` independently audits the exact eight-line CSS delta, hashes and committed author evidence, verifies production input blobs, and generates `check-pinned-render.mjs` and `source-audit.json`. The renderer derives from the reviewed author checker, with candidate CSS/schema/NoteTag pinned to the exact source, candidate identity added and only its newly created temporary cache cleaned after completion.

`run.py` performed one run. `render-command.json` preserves exact command, environment overrides, times, stdout/stderr, exit code and free space. `render-run01/result.json` preserves72 scenarios and actual production-schema DOM/style/Range/JSON/selection/object identity plus real heading transitions and a synthetic ProseMirror root widget. Chrome156 passed; six Mac pure-p cases activate the candidate; other66 scenarios remain excluded. There were no page errors or external requests.

The test uses complete production CSS and real Tiptap with the production schema in isolated headless Chrome, not the native App/WKWebView or original Notes. Attachment/drawing use default schema HTML. It does not test native input, IME, mobile behavior, storage/restart or pixels. Unknown direct root widgets can switch the guard and geometry. No GUI, ADB, native package/build, shared target/cache, dependencies or user data were changed. No staging or commit was performed.

`finalize.py` rechecks recorded results, generates `render-audit.json`, and seals owned files plus the independent report in `manifest.json`. The manifest excludes itself to avoid a circular hash. Its aggregate covers sorted per-file path, size and SHA256 records.

The evidence is already complete; rerunning `prepare.py` or `run.py` intentionally refuses to overwrite existing outputs. A new attempt would require a new owned output path and a specific unresolved concern.
