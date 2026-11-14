# account110 fixed desktop launchers independent review

2026-11-15 — **APPROVE; no blocking findings.** Exact source
`3bf8466e8dff6455b96e48b947d6d9a807383376`, parent
`29c878108b2ea421b5e4fccd71547206071fdbfa`. Only two new 17-line scripts:
`scripts/verification/account110-desktop-a.command` and
`scripts/verification/account110-desktop-b.command`, both Git mode100755.

Independent read-only source/metadata checks in clean author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`:

- `zsh -n` on both files and exact base-to-commit `git diff --check`: PASS.
- Independently evaluated only the `${0:A:h:h:h}` expression, with the script
  pathname as shell `$0`: resolves to the actual repository root in both author
  and main paths. Neither launcher was executed or sourced.
- Both fix the executable beneath that root to
  `artifacts/account110/mac-29c87810-debug-01/CyberNote-Account110-29c87810.app/Contents/MacOS/notes-clone`.
  Actual main file is regular, non-symlink, executable, **206,074,464 bytes**;
  SHA256 `96192c49b6abcc9b689dad895203455c7ceefa713d2e17e15c7379ca85c7ef42`
  matches the independently reviewed package and its retained SHA256SUMS entry.
- Fixed data roots are
  `/private/tmp/account110-device-actions-staging-fix-fresh-live03/desktop-a`
  and `/private/tmp/account110-device-actions-staging-fix-fresh-live03/desktop-b`.
  Both exist as non-symlink directories; checked metadata only, no store contents.
- Binary `-f`/`-x` and directory `-d` failures print fixed messages and exit1.
  Success is exactly `exec "$binary" --data-dir "$data_dir"`; all path expansions
  are quoted. No library creation, identity copying, configuration output,
  authentication action or default-library fallback.
- **Extra launcher arguments are silently ignored, not rejected**: neither
  `$@` nor positional parameters are forwarded. They cannot replace the binary,
  data-dir or add application options through these scripts.

The launchers pin a path, not a runtime hash assertion: current binary identity
was independently verified above; replacing that file later requires renewed
verification. The wrapper bundle ID itself does not isolate the compiled Tauri
default data-dir; the explicit fixed `--data-dir` supplies the intended selection.
These are repository-local double-click entries, not standalone distributed apps.

No App, launcher, collector, build, network or device execution; no private-store
reads or main writes. Author HEAD was exact and clean after inspection. Runtime
continuation, GUI behavior and post-close data comparison are separate parent/
Erdos/Feynman evidence, not established by this static approval. Only this report
is written and committed in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`.
