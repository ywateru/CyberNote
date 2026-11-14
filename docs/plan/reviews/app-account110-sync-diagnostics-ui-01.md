# account110 finite sync diagnostics UI independent review

2026-11-14 — **PASS; no blocking findings.** Exact source
`06abe5899b5f1668f23224c10f952c58c181d1c0`, base contract
`47572b955d75ac7e7bffd1f46d2588eb454de1b0`. Author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2` was clean at the exact
commit before and after independent checks. Scope is only `src/account-client.ts`,
`src/AccountSettings.tsx` and the two existing status-DTO/login-surfaces tests.
This report alone is written in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`.

## Findings

- Compared the consumer directly with native source
  `c31a9b1c1cc4a7d56c73544fef987024b4111c3f`: four camelCase stage values
  (`pair`, `recoverPairing`, `transfer`, `retirement`) and all fifteen snake_case
  SyncError reasons agree with native serialization and the parent contract.
  This checks wire compatibility, not native error-provenance implementation.
- `validateAccountError` admits the pair only under `account_sync_failed`, with
  exactly code/message plus both diagnostic fields. Missing, null, explicit
  undefined, wrong types, unknown values, wrong code and auth/request/adoption
  or extra fields fail closed. IPC uses this same validator; the token-response
  helper also rejects sync fields. Legacy generic sync errors remain valid and
  receive no inferred stage/reason.
- Both summary and details use finite local Chinese tables after validation.
  Upstream message is not rendered; IPC substitutes local copy. Validated status
  still retains its bounded message as before, so this is a rendering/sanitization
  guarantee, not a claim that the status DTO strips that existing field.
- Existing status/global errors and actual device-command modal now expose the
  same safe details; native dialog summary controls remain usable in the existing
  focus model. Details do not include arbitrary text, URLs, identities or payloads.
  A failed device operation does not become a success indication.
- Existing `accountErrorStateKey` consumes the updated safe detail projection:
  stage/reason progress changes the key and retires an old immediate error;
  same-error polling, message-only changes and count churn do not erase it.
  No retry selector, owner/generation fencing, target/direction confirmation,
  success-receipt condition, sync switch, lifecycle or transfer dispatch is changed.

## Independent verification

- `node --test scripts/verification/account109-login-surfaces.test.mjs scripts/verification/account109-status-dto.test.mjs`:
  **74 passed, zero failed/cancelled/skipped**. Includes every 4×15 valid pair,
  rejection boundaries in status and IPC, legacy compatibility, safe copy/state
  keys and real React component handlers for status/modal errors without replay.
- `pnpm typecheck`: exit0, **PASS**.
- `git diff --check 47572b95 06abe589`: **PASS**; exactly four changed files.

The device-free React host executes actual committed handlers; it does not prove
native/browser rendering, focus routing or a live transfer. No App, Cargo/native
build, network, device, login, credential or original-store access occurred.
Author implementation and main were not modified. Native review and final source
pins/package identity remain separate gates. The earlier live02 51-second generic
failure remains unclassified; new diagnostics must not be backfilled as evidence
of that failure's stage or root cause.
