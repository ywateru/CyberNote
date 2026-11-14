# account110 finite diagnostics manifest independent review

2026-11-14 — **PASS; no blocking findings.** Exact manifest-only commit
`c00f214e6b58e06894ab0e9169b30cca910318da`, exact product parent
`e6e5a86cfcad3372981893ef0038e87ada8f46a2`.

Read-only checks ran in author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`, clean at the exact commit.
Only this report is written in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`.

Only `scripts/publish/manifest.json` changes, refreshing four existing entries:

| Path | Independently verified SHA256 |
| --- | --- |
| `src-tauri/src/account/transport.rs` | `8537f08171b48e18bf06eaed2898d90ee24bc4c888c661c9d38a9e5b37ea8919` |
| `src-tauri/src/account/types.rs` | `019f500d28e984a8e7f2cab9d09bd5aa0343e5fc466b8a642e072c3f0a7ba041` |
| `src/account-client.ts` | `2c9d9a5cdaeeb8abef45f6f7692d08b0a97a2dca97f7d11f24c691a1c59795e4` |
| `src/AccountSettings.tsx` | `bd2b2f782f6dc50b34c18422ed889acafab3b2f41c7436a5567ff9c7cab8c62f` |

Every refreshed hash matches committed candidate and parent blobs. Full native
file bytes equal approved author source `c31a9b1c1cc4a7d56c73544fef987024b4111c3f`;
full UI bytes equal independently approved
`06abe5899b5f1668f23224c10f952c58c181d1c0`. No source change is introduced by
the pins commit. This binds the reviewed files without repeating implementation
reviews or claiming that a new live diagnostic result exists.

Inventory keys are identical, with zero additions/removals; all non-files fields
are structurally identical, including policy, firstParty/thirdParty, upstream
revision/license/runtime declarations. SDK SOURCE/provider assets, ownership
and dependency locks are not repinned. `scripts/verification/` fixtures/runners,
docs and artifact receipts remain excluded by the existing inventory policy.
Manifest SHA256:
`bb87326dcb40bfa3d817a08abd10f517efa93193c7161077bb24adba1ddac7bd`.

Independent verification on the exact candidate:

- `node --test scripts/publish/policy.test.mjs scripts/publish/export.test.mjs`:
  **8 passed, zero failures/cancellations/skips**.
- `node scripts/publish/manifest.mjs --ref c00f214e6b58e06894ab0e9169b30cca910318da`:
  dry-run **`changes=[]`**.
- `node scripts/publish/export.mjs --ref c00f214e6b58e06894ab0e9169b30cca910318da`:
  dry-run **1,794 files / 95,801,306 bytes**, including full committed
  hash/privacy/license/runtime and implemented source-closure checks. No final
  export root/history was created; test-only temporary fixture roots were cleaned.
- `git diff --check c00f214e^ c00f214e`: **PASS**. Author HEAD remained exact/clean.

No Cargo/native tests, frontend suites, builds, App, network, device, login,
credentials or original-store access. Main and author implementation were not
modified. Parent may merge pins and freeze the new source; the next Mac package
still requires separate actual-file identity/signature/resource verification.
