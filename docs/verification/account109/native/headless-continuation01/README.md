# Original-store native headless continuation 01

Result: **PASS**, one authorized continuation, 91.131 seconds. The exact preserved
full02 conflict was resolved with production keep-all, both complete branches and
original attachment bytes were verified on both peers, and real sign-out passed
sampled two-way exclusion before and after A's restart. All three owned processes
closed naturally, without forced signals; no native desktop process remains.

This result is separate from the historical full02 and continuation01 failures,
which remain unchanged. Full02's ten prior passed checks were retained as prior
evidence, not rerun or reclassified with this candidate.

## Invocation and provenance

```sh
node scripts/verification/account109-headless-recovery.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-be037f3c-native-headless/notes-clone \
  --stores /private/tmp/account109-desktop-real-90b8b28b-01 \
  --output /private/tmp/account109-desktop-real-be037f3c-headless-continuation01 \
  --prior-run /private/tmp/account109-desktop-real-39c1420d-full02 \
  --binary-source-revision be037f3cc542f53fba06d604f932743542e29bc4
```

The explicit original-store authorization followed the successful disposable
[headless smoke](../headless-smoke01/README.md). Main HEAD at launch was
`f57098091541dc99523e82be2cb4959cc500ffc4`. All five Node tool inputs were compared
byte-for-byte with reviewed author commit
`bb701339340eabeb448ec2853a9f0de374938571` before launch. The complete candidate
hash and [native-only build receipt](build-receipt.json) were independently checked
against source `be037f3cc542f53fba06d604f932743542e29bc4`, clean source inventory,
and the expected artifact path. No build or embedded frontend identity is claimed.

Execution ran from 2026-11-13T04:12:00.735Z to 04:13:31.866Z, exiting with code 0.
The output directory was fresh. The original A/B stores and production account
owners were used directly. No new authorization, manual pairing, retry, reset or
manufactured conflict was introduced.

| Artifact | SHA-256 |
| --- | --- |
| Native-only candidate | `f5b64d0dbaa7001b2e00ee94f40fcdc69f6da7f0584f44dc6c42cf3bc2405add` |
| Headless recovery | `6e1511ff3d90d159b5335035bb858c352f794643ed93651e43f5fc9330aa7a74` |
| Headless driver | `ce9fedd92d3dfce7ed96d67896402ef1d6cec6b43bf056d112b03241f9b00647` |
| Shared recovery helpers | `c88f2b2f14a6fe04657f5a51dcce4e1076f8d12c4b2bb592c5cfcc799a508672` |
| Account helpers | `67a2651b92d5311c6a0382a752b9e13aa408c599870ceea9ddb57fb3ff3bb943` |
| Bounded protocol helper | `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2` |
| Exact result | `d0d89a9361aa4311a49ce4463617981757ce1bb8be0dc3e8d2d2b0b3b401b8f4` |
| Exact trace | `df19a56fdf16635d54a6b02cc0691e90389c9a1160bfda0e27727dd42661e983` |

## Preserved conflict and raw-byte evidence

The runner first sealed the exact two full branch baselines from read-only SQLite
evidence copies before launching either process. It checked that original
DB/WAL/SHM hashes stayed unchanged during that copy/query stage, that both stores
agreed on both full heads and digests, and that their descriptors matched the
synthetic PNG/bin fixtures. Full baseline payloads and SQLite copies remain private
temporary evidence; none is included in this repository archive.

Both native participants restored the same existing synthetic account. Readiness
requires exact protocol/participant/transport identity and zero windows. The
connection gate required reciprocal connected peers using each runtime's actual
current-device ID. Native conflict queries then matched exactly the existing
target, variant digests, titles, timestamps, attachment counts and live/unlocked
flags on both peers before A's production `keepAll` operation.

The runner verified zero conflicts on both peers after resolution and matched both
complete branch payloads on each peer. Canonical comparison retains all supported
wire-note and descriptor fields, while normalizing remapped identity IDs,
projection revision and physical paths. Document references must resolve to owned
attachment rows. Actual bytes were compared through production native attachment
reads and the retained physical files; their hashes were included in the canonical
payload comparison. Four branch proof observations cover two branches on two peers.

