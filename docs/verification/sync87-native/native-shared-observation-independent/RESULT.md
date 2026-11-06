# Frozen 176f3dcd: shared UI observation and chooser-stage delta

PASS for this source/host-only delta review from `95aa2c3f` to `176f3dcd`, including `7b9b2f56`. No blocking source issue was found in the scoped change. This is not actual attachment selection or persistence acceptance.

Five relevant source files exactly match the author freeze; `source.json` records hashes and local cherry-pick mappings. `source-delta.patch` preserves the exact reviewed delta. No existing 4/14/22-check suite or full suite was rerun.

The eight minimal independent checks execute exact extracted shared-reader, native-node, native-tap, chooser-stage and event-flush bodies with synthetic host dependencies. Final natural exit0, 0.027917s; see `process.json` and `result.json`.

- The common `readNativeUI` retries only the first exact `Refused` / `bounded subprocess failed 137: ` read-only `uia` failure, records a fixed first-retry event and pauses250ms. A second137, other exit, nonempty stderr, other error identity, malformed output and unrelated exception propagate without additional retry.
- Both `nativeNode` and `nativeTap` consume the shared reader. Their `hold` and `tap` calls stay outside the read-retry block. A failing hold or tap is issued exactly once, even when its error itself looks like137.
- The guarded serial/AVD subprocess path remains unchanged. Static assertions retain independent `adb -> ownership -> run` validation for each observation and action. This is source assurance, not fresh device-runtime proof.
- `attachmentsOpen` resolves the owned synthetic receipt note, reopens that exact ID when necessary using the normal UI helper, dismisses an actually shown IME, observes the Store before opening the chooser, and uses the normal media-menu/file-picker path. It adds no mutation command, URI or path injection.
- The Recent multi-selector filters real DocumentsUI package and exact Recent/title, exact synthetic filenames, then uses ordinary native hold/tap/Open. A foreign package and filename suffix fail the selector checks. Store reads after choosing only observe persistence. Whether a given actual chooser can find these nodes remains an actual-run question.
- Global observation events contain only fixed retry records and flush once to the event file before client close. The global event row has no client identity; it should not be attributed to a particular app lifetime without separate stage evidence.

The first independent run exited1 in0.026040334s because this review's expected mock call object omitted an explicit `args: undefined` property present in the mock's actual object. The runner source was unchanged. The corrected expectation passed all eight checks. The exact initial fixture, raw output, result and natural execution metadata remain in the `attempt01-*` files; that failure is a reviewer-fixture error, not a product or author-tool defect.

No ADB, emulator, device, build, main write, microphone, invitation or user Store access occurred. Actual multiple-file selection, saved attachments, continuous addition, image export and subsequent sync acceptance remain open and are not marked PASS here.
