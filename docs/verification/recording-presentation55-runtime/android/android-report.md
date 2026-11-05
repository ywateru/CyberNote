# Android10 finite runtime acceptance — blocked on saved submission

Date: 2026-11-05 (+0800). Device: `emulator-5580`. Installed package: `com.local.notesclone`. Inherited exact candidate identity from `install-observation.json`: source `9167db94908ac635b026220e782878447c9e16a7`, APK SHA-256 `975f8e95c568f9c1010eb89e1f1a66e867b3b598ca7987c666143149c731da1f`, prior `adb install -r` succeeded. This handoff did not reinstall or rebuild.

**Result: runtime blocker.** Preview and resumed capture worked, but completing the recording failed and the existing Retry reproduced the same visible error. Single saved card, editable post-save body, cold restart and saved playback could not be accepted. The recording remains in the failure sheet, stopped, with its 13-second session retained; no close, force-stop, restart, clear/reset, deletion or audio export was attempted.

## Exact observed sequence

1. Inherited `07-paused.png` showed the new QA recording paused with header `今天 下午12:16 00:06` and actual playback position `00:00.00`. New `08-current.png/xml` confirmed only `QA-RECORDING-55-ANDROID`, body `Android10-local-recording-acceptance`, recording dialog, enabled Play/Continue/Done. No app data or audio files were read.
2. Tapped Play at `(540,1752)`, waited two seconds, captured `09-preview-advancing.png`. Actual preview position displayed `00:01.12` and pause glyph. Tapped the same playback button to pause; `10-preview-paused.png/xml` showed `00:02.27` and restored Play/Continue. This establishes actual visible media-position advancement, not audible output.
3. Tapped Continue at `(540,1940)`, waited four seconds, captured `11-resumed-capturing.png`, then immediately tapped Pause at the same coordinate in a finally block. Total command wall interval was **7.428697167 seconds**, below 30 seconds. `12-resumed-paused.png` showed the original first-start time `12:16`, accumulated active header `00:13`, stopped preview at `00:00.00`, Continue and Done. No new recording/session was created by the verifier.
4. At **12:22:36.600847**, tapped Done `(972,1940)`. `13-done-saved.png` at approximately12:22:39 showed the sheet still present, disabled capture control, Retry, and red error:

   `原附件目标、正文或授权状态已改变；已保留恢复身份，请勿关闭窗口`

   No intervening text edits, note switches or navigation were performed by this verifier. It cannot be inferred from the message alone which target/body/authorization condition changed, or at which prior stage.
5. At **12:23:10.554383**, tapped the existing Retry once at `(972,1940)`. `14-save-retry-outcome.png` showed the same error, same13-second retained recording and Retry. No more device actions were performed.

## Evidence and limits

`verify-actions.jsonl` preserves every command, local timestamp, return code and text output in order. Binary screenshot output is written only to the named PNG; no audio is acquired. After the failure, both UIAutomator dumps returned **exit137 with empty stdout/stderr**; these acquisition failures are retained in the action log, not hidden or described as successful XML reads. Actual failure text is read from the saved screenshots. Existing `08-current.xml` and `10-preview-paused.xml` were captured successfully before the submit failure.

The failed submission blocks the planned persistence/restart checks. Restarting would risk discarding the explicitly retained in-memory File, so the app remains untouched in the error state for diagnosis. No user database, private app files, recorded audio or logcat were accessed, and no product source, package or git state was modified by this runtime handoff. No claim is made about encoded duration, audible output, Apple pixel parity or generic Android device coverage.
