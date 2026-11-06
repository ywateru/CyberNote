# APP92 actual worker integration01 — FAIL retained

Source main cfa14fe1, fixed JXA SHA dca43bc464514bb14572ce2181faf0ce11d821d76ed532512cfadee4fab5cba8. New private0700 parent, 0600 input/raw captures, new target root; single previously known attachment-free source ID was private only. Used exact production core/SystemSource/Session/Store ignored test, no source or test modifications. Four existing tracked include_str fixtures only materialized for sparse compilation.

Cargo/test natural exit101 /29.176s; no outer timeout. The test actually ran, then failed at tests.rs546 `bounded actual source scan` because the scan job reached phase error; no safe-report was generated. Initial direct SystemSource before-read assertions completed and target synthetic note/settings setup was reached. No actual import, reopen or dedup success is claimed. Full original stdout704B/stderr6839B and target retained privately, not committed. Target84 was released immediately.

Narrow diagnosis without more Notes reads: the previous admitted fixed-runtime01 private scan has126 rows with3 duplicate IDs, in two groups occurring2 and3 times; within each group metadata rows are exactly identical and folder IDs agree. Host validate_scan rejects duplicate source IDs. This proves a real prior source response is incompatible with the host uniqueness contract; this run did not print its scan error code, so the specific causal link remains a well-supported inference rather than a captured runtime reason. No guess that the duplicates came from smart folders is made.

The source adapter should emit one row for identical metadata bearing the same stable ID, and refuse conflicting same-ID metadata as source_changed. Host duplicate rejection remains strict. This needs source-owner repair and independent admission before another actual run. No repeated source invocation or direct append fallback occurred.

Read-only Python SQLite target supplement could not open the private DB (OperationalError), so it adds no target-baseline assertions. Original target is retained; no modification to bypass access was attempted.
