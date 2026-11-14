# account110 integrated source manifest independent review

2026-11-14 — **PASS; no blocking findings.** Scope is the manifest-only commit
`cdca1e52ee05a5b814df75fa207b6c78960d07f1` against its exact parent
`3f244eaea439d6d0002cfa5e1a82dd03211377da`. This approves the source publication
inventory delta, not a Mac package or live account/content result.

Reviewed and ran the bounded checks read-only in
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`, clean at the exact candidate
before and after. This report alone is written in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`.

## Exact inventory and provenance

Only `scripts/publish/manifest.json` changes: **11 additions, 26 refreshed hashes,
zero removals**. Each of these 37 entries was independently SHA256-checked against
both candidate and parent committed blobs; the pinned source bytes are identical
between those two commits. Manifest SHA256:
`c379d93f8c032ca7b87960da473c236de9e33eca8b8d905f2757bf813a515b73`.

All new paths and hashes follow. Commit references identify the last source
change retained in this candidate, rather than asserting new upstream provenance.

| New path | SHA256 | Source commit |
| --- | --- | --- |
| `scripts/sync-network-test/Cargo.lock` | `a8ba6f6a438d3ee0b6b0525ef17905d37aaffa3536e6a2eb872cf447fe1b5621` | `0c8700437` |
| `scripts/sync-network-test/Cargo.toml` | `bfe89989837e9376fbb84efb6207c7f57110ae73d75f4d813197a94ccc6e62da` | `0c8700437` |
| `scripts/sync-network-test/account_directions.rs` | `4630b4505a5ba39e88701469a09ce182e5be9ebda3e4660cba239d654bcdda33` | `0c8700437` |
| `scripts/sync-network-test/fixture.rs` | `54f9c9c88a8cd360363c60679f52133219926ee3115149c347e27318315f6b80` | `f58f63c8b` |
| `scripts/sync-network-test/lib.rs` | `1721931e8f5558e64b4a64812a111439ab2d6d2095a289440c51959690583f48` | `f58f63c8b` |
| `services/coordinator/notes-devices.md` | `379937e64d6175bfc34dfaae1e2b5e2405d0e6f5e89511b175a2e966e3b84f73` | `98fe1dc9a` |
| `services/coordinator/src/notes-devices.ts` | `d7a6e92f981cf81bb77aae2a34edbf72ee72267968fad6e771605332d1674d83` | `98fe1dc9a` |
| `services/coordinator/test/notes-devices.test.ts` | `b83986d7f32d368c9304b3a6111a913b21ed4fe68edd251ec5a6142e64a12204` | `98fe1dc9a` |
| `src-tauri/src/account/directory.rs` | `8dbe654c8616525136ec9f4da06032fe50af559682e93861f0ba49989ae29051` | `fa1c0e5e` |
| `src-tauri/src/account/worker.rs` | `db3b4fd65e7ba01b5c96105c69c731f926d2cb15a829a9381aebd93454ee3897` | `138ba664` |
| `src-tauri/src/store/account_summary.rs` | `5ce984297b78e745762ceab82ff060d17ba054373e2557a5013d0d0b3e87101f` | `fa1c0e5e` |

The 26 refreshed entries comprise seven coordinator files, eleven native
account/store/sync files, six renderer/debug files and SDK `SOURCE.json` plus
`src/types.rs`. No other manifest fields change: both first-party declarations,
both third-party declarations, both runtime assets, their source/size/hash/license
pins and policy are structurally identical. Existing license/notice and dependency
lock pins are unchanged; the only added lock belongs to the standalone test harness.

SDK `SOURCE.json` retains upstream revision
`f2a3961536e5c69b13c7dbc661953d9243becbae`, authorization and previous disclosures.
Its appended disclosure accurately describes source commit `9d936a7e7`:
`Session::transport_session_key()` borrows the private field; serialization omission
and redacted Debug remain, with a regression test. No provider binary is repinned.

## Independent checks

- `node --test scripts/publish/policy.test.mjs scripts/publish/export.test.mjs`:
  **8 passed, zero failed/skipped**. Includes privacy/hash/symlink rejection,
  exact first-party scope, runtime source/license closure and binary repin rejection.
- `node scripts/publish/manifest.mjs --ref cdca1e52ee05a5b814df75fa207b6c78960d07f1`:
  dry-run **`changes=[]`**.
- `node scripts/publish/export.mjs --ref cdca1e52ee05a5b814df75fa207b6c78960d07f1`:
  dry-run **1,794 files / 95,779,972 bytes**. Full committed inventory hash,
  privacy, retained license/runtime validation and implemented JS/Cargo/include
  dependency closure passed. No final source root was created.
- Separately inspected the new harness's explicit Rust `#[path]` references:
  identity/model/network/Store source paths are retained. All 20 direct dependency
  names occur in its committed 185-package lock; library/bin paths are retained
  and the Store-backed binary requires `store-tests`. This is a static closure
  check, not dependency resolution or compilation.
- Candidate `git diff --check` passed; author and reviewer trees were initially
  clean. An auxiliary Python check first encountered unavailable `tomllib`;
  replaced it with bounded text/name checks, without installation or source changes.

The opening “review and deployment pending” sentence in `notes-devices.md` reflects
the service author's earlier verification state; current deployment authority is
the separate account110 production receipt, not that sentence. This is not a
manifest blocker.

No Cargo/native/CLI runtime review, builds, App, network, device, credentials or
original-store access occurred. Native cancellation approval remains the separate
reviewer's responsibility. Final Mac source/build/package identity awaits its
exact final source SHA and artifacts; this PASS makes no package/runtime claim.
