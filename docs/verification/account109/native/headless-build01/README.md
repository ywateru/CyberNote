# Native-only headless debug candidate

Built from clean reviewed source `be037f3cc542f53fba06d604f932743542e29bc4`. This candidate enables only the `sync-e2e` Cargo feature, without `tauri/custom-protocol`. It creates no WebView when both documented headless switches are enabled. No frontend rebuild or embedded frontend identity is asserted.

[receipt.json](receipt.json) records exact source/product fingerprint, input count, native toolchain, flags and copied executable hash. [before.json](before.json) seals every product input hash before compilation; all inputs and source identity were compared unchanged after the successful offline/locked build. The compiler log is retained in `build.log`.

Binary SHA256: `f5b64d0dbaa7001b2e00ee94f40fcdc69f6da7f0584f44dc6c42cf3bc2405add`. Artifact path: `artifacts/account109/mac-be037f3c-native-headless/notes-clone`. This is a different instrumented candidate from the historical source39c1420d WebView binary.

This record proves preparation only. Disposable zero-window App startup/save/reopen/natural-shutdown smoke, approved Node driver/recovery, and preserved-store continuation are separate required results. The build performed no App launch or original-store access.
