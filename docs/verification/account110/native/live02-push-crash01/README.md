# Account110 a663586b push crash finite diagnosis 01

2026-11-14 (Asia/Shanghai). Read-only diagnosis authorized after the single owned
push failure archived in a8fe1dab (live02-push-diagnostic03). No App retry, Cargo,
network, grant access, library reads or product edit. Target remains available to
the native author; this diagnostic uses only the approved binary and system crash
report. Original result remains unchanged.

## Evidence

System report launch20:20:33.3797 matches result start20:20:33.376; capture
20:21:23.4662 is inside the run ending20:21:29.732. Wrapper bundle identity matches
this candidate. The notes-clone image Mach-O UUID matches dwarfdump of the exact
signed a663586b executable, whose SHA matches the packaging receipt. Literal
procPath comparison was false and is recorded without interpretation; identity
is supported by bundle, exact binary UUID/SHA and matching run time. Report bytes
are pinned in safe-stack.json but raw report is retained only in the system.

Faulting thread is tokio-rt-worker. Exception EXC_BAD_ACCESS/SIGABRT; termination
SIGNAL6. Fixed symbol chain: Rust std stack_overflow::imp::signal_handler,
_sigtramp, account::transport::transfer_target closure(+652), transfer_target
Future::poll, worker::execute_request, run_service, run_content, heap-pinned
content_owner and Tokio task poll. This establishes an actual stack overflow on
the production selected-device transfer path, rather than an inferred deadline
or typed account error. Earlier failed runs remain independently classified.

Read-only nm/llvm-objdump of this exact binary locates the transfer_target closure
symbol. Prologue reserves0x20, probes0x31000 in0x1000 increments, then reserves
0xa30: 203344 bytes (198.578125 KiB) static stack for this one poll frame. The
reported +652 is str x0,[sp,#0x20], following a call to an inner async closure at
+648. It is not the prologue itself. This quantifies stack pressure but does not
prove the newly extracted prepare helper is the unique cause or supply a complete
thread stack high-water measurement.

Native author's source inspection found nested by-value futures across prepare,
prepare_request and execute_request. tokio::pin! pins those inline values; it does
not heap allocate them. Earlier content_owner heap pin does not bound each nested
poll frame. Existing deadline fake-future tests and paused-owner small-stack test
did not exercise this actual transfer path. Native author received exact evidence
and parent authorized real-layout measurement, a minimal heap-boundary fix and
small-stack regression. No thread-stack increase, mapping parallelism, timeout
increase or trust relaxation was applied by this diagnostic. Author/Erdos review
and new package/owned-push verification remain required.

## Safe archive

Only source/binary/report hashes, booleans, timestamps, fixed static symbols,
frame indices/relative offsets and bounded instruction excerpts are included.
No raw process path, report UUID, absolute machine addresses, memory/register
contents, user identifier, raw message, credentials, URLs, notes or attachment data
is copied. Prologue excerpt is address-free; instruction branch destinations near
the fault are replaced with code-address labels. Raw crash remains in the system;
finite private projections remain under the dedicated diagnostic root. SHA256SUMS
covers this safe archive. There was no further live attempt.
