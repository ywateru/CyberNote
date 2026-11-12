# Android Manifest103 independent review

- Product baseline: `e521306ea61a4d28ac9de44752524a4f2a838cf0`.
- Reviewed author: `89d4c352be56e189f49d6fb994446faa89e22666`.
- Reviewer: `/root/design100_independent`, different from author.
- **ACCEPTED for the narrow source integration gate.** Actual complete release lint remains a required later gate; no build/lint pass is claimed here.

Read the actual v2 complete-lint evidence at root `artifacts/mobile-format102-native-diagnostic-v2/lint-results-universalRelease.txt`. It reports exactly **2 errors, 30 warnings, 1 hint**. The two errors are `MissingTvBanner` at application and `ImpliedTouchscreenHardware` at manifest. Their explanations tie them respectively to the Leanback launcher intent and declaring availability for TV without optional touchscreen. This is not the narrower lintVital result and must not be retrospectively reported as a full lint pass.

Independently parsed baseline and candidate XML and verified:

- Candidate bytes equal baseline with exactly the two specified TV declaration/comment blocks removed (five lines). Candidate SHA256 is `ca66daacdadfd0e28aeba29b2ffbe5fee1c434ffb3c663f7c0da6ce7af0a8611`.
- After removing only `android.software.leanback` and `android.intent.category.LEANBACK_LAUNCHER` from the parsed baseline, all remaining nodes, child order, attribute values **and attribute order** equal the candidate.
- The existing activity retains exactly `MAIN` action and phone `LAUNCHER` category. Exported state and all other activity attributes are unchanged.
- Permission declarations, optional camera/microphone hardware, FileProvider and its metadata, backup settings, network-security reference, window/IME settings and all other application attributes are protected by the exact remaining-byte/XML comparison.
- Only Manifest and task documentation differ from baseline. No banner, false TV support, optional touchscreen workaround, lint suppression/baseline, generator edit or permission expansion was added.
- `git diff --check` passed.

Removing the two unimplemented TV declarations removes the manifest's TV-specific trigger for these two reported fatal rules while retaining normal phone launch behavior. It expresses the supported mobile product scope instead of inventing TV behavior to satisfy lint. This static causal conclusion does not establish that a future merged manifest or complete build has passed lint; parent must run actual full release lint after narrow integration and preserve remaining warnings accurately.

The sparse checkout patterns were read and not expanded. No Cargo, Gradle, device, CUA, build output, copied target or product-source modification by the reviewer. Only this review document is committed. Manifest103 does not explain or fix the separate mobile-format102 long-press F1.
