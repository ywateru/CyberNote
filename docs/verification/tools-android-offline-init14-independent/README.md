# Android offline init14 independent evidence

Scoped pass for exact commit `93e0e13da6e3e0efe2450684f9f909e795aeda6b`: source review, real Python child environment handoff and failure rejection only. No confirmed P1/P2/P3 finding.

`controlled.json` records an independent rerun of 10 controlled runner cases and 9 collector mutation rejections. `safety.stderr.txt` records the unchanged 7 safety tests. `extra-collector.json` records 9 additional collector cases (one valid repeated-proof acceptance, eight rejections) and four invalid init nonce rejections. The extra fixture retains real temporary output/provenance checks. `commands.json` records bounded Python-only invocations; stdout/stderr are retained.

`input-initial.json` and `input-final.json` independently rehash exact tool blobs, 320 current inputs, 301 product inputs, six protected rows, 38 historical Mac records, two complete Mac bundles and the preserved prior Android APK. Review is `docs/plan/reviews/tools-android-offline-init14.md`.

Python markers are simulated; Groovy/Gradle, native CLI propagation, build05, device operation and pixel fidelity remain unproven by this review. No GUI/ADB, original Notes, user database, platform/version/build tool, shared target/cache, product/tool edit, stage or commit. Existing failed Android04 and Mac09 sealing evidence are unchanged. STOP and shared target/cache released.
