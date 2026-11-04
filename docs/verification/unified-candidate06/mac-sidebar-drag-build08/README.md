# Mac08 sidebar drag build — author BUILD STOP

Source HEAD: `845f123ada626ef3fe3f8d78db6c2627c72f26ac`. Root authorization SHA256: `4e7d783fa48cd516f6bc46cc5bc5f74d01fbdcf13571706a5c189156fe7f708c`. Freeze SHA256: `77a774c613cb2c2906b1e63f66166e32312c658136498112139529b19c3f8bd1`.

238 product paths aggregate: `950788b2adc200aa17dc1c8f19de3b59deee1b8a413ad5e339fe68ea57162399`. 302 input paths aggregate: `e813ca54e8a46b981db04d5b54eb344966d522c4761165cdda4fb6a3260355cc`.

Canonical run-build.py/collect-outputs.py completed mac/attempt01. `pnpm mac:build` exited 0 in 60.623 seconds, with offline Cargo, two jobs, 600-second limit and disk/process guards retained. All 15 build and collection input comparisons passed; supplemental inputs stayed unchanged and owned process groups stopped. Nonce: `0ddab590dc1f40e48591f09852b1e33a`.

Prior final app/dist were atomically preserved. The collector retained the original app unchanged and made a separate local adhoc signed copy. Original deep/strict verification exited 1 (`code has no resources but signature indicates they must be present`), preserved in command-06.txt; derived mac-sealed.app deep/strict verification exited 0. Only executable/signature resource changed in sealing.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| `mac-original.zip` | 4823673 | `e459bc693a60dc1edd0bb0a2815c3b8dbe1bdd8190ebf762af53b7405d849c91` |
| `mac-original.app/Contents/MacOS/notes-clone` | 16090480 | `dd120de30bbba231faa1635265c8924b453d8055482745e2c447ad1909dc893f` |
| `mac-sealed.zip` | 4753198 | `ae9292fb4b1c9a1749e26005c84513823c2fdd16612608e332678cd7c7e5e21f` |
| `mac-sealed.app/Contents/MacOS/notes-clone` | 16015072 | `9de0996603eaa91d4185a85f462ae73e3adaa6c22b8320de339208622143b65b` |

Artifact bytes were read back against collector records. Build result SHA256: `5fc325b216cff162bdb4d04fb4ba469dfae808d6679ff2d73ab06f050c8b48a6`; collection result SHA256: `21dbbbd46bc4f02657b52dc4afb65d0f61dfc1707d77e2f5731d8045a9c61a4e`.

Build identity and local signature only; no DeveloperID/notarization, launch, permissions, persistence, body selection, actual sidebar drag or pixel acceptance is claimed. Root exact-package Computer Use remains required. No GUI/ADB/Android build/source edit/tool edit/cache cleanup/stage/commit was performed.
