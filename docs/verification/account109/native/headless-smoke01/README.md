# Disposable native headless smoke 01

Result: **PASS**, seven checks, one execution, 2.722 seconds. Both native process
instances exited naturally and no native desktop process remains. The exact
[result](result.json), [operation trace](steps.jsonl), [safe progress log](runner-progress.log),
and executed smoke/driver sources are archived here. No original account store
was accessed; original-store continuation remains separately gated.

## Invocation and provenance

```sh
node scripts/verification/account109-headless-smoke.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-be037f3c-native-headless/notes-clone \
  --output /private/tmp/account109-headless-smoke-be037f3c-01
```

This ran once after the explicit Node-approved-and-merged notice. Main HEAD at
launch was `3f64f2baf38615ba26041622d3cafab559ba7b70`; the merged Node driver bytes
were independently compared with reviewed author commit `bb701339`. The executable
is the exact native-only source-`be037f3cc542f53fba06d604f932743542e29bc4` candidate.
Its complete hash was verified before and after execution. The copied
[build receipt](build-receipt.json) matched the supplied source revision, clean
inventory and candidate hash. This smoke performed no build and asserts **no
embedded frontend identity**.

| Artifact | SHA-256 |
| --- | --- |
| Native-only binary | `f5b64d0dbaa7001b2e00ee94f40fcdc69f6da7f0584f44dc6c42cf3bc2405add` |
| Smoke runner | `668b4e4cdb88c79ee43587e5a077dae960ee72aeb68470564e1fa696b3aca029` |
| Headless driver | `ce9fedd92d3dfce7ed96d67896402ef1d6cec6b43bf056d112b03241f9b00647` |
| Shared bounded driver helper | `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2` |
| Build receipt | `4a896af90781d50a239df098f7606ee146d9615efdbff4d754ddfc604aaf5843` |
| Exact result | `3cf236d57f40bb3282d6343ab98f776378d955392b1ccbb8dbebf1f303342b41` |
| Exact trace | `51b24296091da929aa4fd56d15292a7718883005347aa79327b613742e28a528` |

`SHA256SUMS` covers every archive file except itself. The smoke runner, headless
driver and shared helper were captured before launch and match the result's
recorded tool hashes. Only this new smoke runner and archive were written by this
verification task; no product code or existing runner was modified and no commit
was created.

## Native and persistence evidence

The runner atomically created a fresh restricted disposable root. Both launches
used exactly `/private/tmp/account109-headless-smoke-be037f3c-01/store`. It accepts
only a fresh `/private/tmp/account109-headless-smoke-*` output, has no original-store
option, and never clears or reuses an existing output root.

Both protocol handshakes and `ready` replies identified:

```json
{
  "protocol": 1,
  "participant": "account109-native-harness",
  "transport": "native-session-stdio",
  "windows": 0
}
```

The native `ready` implementation rejects nonzero WebView windows. The driver
requires the exact participant/transport identity, and the smoke independently
checks the complete ready object. This establishes the fixed native participant
with zero WebViews, without a renderer, editor, DOM evaluation or browser probe.

Initial account status was signed out, disabled, without profile/error, connected
devices, pending items or conflicts. The fresh workspace had zero notes and zero
attachments. The fixed `createPlainNote` operation used bounded `account109-`
synthetic title/text containing Chinese and an emoji. Its production Session save
reply and workspace were each compared against the full expected heading-plus-
paragraph document and exact `title + "\n" + text` plain text.

After natural shutdown, a new native process reopened the same smoke store. It
again proved zero-window readiness and signed-out status. The workspace contained
exactly the same one note, with the same synthetic ID and full document/plain-text
equality to the saved body. The complete body hash matched before and after restart:
`25ce650fa3828168b92ca676f201534c72eae703af805518f87604bbd0bc5c6c`.

The seven passed checks cover initial readiness, signed-out blank state, complete
Session save/workspace equality, first natural close, restarted signed-out native
readiness, full persisted-body equality, and second natural close. The trace has
20 fixed-label events for ten operations, all paired `before`/`after`, with no
failed event. Both processes received the fixed `shutdown` operation.

## Ownership and limits

| Instance | PID | Exit / close | Forced signals | naturalExit |
| --- | --- | --- | --- | --- |
| initial | 67598 | code 0, null signal | none | true |
| restart | 67605 | code 0, null signal | none | true |

Both PIDs were explicitly checked absent after completion, and an exact-name
process check found zero active `notes-clone` processes.
[post-run-status.json](post-run-status.json) records these ownership checks.
Native stderr and stdout-noise byte counts were zero; the driver discards such
bodies regardless. Only fixed progress messages and safe result/trace fields were
retained. No raw database, workspace body, account status payload, browser URL,
callback or secret is included in this archive.

This proves disposable signed-out native startup, Session save, process restart
persistence and natural shutdown. It does not prove real-account restoration,
peer discovery, conflict resolution, attachments or logout behavior. No original
store, grant, authorization, preserved conflict, browser, UI, ADB or system network
setting was operated on. No inference about historical WebView failures is made.
Original-store continuation requires the parent's separate explicit authorization.
