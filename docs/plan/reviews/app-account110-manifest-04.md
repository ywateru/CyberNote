# account110 request-deadline manifest independent review

2026-11-14 — **PASS; no blocking findings.** Exact manifest-only commit
`0edd0b3c02fb8bd60d5c840c24bbc72fdfc7edee`, parent
`f84c666334c6b2d644cf8b15b002f55dd4a4ecf3`.

Read-only verification in clean author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`; only this report is written
in reviewer tree `/private/tmp/cybernote-account109-relay-observer-review-01`.

Only `scripts/publish/manifest.json` changes, with exactly three existing hash
refreshes and no added/deleted paths:

| Path | Independently verified SHA256 |
| --- | --- |
| `src-tauri/Cargo.toml` | `4e49af43e79abecd461158073efdfb8b6a55fa8eecb64efed107f41740db6bbc` |
| `src-tauri/src/account/transport.rs` | `667d3b5e88ef26e6f3b48ac7c2b59e13d3c0ae15139d22e2e57a188f52be8bdf` |
| `src-tauri/src/account/worker.rs` | `3a30c63e84c9778ae0dc762154902243f2009ad4902d3473472cac38e7bff285` |

Each hash independently matches the committed candidate blob. Full bytes also
equal its exact parent and approved source
`493550e545749e735ff862e46a79bdddd0529b92`. The source approval remains Erdos's
separate implementation verdict (`0f5c416f`), not repeated by this pins review.

All inventory keys and non-files declarations are structurally unchanged:
policy, ownership, firstParty/thirdParty, upstream revisions, licenses and runtime
assets. All inventoried dependency lock pins and their committed bytes remain
unchanged. Verification fixtures/runners, docs and artifact receipts stay outside
the export inventory. Manifest SHA256:
`b797bbc3e2a96c8bfddd63e20bd8372755d1af8205b8f40a4aca45c81270f274`.

Independent bounded checks on the exact candidate:

- `git diff --check 0edd0b3c^ 0edd0b3c`: **PASS**.
- `node scripts/publish/manifest.mjs --ref 0edd0b3c02fb8bd60d5c840c24bbc72fdfc7edee`:
  dry-run **exit0, `changes=[]`**.
- `node scripts/publish/export.mjs --ref 0edd0b3c02fb8bd60d5c840c24bbc72fdfc7edee`:
  dry-run **exit0, 1,794 files / 95,808,039 bytes**. Full committed hash/privacy/
  license/runtime validation and implemented source closure pass;
  `initializedNewHistory=false`, no export root created.
- Author HEAD remained exact and clean after checks.

No suites, Cargo/native tests, dependency resolution, builds, App, network,
devices, login, credentials or original stores were used. Main and author source
were not changed. Parent can merge pins and freeze the next build source; this
review does not prove live request-deadline behavior or approve a not-yet-verified
Mac package.
