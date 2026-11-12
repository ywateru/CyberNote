# FINAL101 generated-output identity — independent review

Status: **accepted**, scoped to author commit `24a9d4fef7f4e5ca99c9ab84d8a2afaeb46c92a4` over base `e6421f3786d7e78896f41efab13f54a92d8c35ec`. No blocking findings. This accepts the precise product-input exclusion change; it does not accept final native packages, installation or the full six-project goal.

## Scope and source review

Reviewed all4 author files: `scripts/build-info.mjs`, author fixture, architecture contract and FINAL101 task handoff. The production diff only adds exact generated-file/directory exclusions and the anchored `^plugins/[^/]+/android/\.tauri$` directory boundary. It retains all existing product roots, version/stamp rules, hashing and package verification. No broad `android`, `generated`, package prefix or filename substring exclusion was introduced. Existing build/assets/jniLibs/schema exclusions did not expand.

The actual source tree contains generated Tauri activity and ProGuard files with explicit auto-generated headers. The copied plugin SDK has `namespace = "app.tauri"`. Independent actual-tree inventory confirms474→433 inputs, exactly41 removals and no additions. Every removed path belongs to the specified plugin SDK `.tauri`, project `.tauri`, exact application `generated` package, or exact `app/proguard-tauri.pro`. MainActivity, production Mac thumbnail.m, plugin Kotlin, manifest and build.gradle remain included. The independent JSON preserves the full removed-path list and module source hashes.

## Independent direct evidence

Command (run only in `/private/tmp/cybernote-build-identity101`):

```sh
node scripts/check-build-identity-review101.mjs docs/plan/reviews/build-identity101-probe/result.json
```

Result: **29 checks passed**. The script imports the pre-fix implementation directly from Git and the actual author implementation, and uses temporary Git fixtures with fixed source bytes. It does not patch the author function or substitute traversal logic.

-4 representative before/after causes: a not-yet-built plugin SDK at arbitrary nested depth, project `.tauri`, exact generated application package at nested depth, and exact generated ProGuard file. Old logic includes each ignored-by-Git output and rejects the previously prepared stamp; deleting restores it. Fixed logic excludes it, and creating, rewriting and deleting preserves the prepared stamp. Keeping identical fixture script bytes across the two implementations isolates traversal behavior from the script source change.
-23 hand-authored or near-name paths: added source rejects a stamp; a second content change rejects a newly prepared stamp; removing the fixture source restores the original fingerprint. This includes actual provider Kotlin/Manifest/Gradle, scan Kotlin, native Objective-C/C, Rust, MainActivity and application manifest/Gradle. Additional depth/prefix boundaries include nested `plugins/child/nested/android/.tauri`, `android/src/.tauri`, `android-backup/.tauri`, `.tauri-backup`, `.tauri.kt`, `generated.kt`, `generated-backup`, `notesclone2/generated`, other-package generated paths, parent-level ProGuard and `.pro.backup`. These stay inputs.
-1 build-script-self mutation: changing `scripts/build-info.mjs` invalidates the old stamp; restoring bytes restores validity. The algorithm change requires a fresh prepare; the removed41 files do not justify reusing a pre-fix release stamp.
-1 actual-tree inventory: independently checks474/433/41 and that every removal is inside the exact reserved paths, plus real authored-file inclusion.

Evidence: `docs/plan/reviews/build-identity101-probe/result.json`. `git diff --check` also passed. Review adds only this report, independent probe/JSON; production and author test logic are unchanged. No need to repeat author21 build-info frontend or18 package-entry tests: their implementation boundaries are unchanged, and this independent review directly exercises the changed exclusion/stamp boundary.

## Limits and next action

No Cargo/native build, Android generation, App package, ADB, user-data or delivery-tree work was performed. A real native generation may create additional paths in future; this review validates the exact paths in the current contract and does not promise all future generators are covered. FINAL101 should prepare a fresh stamp after integration, then use real native dual-package build and package verification. Formal MEDIA99M after-measurement still waits for tool review and accepted99UI source refresh by the parent.
