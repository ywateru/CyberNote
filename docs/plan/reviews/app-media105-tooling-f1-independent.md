# MEDIA105 F1 independent re-review

Decision: **accepted, representative tooling only**. F1 is closed for the reviewed exception paths. The tools are released to the author for the next separately reviewed stage. This accepts neither a formal runner nor 500-image coverage/performance results; formal execution remains unauthorized.

## Exact reviewed scope

The original five-file patch remains the baseline of this review. Reconstructed the F1 two-file patch from the preserved original files and current bytes; it exactly matches SHA256 `a66a3453ea009f0c958625f25a6eb59300d93bce6ce62ce51c54b5d004cabb0a`. Preserved original files match the previously rejected frozen hashes. The other three tools still match the original author inventory.

Accepted final hashes:

| Tool | SHA256 |
| --- | --- |
| `coverage105.mjs` | `134531c2c072407f521c20c4559fe15409d403c88e84c8e9b5970d1aa1ab563b` |
| `check-coverage105.mjs` | `238a994fd9243e9673d854cb96eff36fa1c84ff6c595cc8256d6a86a5d2852ea` |

Product identity remains `bf26dae17f972fc09276deb456b4599e1ebe5d67`, fingerprint `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9`, 445 inputs, dirty=true. No product source, baseline artifact, frontend or host binary was rebuilt or modified.

## Cleanup boundary

Inspected the actual final `finally`: each observation/output is protected; a nested `finally` attempts context, browser, browser server, each socket, server connections/listener, and backend separately. A failure in one operation cannot skip later cleanup operations. The normal recorder retains its wall-time check; a repeated timeout is appended as a failure rather than escaping before teardown. Post-run identity and each subsequent evidence output are also individually protected. Original failures remain first, stderr is best effort, result writing is attempted, and failure leaves exit status 1.

Independently executed the source-extracted complete-finally regression, including the original three failures, snapshot failures, each individual close failure, first-socket failure followed by another socket, all evidence writes failing, and configuration/result write failures. **14/14 passed**, retaining the original failure and attempting every resource and the final result. Raw: `artifacts/media105-independent-review/f1-cleanup-rerun.json`. These controlled checks test thrown/rejected operations; they do not prove recovery from an indefinitely hanging OS/browser close.

## One actual paired representative run

Ran exactly once on final tool bytes:

```sh
node scripts/performance/check-coverage105.mjs \
  --fixture artifacts/media99-fixture \
  --after-build artifacts/media105-after-harness \
  --after-frontend artifacts/media105-after-frontend \
  --output artifacts/media105-independent-representative-f1 \
  --source /Users/water/work/2026/Apple-Notes-Clone
```

Exit 0. Both sides completed three actual-App search/gallery groups (five PNG, five JPEG, five text SVG), with **15 distinct visible current-source decode successes, 15 exact IPC source links, zero failures and zero page errors per side**. Independently recomputed these claims from samples, source links, transport end records and network records, rather than copying the author's summary:

- Baseline: each of the 15 Blob sources links to one successful actual `read_attachment` call with matching frozen-original SHA and attachment owner. Whole-run reads total 58 calls / 43,424,427 bytes, including startup/search work; this is not described as only 15 reads.
- After: each of the 15 current sources links to one actual acquire call and matching grant capability hash, card owner, purpose, pixel size and successful HTTP 200 response. Whole-run legacy `read_attachment` calls: zero.
- Current decoded samples require connected image, complete load, nonzero natural width, matching decode/current source, two frames, and matching card owner. Both source/fixture identity checks completed without failure.
- Independently streamed SHA256 over the installed Chrome executable and versioned framework after the run; both match the separate 157.0.8103.40 pins. This does not revise the historical Chrome 156 evidence or imply direct historical timing comparability.
- Owned host/Chrome root PIDs 4625/4631 and 5149/5150 were absent after completion. End free space was about 39.6 GB on both sides. No additional browser/device run or build was performed.

Independent recomputation and process/pin checks: `artifacts/media105-independent-review/f1-result.json`. Full raw run, including screenshots and configuration/tool hashes: `artifacts/media105-independent-representative-f1`. Console log: `artifacts/media105-independent-review/representative-f1.log`.

## Remaining scope boundary

All sampled gallery scroll positions were 0: these small galleries fit within one viewport. This verifies the representative source association, readiness and successful cleanup path. Continuous full-gallery geometry, the full actual-PNG/text ROI ledger, first/supplementary visits, phase RSS and long-media behavior remain outside this delivery. The formal path is not implemented or accepted by this review. No claim is made about Android/native UI or the unresolved mobile-format behavior.
