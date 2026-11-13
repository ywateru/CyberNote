# Phone-origin files: independent committed-delta review

**APPROVE** commit `4b639adfc9d3abfd724b825819855e9d216c9351` against its exact parent/base `44c46313c7fa7c174ca1a33f587f3878b5e8d5d9`. No actionable blocker or P1 was found. Approval covers only this phone-files harness increment. This is device-free preparation, not an executed Android/system-picker, native storage, real transport, or three-peer acceptance result, and does not approve a separately modified relogin runner.

The author checkout `/private/tmp/cybernote-account109-phone-files` was clean at the exact commit before and after review. The commit changes exactly two runners and two tests; it changes no product source. All review and test inputs came from exact committed blobs, with an independent seven-file module snapshot under a fresh reviewer-owned `/private/tmp/account109-phone-files-review01-source-*` directory. No author working-tree mutation or reset occurred.

## Reviewed boundaries

1. **Only a new driver-created phone note may receive files.** Live `createNote` captures the previous note IDs, creates through visible controls/CDP input, identifies the new note, and waits for its saved body before internally registering a receipt. The live API exposes `submitNoteFiles`, not the receipt-registration seam. The three-peer case independently rejects any ID present before this case and asserts the exact expected heading, every paragraph, and complete plainText before insertion. The private receipt is consumed before the first attempted effect, including failure; duplicate submissions do not retry.
2. **Caller-controlled bytes and commands are excluded.** The new method accepts exactly one validated UUID for a registered note. Payloads are a frozen fixed PNG (68 bytes) and deterministic binary (4,096 bytes), with fixed names/MIME. Extra file, path, command, authorization, and expression inputs are rejected. Before opening and again after opening, the driver checks the complete saved body, no preexisting attachment rows for that new note, and native authorization. The browser program checks the current selected note, visible editable owner, and the three required debug capabilities before mutation. Existing foreground/PID/driver-lease guards still apply.
3. **The existing product attachment path is used.** The program issues only `app.state`, fixed `attachment.submit`, `app.flush`, and bounded `waitForIdle`. Committed unchanged product source routes the existing command through bounded `File[]`, captured picker owner, `fileSelected`, and `AttachmentSubmission`, including native storage, insertion/reference validation and document ACK. It does not set or replace a complete document to add attachments, issue SQL, manually pair peers, or claim use of the Android system picker. This source tracing verifies the harness contract; native execution remains untested here.
4. **Full body and reference assertions remain substantive.** The post-submission comparison retains every original text block/mark/attribute and exact plainText, permitting attachment blocks and trailing empty editor paragraphs. The input case has already asserted its exact nonempty text document. The result must contain exactly two attachment references; canonical ownership resolution plus fixture-name uniqueness, MIME, size, and SHA checks bind those references to the two fixed files. Complete document and plainText equality is required on C/A/B.
5. **A/B disk bytes are independently required.** `verifyOriginals` checks authorized production reads on C/A/B against exact fixed fixture lengths and SHA256. For actual desktop peers it also reads the confined managed attachment file under each desktop directory and compares its SHA256. The focused fixture creates separate synthetic A/B directories and proves that same-length managed-file corruption is rejected even when the production-read fixture remains correct.
6. **Original data, health, deadline and cleanup gates remain.** Programmatic source comparison confirmed that fixture byte/reference/disk proof, phone baseline capture, original body/attachment preservation, repeated pause sampling, and final cleanup/pass logic are unchanged from base. `runCases` outside the C-note case is byte-identical, including connection 120-second versus data 60-second budgets, preservation gates, and later scenarios. Baseline capture still precedes desktop construction/sync mutation. Original phone bodies, attachment rows/ownership/references/raw bytes must survive on every peer after merge, after catch-up and at final verification. An original failure remains failed after cleanup; final pass still requires all cases, all preservation gates, both owned desktop natural exits, closed phone driver, and exact owned forward absence.

This increment adds no login, endpoint input, network probe, retry, product behavior change, timeout inflation, or cleanup bypass. Source/helper hashes for the unchanged gates are recorded in `review-result.json`.

## Independent finite verification

Ran once from the exact isolated snapshot:

```text
node --test --test-reporter=tap --test-timeout=30000 scripts/verification/account109-android-files.test.mjs scripts/verification/account109-three-peers.test.mjs
```

**21 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; exit 0.** The reviewer controller imposes a 90-second process ceiling. Tests were VM/in-memory fixtures and reviewer-owned synthetic temporary attachment files only. No live driver was connected and no `NativeApp` was constructed.

Negative coverage includes absent/unsupported debug capability, wrong selected owner, hidden/missing editor, authorization loss, exact-body changes before or after reopening, preexisting attachment rows, old note IDs, extra/injected arguments, absent/unknown acknowledgements, missing references, wrong owner/length, corrupt phone or desktop production reads, and same-length A/B disk corruption. It also covers original body/attachment preservation failures, missing baseline gates, retained forwards, forced/rejected desktop cleanup, and preserving an earlier failure. Failures leave later scenarios unexecuted and cannot be promoted to success by cleanup.

The installed APK's actual debug capability, real selection behavior and end-to-end Session/storage/ACK/transport are not established by these fixtures. Existing source/GUI/runner review requirements and the parent's execution sequencing remain applicable.

## Exact inputs and archive

| Committed changed input | SHA256 |
| --- | --- |
| `scripts/verification/account109-android.mjs` | `ebe180124b541497eccf749fc8fd1044e7fdf3b2d5940002d343e0aa710d4945` |
| `scripts/verification/account109-three-peers.mjs` | `d85be02b49c0cdebc08ca44604432ab6f5bcc7f6e538321ed8ee467b43a4805f` |
| `scripts/verification/account109-android-files.test.mjs` | `4967f45de2e796342f0e1146c5e542f09d6b6a0c7a3b5fdd0e7b4c1fa0f4ec7f` |
| `scripts/verification/account109-three-peers.test.mjs` | `98de30efb88648e0cfcd3d33394646c1cf09c9d9758a3a15341c3fa52096241f` |

`inputs.json` identifies the exact seven test-module inputs and five unchanged product context files, plus the test snapshot. `tools/` preserves the exact four changed source files, including source-authored fixed fixture/test constants. `committed.diff.txt` preserves the exact diff. `focused-test-receipt.json` and `.stdout.txt`/`.stderr.txt` retain the bounded command, timestamps, version, exit and output hashes. `verify.py.txt` preserves the reviewer test procedure, and `review-result.json` records findings, scope, and gate comparisons.

Only this new archive and the isolated reviewer snapshot/synthetic test directories were written. No App, ADB, AX, health request, network, original/default store, build/shared target, grant, profile, DB, or baseline payload was accessed or copied. No product, runner or author checkout edit, merge, build, seal or commit occurred. All reviewer Node/test processes exited; no native process or device lease was acquired. SHA256SUMS covers all archive files except itself, and no archive file is gitignored.
