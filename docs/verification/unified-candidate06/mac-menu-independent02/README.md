# Candidate06 Mac menu-build02 — independent preserved artifact review

**PASS: preserved Mac artifact bytes and recorded source/signature provenance.** All **925 assertions pass**. This is a read-only artifact review, with no build, signing, platform verification, app launch, GUI, target/cache access or main commit. Runtime menu and pixel acceptance remain with the root agent.

Exact source is `b5063fd246c3433881ce9c35729389a7d87e0f2e`. The frozen input JSON SHA is `943a039b85753bd2efcf8f51171cdafc1f22c4c78f8a88e58cc7c9ec1e989f5c`, build result SHA `56b75bca1333def7036196482922be461cf390ff8cb8a8e35d122b52b734d686`, collector result SHA `ee72b29838666954cc31d4eccc210dcabaa801911db75e8b3629efa514364052`. Current authorization matches the freeze exactly. All301 current input files match frozen identities; all238 product paths match the exact source Git blobs; all6 build-tool identities match. The four before/after build/collection capture records match the frozen input state. Product aggregate is `2f0b89dad041757f35ef761ba013a7928c994c538c2dee8dabe4aedd305b9394`, full input aggregate `f7de78a4cbf214fd491ed3160ac64e0a85a9bfa1c16210f0da25e0104b5be7be`.

Both complete preserved apps match the collector inventories; both current ZIPs match their recorded bytes and hashes, have no duplicate member names, pass a complete in-memory CRC read, and match their app payload hashes, sizes and file modes. No extraction occurs. The original app matches the actual recorded generated output and fresh-output isolation record. The only original→sealed changes are the executable signature and added CodeResources file, exactly as recorded.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Original executable | 16,088,752 | `e40bce584ad224c9ada47aeb45a15cd518c386ab71ebba990647c96deb00cbd7` |
| Sealed executable | 16,013,344 | `731695caf7c83a3db3bfd047da9705e0e73fd4791f048b7f21e4c9a17e502ffb` |
| Sealed ZIP | 4,751,352 | `3cec1171d43567f9f98e8abf6b6bf1e5c9fbfc18f6ce689a575904cc14b4f2d0` |

All13 collector command results link to their exact raw log text, completed process groups and expected exit values. The original strict signature check **exit1** and “code has no resources but signature indicates they must be present” are preserved. The separately sealed app's recorded strict check **exit0**, “valid on disk”, signing action and display records link to its exact current bytes. These are independently linked existing records, not a new cryptographic/platform verification.

`verify.py` adapts the previous read-only Mac independent verifier into this new exclusive sibling, changing candidate paths, exact identities and three added expected-identity assertions. `command.json` records verifier provenance and the initial path-adaptation assertion failure: the old ART constant still pointed to mac-build01 and was corrected to the new artifact directory. No source, bundle, prior evidence or target contents were changed by that correction. `result.json` records every assertion and inspected artifact/evidence identity. `manifest.json` covers this sibling, excluding itself, using sorted relative path/bytes/SHA lines.

No Developer ID, notarization, persistence, privacy permission, Android, iOS or pixel parity acceptance is established here. The original/sealed distinction and original strict failure remain explicit.
