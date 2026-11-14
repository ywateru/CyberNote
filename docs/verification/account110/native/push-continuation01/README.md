# Existing same-owned single Push diagnostic

This archives the already completed `/private/tmp/account110-device-actions-continuation-subclass01/result.json` without changing its bytes. No App, test or product command was run to create this archive.

Uncompressed result: 312,122 bytes, SHA256 `effa0a345128a78a564bdf7c4547e380925b9e3b1cbe467f046fe76b7c7061b4`. `result.json.gz` is deterministic gzip of those exact bytes, checked by round-trip decompression; `result-uncompressed.sha256` pins the original bytes.

The actual diagnostic imported the frozen main's original `NativeApp` and `syncOnce` exports directly, used a NativeApp subclass only to record finite start/status/poll outcomes and timings, and normally restored the existing owned fresh-live03 A/B libraries. Product source was `29c878108b2ea421b5e4fccd71547206071fdbfa`; the actual external subclass harness SHA256 was `02c64ae55da6a945515205afe1877b29158207308aacdcb956eb9f5be3c366f8`. Related committed reusable harness: `da44bc51ca5e35e75e19b0963c7193a5120cd61e` (`account110-push-continuation.mjs`); it is separate from the external subclass harness identified by this receipt.

One original `syncOnce(Push)` was submitted, with unchanged deadlines and no retry, login or grant/Noise copying. The target matched B's current live registry identity (only the boolean was recorded). Start ACK, running observation and successful Push terminal state were captured. In the Push phase, start returned once (maximum 2 ms), status returned 336 times (maximum 27 ms), and poll returned 336 times (maximum 6 ms). Both clients exited naturally with code 0, pipe close confirmed, no forced signal; cleanup succeeded. The recorded sourceAfter was clean at the product revision and the original failed result was unchanged.

The status is **`single-push-succeeded-not-acceptance`**. This establishes a successful real same-owned Push command, not full direction/content/attachment acceptance. The original fresh-live03 **FAIL / push / NATIVE_TIMEOUT** remains unchanged; its exact timed-out boundary and cause remain unknown. This successful diagnostic neither replaces that failure nor proves why it occurred. The separately archived full owned continuation remains a separate result.

The receipt contains fixed finite action labels, booleans, counts, hashes, timings and lifecycle fields. No raw message, expression, argument, credential, URL, identifier or document body is archived. `SHA256SUMS` covers these archive files.
