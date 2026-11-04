# Android05 independent artifact audit

Scoped PASS for exact source `e482dac285a1e2b66f88bac035824b7c98e832a7`; no confirmed P1/P2/P3 finding. See `docs/plan/reviews/android-smart-u-independent05.md` for the contract, source chain and limits.

`verify.py` passed 686 identity/completeness assertions on the first run. It checks exact authorization/freeze/build/collection bytes, 320 inputs and 301 source git blobs, seven frozen canonical tools, four complete snapshots, real current-nonce init log lines, output isolation and old/new inode separation, full APK ZIP CRC/hash, all 25 models, four arm64 ELF libraries, current v2 certificate identity, fresh cryptographic signature verification, and preserved historical evidence.

`input-manifest.json` freezes 110 author and historical files. `input-close.json` confirms all unchanged; `input-final.json` provides a further current-input/tool and protected-file close check. `fresh-signature-check.json` records the new bounded read-only apksigner command. `attempt01-command.json`, stdout and stderr retain the first and only audit invocation. `result.json` contains detailed assertions; `evidence-index.json` seals the independent files and report identity.

APK: 179247354 bytes, SHA-256 `a6f94fe3c397a6078116c5f2d6c3190ae5091afa214b7005307973f57ef96322`. The previous failed04 output happens to have identical bytes, but its preserved inode is 29383214 and the newly generated05 output inode is 29389444. Failed04 remains unaccepted.

No build, Gradle, version probes, product tests, GUI/ADB/install, original Notes or user DB work; no cache/target writes or traversal, no product/tool edits, stage or commit. Only the authorized final APK output path is read. Frozen AAR model and external tool/cache records are checked through exact recorded identities, not re-probed. No embedded frontend decode, independent rebuild, device upgrade/runtime/input/OCR/audio/persistence/pixel acceptance. STOP; shared target/cache released.
