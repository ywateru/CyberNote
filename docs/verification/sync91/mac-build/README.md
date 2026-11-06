# SYNC91 exact Mac29 build

Approved root product `b373ac95e1d26faf03e37e5ee6c68bccf5074e00`; build HEAD `c6de6a6884f97230ed2d6119efc8613dd5198ebe` contains later documentation only. All322 tracked product inputs match the approved commit and remain identical before/after. Frontend snapshot exactly equals Android21. `approved-preflight.json`, `result.json` and `completion.json` preserve exact inputs, original command results, source-driver and artifact hashes.

`pnpm mac:build` naturally exited0 in24.629s. The original bundled app's strict signature verification exited1; that raw original is preserved unchanged as `artifacts/sync91/mac-original.app`. A separate derived `备忘录.app` was explicitly ad-hoc signed and its strict signature verification naturally exited0 in.036s. Only `Contents/MacOS/notes-clone` and `Contents/_CodeSignature/CodeResources` differ between raw and derived copies. This is not notarization or a Developer ID distribution signature.

The delivered ZIP is `artifacts/sync91/备忘录-Mac29.zip`,6720140bytes, SHA256 `a8896b23d08a2a30832780ef50b97c964d9310fa4a85e47d34226a1cb82227fd`. Its signed executable is20924528bytes, SHA256 `45315eff899b1d42b731f3044f391262d9b2d65fc34216fe748a72ebc85ab92a`.

The accepted28 driver was adapted only for91/mac-build output scope and Mac29 archive label; exact commands and raw logs remain beside this file. No original delivered artifact was overwritten, no product source changed, no device or real user database was accessed, and no application was installed or launched. Build resources were released on completion. Independent package audit follows separately; Android native media/export/restart acceptance was still incomplete at this build boundary.
