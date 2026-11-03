# Lifecycle overlay application 01

2026-11-04. The separate, authorized actual-project artifactView validation succeeded at HEAD `083a8d44f9a31ea4047a9c4e5e67b85902924f59`, unchanged before/after. No APK/Rust/app compilation ran. BuildSrc compile was UP-TO-DATE. No metadata/dependency/product changes or manual original-cache edits were made.

The new read-only overlay is `/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro`. Exactly two files were copied from the isolated Gradle own-store output, excluding lock/gc files: 18,667-byte module-artifact.bin and 55,037-byte AAR, total 73,704 bytes. Their identities are identical before and after validation; aggregate `2119fb466e6bb78233d6454b62a910337b2a4aa25e34fc0ff365601becc17518`. Files are mode 0444 and directories 0555.

The first application invocation successfully resolved the artifacts, then stopped on the diagnostic script's overly narrow expectation of exactly one artifact. The original configuration returns two IDs for the exact coordinate. The corrected script permits multiple artifacts and verifies each AAR's SHA. Its full log and the initial assertion failure are both preserved.

Final invocation: existing Gradle distribution directly, original selected GRADLE_USER_HOME plus GRADLE_RO_DEP_CACHE set to this new overlay; --offline --info --no-daemon --no-configuration-cache --max-workers=1. External limits: 60 seconds, 2GiB free, stop on download prompt. Exit 0 in 4.72 seconds, minimum free 4,327,063,552 bytes; no guard/download condition occurred.

Actual `universalDebugRuntimeClasspath` artifactView kept Google and Maven Central and filtered only lifecycle-livedata:2.10.0. Results:

1. `ModuleComponentFileArtifactIdentifier`, selected `releaseVariantReleaseRuntimePublication`, attributes library/external/aar/java-runtime/release, from the read-only overlay.
2. `DefaultModuleComponentArtifactIdentifier`, adhoc variant, from the original selected cache.

Both actual AAR files have SHA-256 `3e8c009fc88da1c52e4ed05a81269d5ac9bd405046f300307f5e3a17e201a6df`. This confirms the original runtime variant's missing file-key cache record is supplied by the isolated overlay. It proves the targeted configuration artifact resolution; it does not prove complete APK build or runtime acceptance.

Full-build proposal: a new Android-only recovery run with its own current-HEAD/input freeze, explicit supplemental GRADLE_RO_DEP_CACHE path and two-file before/after identities, and explicit reference to the previously accepted d8 Mac manifest. Verify all original 279 input rows individually match, enumerate only added source tools, and do not create a new Mac marker or claim both platforms share the new complete freeze. The existing common.capture does not include the supplemental environment; it must be recorded and compared separately. Existing safe runner requires a Mac marker, so a separately reviewable Android-only derivative is needed. Keep safe init cleanup, serialization lock, offline enforcement, disk/download monitor, default features and normal CLI toolchain behavior. No full build is authorized/executed by this stage.
