# Account110 native transfer-stack author evidence 01

2026-11-14 (Asia/Shanghai). Docs-only archival of Huygens author evidence for
source `4c1ac0033d10cd7bc864f2ff4ca087f147f235d8`, based on frozen candidate
`a663586b47f136508d1cab50f7ca2a075b9fd67b`. The source commit modifies only
transport.rs/worker.rs and remains subject to Erdos independent review. Archiving
these files does not approve or merge that product source. No test/build/App,
SDK probe, network, credential or owned-library operation was performed here.

## Provenance and integrity

All12 regular files from the dedicated private author directory were copied
byte-for-byte after privacy inspection. Author SHA checks passed for all11 listed
inputs. Author original SHA256SUMS is retained unchanged as AUTHOR-SHA256SUMS;
its entries still resolve against the same archived filenames. New SHA256SUMS
covers this complete archive, including the original list, this README and the
archive-receipt. That receipt pins every source filename, copied filename, size
and digest. The two final Rust source hashes in receipt.json independently match
the exact committed blobs, without checking out or applying the unreviewed patch.

## Preserved author evidence

| Files | Recorded observation |
| --- | --- |
| baseline-source.json / baseline-fixture.patch | Exact baseline source identities and fixture patch |
| baseline-command.json / baseline.log | Exit101; large diagnostic-stack measurement succeeds,512KiB real reject poll SIGABRT |
| fixed01-command.json / fixed01.log | Exit101; partial prepare/execute heap fix still SIGABRT on512KiB reject poll |
| fixed02-command.json / fixed02.log | Exit0; measured fixed layout and512KiB reject/cancel subprocesses pass |
| final-focused-command.json / final-focused.log | Exit0;13 passed,0 failed,0 ignored |
| receipt.json | Author source/scope hashes, measured bytes, test limits and at-time target release |

baseline.log and fixed01.log are unchanged first-failure evidence, including
original trailing bytes. They were not overwritten with successful output.
No warning or failure line was removed. Baseline measured prepare50472B,
prepare wrapper101144B, transfer253008B and execute506160B. Partial fix reduced
transfer/execute but still failed, motivating the additional request_io boundary.
Final author measurements are SDK map24792B, SDK connect24560B, request_io128B,
prepare1360B, prepare wrapper208B, transfer832B and execute152B. These are future
object sizes, distinct from the prior binary static poll-frame measurements.

The final13 focused tests include the real512KiB fixture plus shared185-second
deadline, dropped waiter, late admission, blocked-backend join, Busy and bootstrap
identity/owner fences. The fixture's16MiB diagnostic thread is measurement-only;
the actual reject/cancel children use512KiB. No production thread-stack increase
is claimed. Actual tested SDK behavior is no-session local rejection and a
pre-cancelled transfer preparation; logged-in direct/fallback network branches
and real App push acceptance remain unexecuted by this evidence.

## Privacy and next gate

Manual inspection of every archived file found build/test diagnostics, static
source snippets, fixed loopback callback constants and synthetic fixture inputs.
No real account/device identity, token, grant, raw event/message, actual hosted
authorization URL, original note text/title or attachment bytes are included.
Local temporary checkout/target paths and synthetic test-thread numbers remain
as build provenance. No private user data was read to prepare this archive.

Await Erdos source approval, then the reviewed two-file manifest pins and a new
exact-source package. The next live gate remains one owned-App push diagnostic;
only after it passes should fresh dual-client acceptance proceed. Earlier live
failures, package artifacts and owned libraries are retained untouched.
