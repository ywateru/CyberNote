# MEDIA105 atomic join narrow independent review

Decision: **blocked by the actual after-row owner boundary**. The tools are released to the author for this correction only. No browser, build, companion, formal measurement or device execution occurred. Other previously accepted protocol/tool conclusions remain unchanged.

The exact three-file before/after patch reconstructs to SHA256 `bbeef5d5d908ad0c74f0418bc68170c63e3910deb9c792816787a67e83a20a92`; every frozen hash matches. Independently ran all ten current pure groups, including the atomic cases; they pass but miss the actual-row defect below. Raw: `artifacts/media105-atomic-join-independent/scope.json` and `pure.json`.

## Confirmed blocker

The new `join` requires `calls[0].attachmentId === card.attachmentId` for both sides. For after, `backend.rows` is explicitly `tracedTransport.rows` (`media-trace.mjs`). That trace creates `attachmentId` only for `read_attachment` (`trace-transport.mjs`), so an actual `acquire_attachment_source` row has no such field. Its real owner is captured by the separate media wrapper row and validated grant. The new unconditional assertion therefore rejects a valid after source before reaching the grant check.

Independent replay used the **unmodified retained run1 after IPC rows and media wrapper rows**, plus one coherent current-card tuple for an already successfully associated source. Actual IPC id 22 / coverageCall 47 is a successful `acquire_attachment_source` without an `attachmentId` field. Its same-id wrapper row is tagged, successful, and owned by the exact card attachment. The exact frozen new join throws `105 IPC owner mismatch` (`undefined` versus the valid card ID), performs no grant lookup and publishes no source link. This is a deterministic tool incompatibility with existing real data, not a product/source failure. Evidence: `artifacts/media105-atomic-join-independent/real-after-owner-boundary.json`.

The author's `stable-after` pure fixture adds `attachmentId` directly to the synthetic IPC row, unlike the real trace. That fixture explains why the new tests pass while the real after path would fail.

Required narrow correction: validate baseline and after ownership against their actual existing evidence structures. For after, keep unique successful actual IPC correlation, and tie its exact call ID causally to the real media wrapper/validated grant ownership and purpose. Do not populate an owner from the card being checked, invent fields on retained rows, or fall back to card-ID self-comparison. Replay the existing real run1 row shape through the exact corrected join; swapped owner, wrong call/ID and mismatched grant evidence must still fail. No new browser/build is needed for this correction.

## Atomicity and logging findings retained

The new browser `c.join()` invokes the same-root, single-traversal snapshot and exposes tuples with owner, mount, source/link, visibility and the URL obtained from that source read. Node makes one browser evaluation and filters visibility from that tuple. It no longer compares a later URL-list observation with an earlier snapshot. Ordinary snapshots omit URL, and source-link evidence keeps the hashed capability/grant metadata. Current-source and source/link owner checks remain mandatory.

Failure diagnostics use a fixed check label, boolean visibility/prefetch, safe bounded local string fields and an integer call sequence; the replay diagnostic contains no raw capability URL. The old assertion failure is preserved. The new owner assertion is stronger in intent, but must use the actual after owner evidence before these tools can be accepted.
