# Mac07 build delivery

Source HEAD: `8614d788745a6183542d261d1c6b6fc789084dc7`. Root authorization: `root-authorization-mac-list-heading-build07.json` (SHA256 `edfad3cb63bf6810a19faa6d7970554a52ffcc2b535b87bc413bc02eae77ee30`). Freeze SHA256: `b0bc1a2e4a6c68ead98f57cd66bd756a4a1278d9258d06d0b4ce4974a45c3a35`.

Product aggregate (238 paths): `6f934ba2142bb716c64c792f7b2187949e8119e72b06e2239788d1dc22cc5a5b`. Input aggregate (302 paths): `6d45cb911503c9fa0077f22f99dd351553c289f23c440d9c24a935a81646b4b3`.

Canonical `run-build.py` and `collect-outputs.py` completed attempt01. `pnpm mac:build` exited 0 in 70.984 seconds with offline Cargo and two build jobs. All 15 build and collection input comparisons passed; supplemental inputs remained unchanged. Owned process groups stopped with no remaining owned members. Build nonce: `25fc3e7a154a4786b6e3cce1791d0019`.

Prior final app and dist were atomically preserved before building. The collector preserved the original app unchanged and produced a separate locally adhoc signed copy. Original deep/strict signature verification exited 1 (`code has no resources but signature indicates they must be present`); this failure is preserved in command-06.txt. Derived mac-sealed.app deep/strict verification exited 0.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| `mac-original.zip` | 4823742 | `5e5ff5f0b1ea4c8a129425d2b29518e36f6d6d642245bf19ea172957798a9baf` |
| `mac-original.app/Contents/MacOS/notes-clone` | 16090480 | `17db9522917a682b7f35b14d5dc4e87a811a8747b434bc9c2ed45f41a367db3b` |
| `mac-sealed.zip` | 4753267 | `92c1ffca5e16179660eb538c9b8282b6f148f6443b9c6307b71640cac6e7af20` |
| `mac-sealed.app/Contents/MacOS/notes-clone` | 16015072 | `0de1ab851b06f6da59fe3d37a3843af0b0cf46557effe69d2c72bb7bcf63ffd1` |

Build result SHA256: `724bb4963b0745b039b9918f69cbaebfa7394d7c644c0fc12c652b6ab0f27a8e`. Collection result SHA256: `8821a790de13696fd58443f04368a2e3e17033270e3e2c2da54fc2a79c12014e`. Full logs and identity records are retained under mac-attempt01 and the artifact directory.

This delivery establishes build and artifact identity only. Launch, actual window behavior, permissions, persistence, and pixel acceptance remain for root runtime review. No GUI, installation, Android build, stage, or commit was performed in this build task.