| Complete branch | Canonical payload SHA-256, equal on A and B |
| --- | --- |
| First preserved head | `0eab1059eeae3d4ecac891ee7d3bc3f4773ec4f34535e985d0ef874990e4e991` |
| Second preserved head | `5e5ee2b492f04d170468fec70edc1031a70a0e3c0da4bafd9516d29fdcf87c21` |

| Original attachment | Bytes | SHA-256 on both branches and both peers |
| --- | --- | --- |
| account109.png | 68 | `11f8a69f10d1f9296a6aa25c92b0b9b35d0b1fbc039211d59d2ffa55747a753f` |
| account109.bin | 4096 | `c8f5d0341d54d951a71b136e6e2afcb14d11ed8489a7ae126a8fee0df6ecf193` |

## Real sign-out, local edit and restart

A's production `signOut` completed and A stayed signed out, disabled, without a
profile or connected account streams. A then created a bounded synthetic local
note through production Session save; its complete heading/paragraph document and
plain text matched the requested content. B remained signed in, enabled and ready,
and created one new remote note before A restarted and another afterward.

Each exclusion sample checked A's signed-out invariant and every preserved full
local document/plain-text body, absence of B's post-logout note IDs on A, and
absence of A's post-logout local note on B. B's ready/signed-in invariant was
checked during every remote read. All retained raw attachments were reread and
compared after each window. The local edit was included in the preserved snapshot
and survived A's actual process restart.

| Window | Samples | Observed duration | Remote notes excluded |
| --- | --- | --- | --- |
| Before A restart | 27 | 3005.866500 ms | first B note |
| After A restart | 29 | 3009.147083 ms | both B notes |

The final observed account state was A signed out and B ready, signed in and
enabled. Both scenarios in the report are `pass`. These are repeated three-second
negative observations, not an unbounded exclusion guarantee.

## Cleanup and evidence integrity

| Instance | PID | Exit / close | Forced signals | naturalExit |
| --- | --- | --- | --- | --- |
| A before restart | 93294 | code 0, null signal | none | true |
| B | 93295 | code 0, null signal | none | true |
| A after restart | 58932 | code 0, null signal | none | true |

The runner withheld pass until natural cleanup completed. Every PID was separately
checked absent afterward, and `pgrep -x notes-clone` found zero processes.
[post-run-status.json](post-run-status.json) records the checks. No account-error
transition was recorded. Native stderr and stdout-noise counts were zero; the
driver discards those bodies regardless.

All **52 protected prior evidence files** were checked unchanged after execution:
the original resume report, both failure output reports, review03, all full01,
full02 and failed-continuation archive files, and the complete native build/smoke
archives. The exact prior full02 hash remains
`d8e092bff3e1b82781594f03bb53eca4ae575a802be88c17ea23f9bd6ca067f2`.
The private baseline payload still matches its recorded hash. The candidate hash
was rechecked after completion.

The archive includes the exact [result](result.json), [steps](steps.jsonl), prior
full02 result, preflight/post-run records, supplied build receipt, safe runner
output, and exact five tool sources. The trace contains **924 events for 462
operations**, every operation paired `before`/`after` with no failure event.
`SHA256SUMS` covers every archive file except itself. Raw databases, full baseline
payloads, full note bodies, account profile identifiers, credentials, URLs,
callbacks and secrets are excluded.

This continuation intentionally resolved the original conflict, signed A out,
and created synthetic local/remote exclusion notes; store contents are not claimed
unchanged. No store was reopened or operated on after completion. No product or
runner edit, build, UI, browser, ADB, network-setting change, merge or commit was
performed. Coverage is native Session/account/transport behavior through the
reviewed fixed stdio harness; frontend editor and GUI confirmation acceptance are
outside this result. Historical startup/evaluation causes remain unproven.
