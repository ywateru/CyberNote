# Native NDJSON input redaction repair

2026-11-06. Frozen repair source `920eb6b1`. Author host checks only; independent
re-review remains required. No production application code changed.

Independent review `7ce136da` blocked source `7fd245ba` because JSON.parse could
throw before a request was assigned and the catch emitted SyntaxError.message.
Node22 included raw input/prefix in that exception. The original independent
short-marker and prefix stdout/stderr plus result JSON are copied byte for byte
under `original-independent-failure/`, with SHA256/provenance. They remain failed
historical evidence; this repair does not replace or relabel them.

The new pure protocol module limits a request to32768 UTF8 bytes before parsing,
uses fatal UTF8 decoding, strictly validates known actions/fields, and emits fixed
typed JSON/validation/size failures without any request identity or exception
text. The stream reader stops at the first failure and stops oversize input
without waiting for a newline or consuming subsequent chunks. The execution
catch and cleanup/input-stream failures also use fixed safe messages; no raw
error.name, message or stack is emitted. Successful request IDs remain bounded
protocol correlation identifiers and are required to contain no secrets.

The frozen final run preserved eight commands, each natural exit0 with wall time.
- Existing Python8 unittest methods passed.
- Existing Node10 CDP/XML checks passed.
- New21 input checks passed:15 actual negative serve subprocesses, one valid
  pair operational failure subprocess, and five pure protocol/stream checks.
- All affected JavaScript syntax and diff-check passed.
- Eight source file fingerprints are identical before/after; sourceChanged=false.

Negative stdin cases cover the original short synthetic marker, longer prefix,
truncated invitation JSON, truncated escape, ASCII/multibyte byte overflows,
null/array request types, unknown action, invalid request-ID, invitation on an
unrelated action, a sensitive unknown key, oversized/non-string invitation,
and a first invalid line followed by a device action. Every failed parse or
validation emits exactly one fixed response, exit2, empty stderr and no marker,
request ID, action, or stack. Valid pair failure also emits a fixed safe message
without the invitation. Stream-level checks confirm chunk splitting, no second
request after failure, oversize early termination, invalid UTF8 and safe action
failure formatting.

All serve children run under an explicit PATH where Python/ADB cannot be
executed. Only freshly prepared host synthetic fixture state and a nonexistent
receipt path are used. No emulator/ADB/native process was started or queried;
ADB invocation count0. Original device/AVD, unsaved recording, microphone and
user data remain untouched. No APK receipt has been supplied, and native provider,
original-byte export, pairing, lifecycle and convergence acceptance remain pending.
