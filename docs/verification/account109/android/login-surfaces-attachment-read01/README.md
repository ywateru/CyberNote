# Original Android attachment: bounded product read

The single read at 2026-11-13T13:15:41.409Z–13:15:43.484Z verified the current attachment reference, owner and authorized original bytes. **Its addition remains unexplained. This receipt does not replace the historical baseline or satisfy the login-surfaces preservation gate.**

## Observed chain and preservation

The fixed Account109 helper connected to the existing package `com.local.notesclone.account109`, serial `98895a3147304c3132`, PID `28911`, with `launch:false`. Its exclusive lease and exact PID-owned WebView forward restrict CDP to the unique main `tauri.localhost` target. The helper bytes equal main at the source-search revision below.

The only product operations were account status, workspace read, authorized `read_attachment`, workspace read and account status. `readAttachment` resolves the descriptor's owner and requires that note's current workspace authorization; the helper supplies the genuine native access value internally. Native `read_attachment` checks `session.sensitive` before reading the Store attachment. No caller-provided grant, token or owner override was used.

All four known note IDs and their complete plainText match `../9263-debug/synthetic-after-restart.json`; three complete documents match. For `321e9d6c-d590-437d-8edb-d6ed2feae3fa`, the original three blocks and document root fields match, followed only by an attachment node and `{type:"paragraph"}`. Recursive traversal finds exactly one attachment reference, matching the sole descriptor, whose owner is that note. Node name/kind match the descriptor; other notes have no attachment references.

The authorized product read returned **114,608 bytes**, SHA-256:

`c95b15e981fe59edf68449ac3a73bc01f609e5e5e74696bb0ef7302927e40cab`

Descriptor size, decoded byte count and helper digest agree. All current note and attachment fields are deeply equal before/after this read. Account state remains `error`, enabled=false, no profile, `account_network / coordinator`; PID is unchanged. These comparisons establish read-time invariance, not historical provenance or historical equality of every note metadata field.

The exact temporary forward `tcp:56716` → `localabstract:webview_devtools_remote_28911` was removed by driver close and verified absent. The Account109 lease was also checked absent after the run. No app launch/restart/install, account/editor mutation, error clearing, database/grant read, credential access or network probe occurred. Raw document content, attachment bytes/base64, filename, MIME value, access values and raw errors were not saved.

## Fixture and submission evidence search

`result.json` records byte-for-byte comparisons with the fixed Account109 phone PNG/BIN and desktop PNG/BIN fixtures. All four fail byte, MIME and display-name equality. Further source-only computation checked these existing Sync108 fixtures; all also fail byte equality by length and SHA:

| Source fixture | Bytes | SHA-256 |
| --- | ---: | --- |
| `sync108-native.mjs:txt` | 54 | `905e25948b0a1e34a506808226acce419a07eadd9c8832cd6da431a54bee8954` |
| `sync108-three-peers.mjs:syntheticPNG` | 3,677 | `3cab9ba707426dcea5e90bc86e8e90db7998a45c2f92e0bd65d040c800ae823a` |
| `sync108-three-peers.mjs:file` | 298 | `932b45ce935d2d7efef0b5d83bf36d18cc323f62baa60a02691afb596dce0277` |

The Sync108 native PNG is the same 68-byte PNG already compared in the receipt. Source SHA-256 values for the two Sync108 modules are respectively `78b17a3d9165e1f3b85a58dd7375a2cfaa430a55bb26876479ec0e7b9ebbe0d0` and `aa50287324579553f98d5d726893901a47d2c23670ed1d8273053f5cc717fd51`.

At main `3f5c3981a78bbef7be0c76ec7c64eadf89055f19`, an exact attachment-SHA search under tracked `docs`, `scripts` and `src` found no reference; no tracked file anywhere in that tree has length 114,608. A target-note-ID search of Account109 archives and verification scripts found original note snapshots, the recent preflight/structure reports and runner references, but no recorded actual attachment submission tying this addition to that note. This is a bounded repository search, not an assertion about all private/untracked material or all Git history.

`native/phone-files-review01/README.md` explicitly records device-free preparation, with no actual phone or transport run. That preparation cannot establish this addition's origin. The current fixed phone file submission helper also restricts insertion to a note created and registered in its driver session, so its existence alone is not evidence of an insertion into this historical note.

`src/attachment-operations/operations.ts` inserts an attachment node using descriptor ID/name/kind and can append an empty paragraph after that atomic node. The observed shape is consistent with that production path. It proves neither the operation, actor, time nor fixture used here.

The receipt hashes the descriptor ID as SHA-256 of its raw UTF-8 string. The preceding structure receipt did not archive its hashing implementation; its digest must not be treated as directly comparable without establishing the same convention. This read proves the current reference chain and within-read ID invariance; it does not claim descriptor-ID continuity across those separate receipts.

## Reproduction and remaining gate

`read-only.mjs` is the exact one-shot source used, based on worktree source `f86a5b785d589a5a343eba3a3642cda3f5fee7d6`. The result records the historical snapshot and Android helper hashes. The source refuses to overwrite its existing receipt. It is evidence for review, not an instruction to repeat device access. `SHA256SUMS` covers the archived source, this explanation and the unchanged finite result.

No new historical baseline is accepted. Explaining the addition still requires a pre-existing actual product-submission receipt or independently known synthetic fixture with matching original-byte hash and a link to this note. Without that evidence, preserve the original phone error/data and keep the preservation prerequisite blocked. New package identity or network reachability does not resolve this provenance gap.
