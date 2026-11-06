# SYNC87 native stdin redaction: independent focused re-review

Date: 2026-11-06. Verdict: **PASS-HOST-TOOLS-ONLY**. The P2 input disclosure in the original independent review `7ce136da` is resolved by frozen source `920eb6b1`, mapped byte for byte to candidate cherry-pick `54b222c7`. Candidate before this evidence commit is `f8236436`. This re-review does not repeat or revise the accepted UI review.

## Findings

No remaining blocking finding in the changed input boundary. Original P2 and original raw failure evidence remain unchanged in `app-sync87-ui-native-independent.md` and its evidence directory; they are not relabeled as passing.

`protocol.mjs` now returns fixed typed parse/schema/size responses without request fields or caught exception text. Fatal UTF8 decoding, the byte limit before parsing, strict action/field validation and the bounded stream reader address both the disclosure and unbounded newline wait. `run.mjs` stops at the first parse/validation/action failure. Execution, input-stream and cleanup catches use fixed messages. Valid protocol request IDs are still correlation fields and must not contain secrets, as the README states.

The changed files and all remaining native tool source were compared to both the author's frozen source and the candidate source. All eight files match both commits, and independent before/after maps are identical. Source-audited error branches do not emit raw names, messages, stacks or input. No product source was changed by the reviewer.

## Independent boundary verification

A separate Python probe ran 18 actual Node child-process cases with child PATH excluding Python and ADB entirely. Its outputs, inputs' byte counts and SHA256s, per-child natural exits/timings and probe source are retained.

- Original short synthetic marker `Z7X9K2` and a longer marker/prefix no longer appear in stdout or stderr.
- Truncated JSON, truncated escape and invalid UTF8 return exactly one fixed `INVALID_JSON` response, natural exit 2.
- ASCII and multibyte UTF8 overflow return `INPUT_TOO_LARGE`; the limit is actual bytes.
- Wrong request-ID, unknown action/key, null/array types, invalid invitation type and invitation on an unrelated action return `INVALID_REQUEST`, with no request identity/action/stack echoed.
- Both parser and schema failures followed in the same input by `background` produce only the first fixed rejection. No second action is dispatched.
- Sending 32769 bytes while keeping stdin open, without newline or EOF, terminates naturally with exit 2 and the fixed size response within the bounded host wait.
- Exactly 32768 request bytes containing a valid harmless `close` action succeed with natural exit 0. This checks that the new byte boundary does not reject an allowed request at the limit.

Every negative child had empty stderr, no synthetic secret and natural exit 2. The exact-byte-limit harmless close had empty stderr and natural exit 0. The child PATH made Python/ADB unreachable. No valid package receipt was supplied and no device was booted, queried or acted on.

Existing eight Python host guard tests, ten Node CDP/XML checks and all 21 author's input checks were independently rerun and naturally exited 0. The input suite includes split stream chunks, early oversize termination without consuming another chunk, safe valid-pair action failure and safe generic action failure. Affected JS syntax and diff-check also passed. These results are host tool checks only.

## Scope and evidence

Before/after eight-file aggregate: `7a866dfafa149d603e28d9690ca61faa5bfe1c0eff8ee215b04d61650e73e4bb` using sorted `path NUL bytes NUL`. Exact per-file hashes and commit mapping are authoritative in `docs/verification/sync87-native/input-redaction-independent/{source.before,source.after,summary}.json`.

All new logs were produced under `/private/tmp/notes-sync87-native-redaction-independent-01` and copied after command completion. The `.log` files are intentionally force-added. The original blocked report and its failures are preserved; this new report records the narrow repair result.

No ADB invocation, emulator boot, APK installation/start, CDP connection, native chooser, public route or real-peer test occurred. Original device/AVD, the approximately 13-second unsaved recording, microphone, Apple Notes and user stores were untouched. `exportImage.originalBytesVerified:false` remains unchanged. Exact image/audio export bytes, actual provider behavior, real peer convergence, foreground reconnect and app/emulator restart acceptance remain pending. Passing this gate permits the host tool source to proceed to root integration; it does not establish native or complete sync acceptance.
