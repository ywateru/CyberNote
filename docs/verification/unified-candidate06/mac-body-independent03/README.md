# Candidate06 Mac body-build03 — independent preserved artifact review

**PASS: preserved Mac artifact bytes and recorded source/signature provenance.** All **929 assertions pass**. This review reads saved inputs, Git source blobs, apps, archives and logs only. It does not build, sign, execute platform verification, launch an app, read target/cache, use GUI/ADB or commit main. Runtime/body-font comparison remains open and is owned by root.

Source is exactly `a90e55f484149be562b2aa8a6f6f298bd953c203`. The independently checked freeze SHA is `6a16c5d8e514e7406704a048828413a5802b54fd918658c42b230205c7465302`; build-result SHA `59c32f0b74589fcc8228364db28900d9de371b72aaecdc09d4d66235862164c1`; collection-result SHA `4bb57364c419248dbabb7fe3d0b42c874770df371a7cb5d039fe057951fca4ee`. All match the exact identities supplied by root. The current authorization matches the frozen authorization and explicit source/input/product paths.

All302 current input files match the freeze, aggregate `449bfc5f429c75a55150e0abc622a596a138f5d1f298597235c91cce20b7fa88`. All238 product files match exact source Git blobs and product aggregate `1d7b1146c90d436a3ab965528623b5e215efcb9dbb5efa43f4d648496e990430`; all6 frozen tool files match. All four before/after build/collection input captures equal the frozen state. The build nonce, exact command, successful completion, stopped groups and fresh-output provenance match the collector.

Both complete preserved apps equal their recorded inventories. Both current ZIPs equal the recorded bytes/hashes, contain no duplicate names, pass a full in-memory CRC read and exactly match their app payload bytes/hashes/modes. No extraction occurs. The original app matches the actual generated-output inventory. The only recorded sealing changes are the executable signature and added CodeResources file.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Original executable | 16,088,752 | `af804b18e222471d287d5d0534bb59ad330a8f95ee4dcc37afa69366a3bf8d55` |
| Sealed executable | 16,013,344 | `b3c9013f48e6bbfbe466a9f0089e80b9fce9448a02074441bf3e97839c782587` |
| Sealed ZIP | 4,751,269 | `6a19c5a4f06bc7669540521c020eef5828a916ca543b4d7ab53d8fb6523c9dd1` |

All13 collector command records link to their complete existing raw logs, expected exit values and stopped process groups. The original strict signature **exit1**, with “code has no resources but signature indicates they must be present”, remains explicit. The separately sealed app's recorded strict **exit0**, “valid on disk”, signing and display records link to its current exact bytes. This is linkage of existing signature evidence, not newly executed codesign or independent cryptographic verification.

`verify.py` is the previously reviewed menu-build02 independent verifier adapted only to this new sibling's exact paths/identities/input count, expected aggregate checks and available freeze-summary record. This round has no `root-freeze-review.json`; the first run reached final evidence collection and failed on that old filename assumption. The adapted verifier uses the actual `freeze-summary.json`, verifies its complete source/aggregate/freeze identity linkage, and does not invent a root-review file or treat the summary's “FROZEN ONLY” status as an approval record. Root's task supplied the exact freeze for this independent check. `command.json` retains the initial local path-assumption failure and the successful final run.

`result.json` contains all assertions and inspected evidence/artifact identities. `manifest.json` covers this sibling only, excluding itself, with sorted relative path TAB bytes TAB SHA256 NEWLINE aggregation. No prior frozen evidence or product file is modified.

This result does not establish Developer ID/notarization, native body geometry, actual rendered font identity, pixel parity, persistence, permissions, input behavior, Android or iOS acceptance. Original and separately sealed artifacts remain distinguished.
