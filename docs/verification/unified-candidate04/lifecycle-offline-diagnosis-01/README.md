# lifecycle-livedata offline diagnosis 01

Date: 2026-11-04. Scope: only `androidx.lifecycle:lifecycle-livedata:2.10.0` and one independent exact-AAR probe. No APK build or product change. Product bytes remain from d8f832e83349c7503b872e0e88853d1ab7b0713a; main's later docs-only commits do not represent a new product freeze.

## Findings

- The AAR exists in both selected `/private/tmp/notes-scan-gradle-home` and default `/Users/water/.gradle`. Both are 55,037 bytes, SHA-256 `3e8c009fc88da1c52e4ed05a81269d5ac9bd405046f300307f5e3a17e201a6df`, SHA-1 matches the `ce0b5f930a64679a621c8bc67c060a7820c0a57b` directory.
- Both have the same 10,929-byte internal descriptor under metadata-2.107/descriptors with repository-key directory `d4e342018b23d58be902a60e67105aa1`. Raw POM and `.module` files are absent from this coordinate's files-2.1 directory. The URL index still references their former paths.
- Each cache's resource-at-url index contains the exact Google POM, module, and AAR URLs. Thus an absent Google URL entry is not established. The exact URLs are `https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-livedata/2.10.0/lifecycle-livedata-2.10.0.{pom,module,aar}`.
- Three direct index files differ between the caches. A raw matching string does not prove a current reachable B-tree entry or the repository/artifact key requested by the app. No unverified index-key cause is asserted.
- Installed Gradle 9.6.1 bytecode shows artifact-cache keys serialize repository ID and artifact ID; TwoStageModuleArtifactCache checks writable before read-only cache. This explains why simply adding a read-only cache is not guaranteed to override an existing writable entry. It does not establish that shadowing caused attempt03.

## Independent selected-cache probe

A 1,300,148-byte selective read-only snapshot contains the three direct metadata-2.107 binary indexes, this coordinate's descriptor, and this AAR. Original paths were checked before/after copying and after the probe; all five identities stayed equal. Snapshot: `/private/tmp/notes-lifecycle-probe-01/selected-ro/modules-2`. No old cache was manually modified. Existing daemons and distribution partial were preserved.

The independent, plugin-free Groovy project uses only `google()` and `androidx.lifecycle:lifecycle-livedata:2.10.0@aar`, transitive=false. It directly invokes the existing Gradle 9.6.1 distribution (no wrapper) with `--offline --info --no-daemon --no-configuration-cache --max-workers=1`. Its new GRADLE_USER_HOME is `/private/tmp/notes-lifecycle-probe-01/selected-home`; GRADLE_RO_DEP_CACHE points to the snapshot's parent directory.

Initial restricted execution failed before resolution because local socket access was denied (0.82 seconds). After separately authorized local socket access, the same probe succeeded in 2.06 seconds, exit 0. The actual returned AAR path is inside the read-only snapshot, with the expected SHA-256. Minimum observed free disk was 4,335,042,560 bytes. External guard: 60 seconds, 2 GiB minimum free, stop on distribution/download prompt. No stop condition or download prompt occurred. Gradle's temporary single-use daemon stops naturally at completion; old selected-cache daemons were not stopped.

This proves this exact AAR is usable offline with the standalone artifact identity. It does not prove the app's `universalDebugRuntimeClasspath` variant/artifact identity, its full transitive graph, or a successful Android build. No default-cache probe was performed because selected succeeded.

## Next proposed action (not executed by this stage)

Use `/private/tmp/notes-lifecycle-project-probe-01.init.gradle` with the original project and existing selected GRADLE_USER_HOME. It registers `:app:notesLifecycleActualProbe`, obtains the existing `universalDebugRuntimeClasspath` and an artifactView filtered to the exact module/version, keeping actual repositories and variant selection. Print artifact ID class, ID, selected variant and attributes, local file and SHA. Disable configuration cache and use a fresh process to obtain clear resolution errors. Run once with the same external 60-second/disk/download guard.

This actual-project invocation necessarily permits normal Gradle cache writes (selected cache, project .gradle, and potentially buildSrc/included-project build caches). It runs no app compiler/Rust/APK task, but Gradle's buildSrc configuration tasks may execute. Separate parent authorization is required and requested. No manual cache patch or synthetic POM is proposed. A cache-only repair can be chosen after the actual identity is known.

## Evidence and sources

- `index-coordinate-evidence.json`: narrowly bounded matching contexts plus direct index/AAR identities.
- `gradle-cache-javap.txt`: existing installed Gradle classes, static javap only.
- `preflight.json`, `result.json`, `selected-log.txt`: source/snapshot guard and restricted execution.
- `selected-authorized-result.json`, `selected-authorized-log.txt`: successful authorized execution.
- Temporary project and runners remain in `/private/tmp/notes-lifecycle-probe-01`, `/private/tmp/notes-lifecycle-probe-runner-01.py`, `/private/tmp/notes-lifecycle-probe-execute-01.py`.
- Gradle official dependency caching documentation: https://docs.gradle.org/current/userguide/dependency_caching.html , repository identity/cache-copy/read-only-cache sections. Current page reported 9.8.2; exact 9.6.1 page was inaccessible. Actual read-only path behavior is independently confirmed by the installed 9.6.1 successful log. The documented parent path contains modules-2; use a snapshot, not a live writable Gradle cache.
- Earlier factual identities are in `../build-01/android-attempt03-postcheck.json`, `../build-01/android-attempt03-descriptor-paths.json`, and process record `../build-01/android-attempt03-processes.json`. These files exist and were not changed.

Manifest includes this stage only and excludes itself. It does not replace the frozen Mac or Android attempts-01-03 manifests.
