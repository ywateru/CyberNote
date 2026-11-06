# a264945f visible-stage recheck: original findings closed, cross-read P2 open

The two original hidden-editor findings are closed. Final acceptance of exact rendered original-media bytes remains open because `desktopMedia` hashes one native read and uses a different, unchecked native read as its DOM comparison baseline.

The final stage source exactly matches author `a264945f` including `f8cc03cb`; `source.json` records the SHA256 and local mappings. Six narrow checks naturally exit1 in0.030383584s: five pass, one new counterexample reproduces. No old suite was rerun.

The original fixture function is loaded verbatim from the earlier committed `check.mjs`. Its original `hidden:true` inputs and0×0 editor geometry remain unchanged. Only the fake DOM adapter is extended for the new async observation expression and exact owner/card/control selectors. The adapter correctly awaits async evaluation, as the real client does.

- Both original hidden text/media inputs now refuse before state save.
- Visible full-text and two-media positive stages pass using their real new scenario and normal navigation helper implementations.
- Exact expected editor ownership, attachment IDs, image/audio titles, visible controls, decode state, same-origin blob source and blob bytes are tested. Wrong owner/ID/title/control/decode/origin/bytes all refuse.
- The cross-read counterexample passes correct fixture bytes on `assertNativeOriginal`'s first `readAttachment` call, then supplies different equal-length bytes on the second read. The synthetic DOM exactly renders that second data source. The stage saves state and records `decodedImageAndAudio:true` despite those rendered bytes differing from the original bytes whose SHA was checked. The expected rejection test therefore fails.

Fix the last case by reusing the exact native-read source whose length/SHA was verified, or verify the second read's length/SHA before using it as the DOM baseline. Keep this counterexample unchanged for the final recheck.

The `synthetic-*` result files are only host fixture outputs. Their copied implementation scope strings do not constitute actual Android or decoder evidence. Zero ADB/device actions, actual UI/network/media decoder use, invitations, user Store reads, builds or main writes occurred. This report closes the original UI-hidden assertions but does not accept the remaining rendered-byte proof or actual sync run.
