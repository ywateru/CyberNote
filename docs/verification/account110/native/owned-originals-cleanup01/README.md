# account110 owned original executable cleanup

2026-11-14, 14:00:40–14:01:54 UTC. **Final result: PASS.** The parent explicitly authorized deletion of exactly five old raw `notes-clone` copies. The parent subsequently relayed **Cicero read-only verification PASS**. That review conclusion is attributed to the parent’s handoff; this archive does not add a new independent verification run.

`receipt.json` is a byte-for-byte copy of `/private/tmp/account110-five-originals-cleanup-1jv_yih6.json`, SHA256 `c85effcc243c139ab3d836db63587ff3b8e58108cf6687df1853ef2782c11f64`. Its finite contents were inspected before archival: authorized artifact paths, sizes, hashes, bounded process/open-handle checks, timestamps and filesystem measurements. No database, grant, note content, credentials, raw App output or browser evidence is included.

## Exact deletion scope

Only these five files under `/Users/water/work/2026/Apple-Notes-Clone/` were removed:

- `artifacts/account110/mac-cb91f4b8-debug-01/notes-clone`
- `artifacts/account110/mac-0a4a4cda-debug-01/notes-clone`
- `artifacts/account110/mac-d0ad2267-debug-01/notes-clone`
- `artifacts/account110/mac-a663586b-debug-01/notes-clone`
- `artifacts/account110/mac-39711ae8-debug-01/notes-clone`

Before deletion, all five were confirmed to be regular files with no symlink path components. Their SHA256 values matched both the existing package reviews and historical artifact checksums. Before each unlink, file identity/hash and absence of running/open remaining candidates were checked again with `ps` and `lsof`.

## Initial interruption and completion

The first attempt deleted only the cb91f4b8 raw copy, then stopped with `AssertionError`: the next `lsof` check still included that already-deleted path and returned a missing-path diagnostic with no PID output. This was a cleanup-check implementation error, not evidence of an App failure or an occupied executable. The partial failure was retained in `interruptedAttempt`.

The continuation restricted occupancy checks to the remaining authorized paths, repeated identity/hash checks, and removed the other four copies. All five paths were then absent. No additional deletion paths were introduced.

## Preserved evidence and protected paths

Each corresponding signed `.app` remains. Its executable hash is the one recorded in the associated failed live result; the signed App therefore preserves the executable actually used by that failure. Historical `SHA256SUMS`, build/packaging receipts, logs and failed/first results were not rewritten or removed. After cleanup, every remaining file in each of the five artifact directories was checked against the unchanged historical checksum inventory: respectively **35, 34, 36, 36 and 36 retained files**. The only missing inventoried file in each directory is the authorized raw `notes-clone` copy.

The main `dist` directory and current `artifacts/account110/mac-9e8a4011-debug-01` package were retained. `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` was **only confirmed to exist as a directory**; no claim is made that target contents, dependencies or cache integrity were audited. No shared-target content, original/final library, other task worktree or unrelated path was deleted. Main remained clean during cleanup; this later archive is authored only in the isolated worktree.

## Measured free-space change

| Measurement | Bytes | GiB |
| --- | ---: | ---: |
| `df` available before | 7,802,892,288 | 7.267010 |
| `df` available after | 8,846,491,648 | 8.238937 |
| Observed available-space increase | 1,043,599,360 | 0.971928 |

The five files’ pre-deletion allocated size was **1,035,104,256 bytes**. This accounting value is separate from the observed `df` change. APFS sharing and concurrent filesystem activity can affect the latter, so the measured increase is not attributed exclusively to the five unlinks. The observed free space remained above the 6 GiB floor.

No App, device, network, build or test suite was run for cleanup or archival. `SHA256SUMS` in this directory covers this README and the exact receipt; the existing artifact checksum files remain historical records and intentionally still list the removed raw copies.
