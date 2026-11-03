# Android recovery preparation 01

Source preparation only; no new input freeze or APK build has run. Parent must commit/review and supply the final 40-character HEAD first.

`run-android-recovery.py` is derived from the accepted safe runner. `safe-runner-minimal.diff` records the exact changes. The owned-init cleanup function is AST-identical. The Android-only runner replaces the same-run Mac-marker prerequisite with a supplemental input file containing the real accepted d8 Mac manifest/source-freeze identities. It keeps default features, compiler/linker behavior, original offline init and shared build lock. New monitored process owns its process group, stops only that group on download prompt, <2GiB free, or explicit deadline (default 600s), and waits before cleanup. Unexpected monitor errors also stop that group.

`recovery_common.py` verifies every original 279 source row unchanged and permits only the five merged window-capture tool additions. It separately records and blocks on changes to GRADLE_RO_DEP_CACHE, the exact two read-only overlay files (73,704B), and `GRADLE_OPTS=-Dorg.gradle.daemon=false`. The latter is a new explicit environment input, preventing reuse of a long-lived Gradle daemon lacking the supplemental cache environment. The wrapper passes GRADLE_OPTS to the JVM (preserved local wrapper excerpt); installed Gradle 9.6.1 DaemonOption maps org.gradle.daemon to DaemonParameters.setEnabled (preserved static bytecode). A temporary single-use daemon may still start naturally. No old daemon is stopped.

The original common.capture is unchanged and still checks its seven input groups. Supplemental before/after comparison is additional and explicit; it must not be described as already covered by those seven groups. New Android freeze plus old accepted Mac reference are different complete freezes; no Mac marker is created and no Mac rebuild is claimed.

Future commands after parent authorizes a final HEAD (substitute the exact SHA and a new recovery run path):

```
python3 -B docs/verification/unified-candidate04/recovery-preparation-01/capture-recovery-inputs.py <HEAD> docs/verification/unified-candidate04/android-recovery-01
python3 -B docs/verification/unified-candidate04/recovery-preparation-01/run-android-recovery.py android <HEAD> docs/verification/unified-candidate04/android-recovery-01 attempt01 --allow-scoped-gradle-offline-init --deadline-seconds 600
python3 -B docs/verification/unified-candidate04/recovery-preparation-01/capture-android-recovery.py android <HEAD> docs/verification/unified-candidate04/android-recovery-01 attempt01
```

The collector retains existing APK preservation/signature/OCR-model checks, adds supplemental before/after collection comparison, refuses failed cleanup/stopped/unchecked attempts, and does not install or launch anything. Exact collector changes are in collector-minimal.diff.

Validation: Python AST parses; safe cleanup AST identical; seven supplemental synthetic cases passed (stable baseline/Mac reference, changed original input, unexpected addition, writable overlay, changed overlay bytes, extra cache file, cache symlink). The synthetic checks never used real cache or build. Their result is syntax-and-cleanup-check.json. Source can be independently reviewed; no full runtime acceptance is implied.
