# Completed build derived-output cleanup

2026-11-13. Removed only two derived directories in the completed sparse Android build checkout, after Erdos independently identified the candidates and the parent repeated execution-time guards. Result: **759,279,616 allocated bytes, about 724.11 MiB**, removed. Detailed exact paths and free-space samples are in `result.json`.

Both directories were canonical, real, owned by the current user, gitignored, and contained no tracked files. An exact checkout-path process scan excluding only the executing process ancestry found no active checkout reference. `lsof +D` returned exit 1 with no output for each directory. The APK inside `outputs/apk` matched the independently retained candidate SHA256 `654ab2a820de70588edcceb5231818b3580e425cdf7de1db395b585066091268` before removal. The candidate under `artifacts/account109/android-72513d12-debug-01/` was hashed again unchanged afterward.

Preserved `outputs/logs`, source/Git objects, platform identity material, both actual candidate artifacts, original failed and successful build logs, the sole Cargo target, historical evidence and all app data. No other build directory, dependency cache, JNI symlink target or process was removed/stopped. Subsequent builds may recreate the removed Gradle intermediates. This cleanup is not an app install, runtime test or source change.
