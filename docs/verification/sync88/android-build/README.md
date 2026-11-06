# Android18 exact package build

All321 product inputs remained identical before/after build. The only product-input difference from Android17 is the three vh fallback lines in Preferences.css. pnpm android:build --debug exited naturally0 in20.312s; APK signature verification exited naturally0 in0.762s. The scoped offline Gradle init was removed in finally. The previous source APK is retained as artifacts/sync88/prior-android-output.apk.

Fresh APK:236444967B, SHA256 c2c5c2ce528c83cca9bc0a31740af3614ce778a529e51df7c5554dd31718bd5c. See result.json for exact absolute path, build head, input manifests, commands, signatures and separate android-dist frontend snapshot. Original driver and stdout/stderr are retained.

This is package/build/signature evidence only: no install, device activity, old-WebView or actual sync acceptance. The arm64 APK is debug-signed/debuggable. A different agent audits it before isolated-device acceptance.
