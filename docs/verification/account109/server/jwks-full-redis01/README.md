# account109 full service / required Redis independent verification

2026-11-13, 10:49:06–10:49:57 Asia/Shanghai (02:49:06–02:49:57 UTC).
**PASS: 172 passed, 0 failed, 0 skipped, 0 cancelled.** This independent run
closes the 29 skipped Redis-test gap in the prior JWKS review. All 29 previously
skipped test names were matched to passing results in this run; their exact
names are recorded in `result.json`. No blocking test failures remain.

Reviewed checkout: `/private/tmp/cybernote-account109-jwks-errors`, HEAD
`d3c0ea8e28536e2284ce5957610815e628d04955`, clean before and after execution.
Working directory: `services/coordinator` inside that checkout.

```sh
REDIS_TEST_SERVER=/private/tmp/cybergrid-redis-build/redis-7.4.3/src/redis-server REQUIRE_REDIS=1 npm test
```

The package command expands to `tsx --test test/*.test.ts`. TAP reports 161
top-level tests, 172 including subtests; duration **50829.025916 ms**, command
wall time **51.018 seconds**, exit **0**. Node `v22.16.0`, npm `10.9.2`, jose
`6.2.15`, Redis client `6.3.1`, tsx `4.23.15`. Existing dependency links were
used; no install or build was performed.

Redis executable: `/private/tmp/cybergrid-redis-build/redis-7.4.3/src/redis-server`.
Reported version: `Redis server v=7.4.3 sha=00000000:1 malloc=libc bits=64 build=ba4426d0b057d15c`.
Executable SHA-256, identical before and after:

```text
b44cd92670678e3d4cfe413ef04deb1c91f7aa5bf24638bf9435ddf7d36e59b1
```

The fixture spawns this binary with `--bind 127.0.0.1`, dynamically allocated
ports, individual `mkdtemp` data directories and random test namespaces. Its
teardown terminates its child and removes its directory. `REQUIRE_REDIS=1`
makes an unavailable binary a failure. No external Redis URL or production
service/credential variables were inherited: the launcher retained only
PATH/HOME/TMPDIR/LANG/LC_ALL/TZ where present, plus the explicit test variables
and `NO_COLOR=1`. No process remained in the run's dedicated process group on
completion. The shared executable was neither modified nor replaced.

Passing Redis coverage includes shared enrollment budgets, admission/GC/atomic
fences, publication bounds/replay, two-handler directories and product/user
isolation, canonical Node entrypoint behavior, process restart/SIGKILL recovery,
discovery/signals/session revocation, distributed waiter cancellation and expiry
cleanup. The full run also includes the 18 focused identity/JWKS tests.

Artifacts: `service-tests.sanitized.log` preserves the complete npm/TAP output;
`result.json` records exact counts, versions, timestamps, hashes, prior skipped
test names and cleanup status. Raw output was captured only in memory and
screened for private-key blocks, JWTs, bearer values, URL credentials and
credential assignments before archival. No redactions were needed; inspection
found only normal TAP/npm output and the existing MockTimers warning. Sanitized
log SHA-256:

```text
483138c8ddfba242595506300e4804e67a03f601d060dedca22ed8a74b66b969
```

The parent reports deployment `dpl8TFi...` and public health/config/JWKS 200 plus
anonymous profile 401; those are contextual parent observations, not probes
performed here. This run establishes local Redis-backed service regression
coverage for the reviewed source. It does not independently establish deployed
artifact identity, production Redis TLS/connectivity, authenticated live
Logto/JWKS/Redis end-to-end success, a prior native failure's root cause, or the
concurrent desktop rerun's outcome. No deployment, public endpoint access,
product edits, commits, app operation or shared Redis access was performed.
