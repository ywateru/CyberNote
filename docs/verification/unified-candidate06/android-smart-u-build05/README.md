# Smart U09 Android build05 exact package

Canonical build and collection completed successfully for exact source `e482dac285a1e2b66f88bac035824b7c98e832a7`. Collection is **ready=true** for the package-byte/ABI/model/signature gates below. Independent package review and separately authorized device acceptance remain pending. No installation or runtime/pixel acceptance is claimed.

The root-provided authorization is `smart-u-device09-preparation/android-build05-authorization.json`, SHA-256 `c6dd1cd54f0be54381658d7a713d13f5887a65a37afed93f0fe46d3e287446e9`. Exact `input-freeze.json` is 323276 bytes, SHA-256 `189ee0d17005187bdfc9902f969de3dd724f3a619f1d637f3b3abd09f48544c2`; root's prior review checked 628 actual byte identities with no differences. Product aggregate is `b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897` (301 paths), and full listed input aggregate is `abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6` (320 paths). The application/dependency inputs have the same aggregates as build04; the exact source commit and reviewed build tools differ.

`android-attempt01` used canonical `run-build.py`, followed only after success by canonical `collect-outputs.py`, both with this exact authorization/freeze and an exclusive shared target/cache. Child command `pnpm android:build --debug` and runner both returned exit 0; child elapsed time was 24.279 seconds within the fixed 600-second deadline. Build began `2026-11-04T17:10:12.297699+00:00` and ended `2026-11-04T17:10:39.360205+00:00`. Collection ran `2026-11-04T17:11:16.775111+00:00` to `2026-11-04T17:11:21.262660+00:00`, returned exit 0 and ready=true.

Actual startup environment includes `CARGO_NET_OFFLINE=true`, `CARGO_BUILD_JOBS=2` and Android `GRADLE_OPTS=-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false`. Raw build log lines 73–74 contain this attempt's init property output, twice, after its real setup/assertions:

```text
CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce=a1c0326678524738aa1cd9c99796afe8
```

The complete raw log has no configuration-cache reuse message; shared runner/collector proof validation passed. The JVM property is recorded as a JVM property value, with the actual current init execution and absence of cache reuse providing this attempt's evidence. This does not retroactively accept the failed build04 attempt.

All full before/after source, dependency/generated input, tool/version, parent/effective environment, OCR and supplemental comparisons were true during build and collection. `supplementalInputsUnchanged=true` and `supplementalInputsUnchangedDuringCollection=true`. Build owned process group stopped with no remaining members. Temporary init `candidate06-offline-a1c0326678524738aa1cd9c99796afe8.gradle` (576 bytes, SHA-256 `d511be1f1d6177054b134b2032f5f0fd007b8b0ff459d2f1fe805fa79c58d833`) was removed after device/inode/bytes/SHA and ordinary-file identity checks. Minimum observed build free space was 68968034304 bytes, above the 2GiB guard. Signature verification's owned group also stopped with no remaining members.

Before the child command, the fixed prior APK and dist were identity-checked and atomically renamed to `android-attempt01/prior-outputs/application` and `prior-outputs/dist`; both source paths were absent before new generation. The prior APK was the unaccepted build04 output, inode 29383214. Build05 generated a new fixed-source APK, inode 29389444. The two APKs happen to have identical bytes/SHA, which is allowed by the provenance gate; old and new output identities are retained separately. Build04's original failure records were not modified or relabeled.

| Identity | Bytes | SHA-256 |
| --- | ---: | --- |
| New APK / preserved `android-original.apk` | 179247354 | `a6f94fe3c397a6078116c5f2d6c3190ae5091afa214b7005307973f57ef96322` |
| Canonical build result | 7292 | `8869531ccdfd68313317744efef79f0c9210a4af501b88bf877e7726560fbf27` |
| Canonical collection result | 240147 | `37689109403e751a52b4f6e600354253b772e051fc3042d9b9b29067fedb5af9` |
| Raw build log | 11382 | `7e24ff8bb8e04170af4d27b9489fa3bb2210e561c46718fafeea8d3bc0529fbf` |

Complete preserved APK: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/android-smart-u-build05/android-attempt01/android-original.apk`. Collector hashed all 1066 ZIP members. Actual ABI list is exactly `arm64-v8a`. All 25 bundled OCR models (2490310 total bytes) exactly match frozen cached AAR models. `apksigner verify --verbose --print-certs` returned exit 0, APK Signature Scheme v2 verified, one signer. Certificate SHA-256 is exactly `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`, matching candidate04's certificate. This establishes certificate compatibility, not successful on-device upgrade.

Raw evidence is under `android-attempt01/`, including `result.json`, `build.txt`, `inputs-before.json`, `inputs-after.json`, `output-isolation.json`, `generated-outputs.json` and `collection/result.json`. Signature command log is alongside the preserved APK as `command-01.txt`. No build/collector failure or retry occurred. No source/tool/environment/dependency/lock edit, download or cache cleanup was performed. No installation, ADB, GUI, user database, audio export or original Notes operation occurred. The old Mac09 package was not rebuilt or changed. Work is STOPPED, shared target/cache released for independent review. Device runtime, native input, first-offline OCR, audio, persistence and pixel acceptance require their own finite checks.
