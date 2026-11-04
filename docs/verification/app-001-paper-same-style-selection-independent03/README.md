# Same-style paper selection03 — independent evidence

2026-11-04. **SOURCE-READY** for App SHA256 `6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4` with fixed CSS `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`. Detailed reasoning and limits: [independent review](../../plan/reviews/app-001-paper-same-style-selection03.md). Rounded CSS acceptance is inherited from its separate completed review, not repeated or expanded here.

`source-identity.json` freezes 209 audited inputs, three supplemental actual dependencies/fixture, baseline and candidate hashes, 38 verified author evidence files and exact harness adaptations. A private temporary fixture isolates production source from other writers. `baseline-App.tsx` is the exact historical baseline. No live shared product file is changed.

- `baseline01/`: old actual App trace reproduces both first-current-plain and first-change-grid key/editor/selection/history loss. Observe-mode exit0 means successful observation, not product pass.
- `candidate01/`: eight actual selections with exact action increments, real state preserved; cancel/Escape/backdrop/original Back handler all pass in both scenarios.
- `pending01/`: real pending plain/grid body save remains unresolved across no-op close; release saves the exact document and increments body revision once; actual undo/redo succeeds.
- `identity01/`: 30 production closure/comparator/schema/history/access tests, with only output path adapted.
- `recording01.stdout.txt`: 21 original production queue/save/close security checks with controlled platform I/O.
- `build01.*`: independent frontend build, exit0 and original chunk-size warning.
- `verify-results.py` and `analysis.json`: independent complete result assertions; the first summary-script syntax error is retained in `verify-results-attempt01.py` and `verify-preparation01.json`.

Every run has its exact command, working directory, timestamps/duration, exit code and stdout/stderr. The pending transport is held before its original preview action executes, so this is unresolved-save timing evidence rather than a durable-write/lost-response experiment. Back is the actual production handler invoked through a probe, not device Back. Production security fixtures use the real algorithms with controlled environment; they are not React mount or native execution evidence. App runs use actual production React/Tiptap/preview code with observational probes, isolated contexts and only synthetic data.

`final-identity.json` records closing fixed-source checks, exact App/CSS and dependency-link removal. `manifest.json` seals this new directory only, excluding itself, using sorted relative path TAB bytes TAB SHA256 NEWLINE, and records the final report hash. No GUI, ADB, platform build, downloads, target/shared-cache changes, staging or commits. The subsequent combined-source APK upgrade, Android input/Back/reopen and native rounded contour remain unaccepted here.
