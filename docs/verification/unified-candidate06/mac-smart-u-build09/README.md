# Smart U09 Mac exact package

Exact source: `7ab867d416f48ea23913907c87fd6d058833e1cb`. Product aggregate: `b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897` (301 product paths). Full listed input aggregate: `abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6` (320 paths, prior 302 retained plus 18). Authorization is the root-provided `smart-u-device09-preparation/mac-authorization.json`; exact freeze SHA-256 is `33d823170db2ed0685ccdbd26af6a0cd459dcc124d73f409aa28fec08c658561`.

`mac-attempt01` used the canonical run-build and collect-outputs tools, offline/jobs2, an exclusive shared target/cache and the fixed 600-second deadline. Build exit 0 in 39.091 seconds; owned process group stopped with no remaining members. Old final app and dist were atomically preserved in `mac-attempt01/prior-outputs/`, and both fixed source paths were absent before the command generated new outputs. All full input/environment/tool comparisons and supplemental-input comparisons passed before/after build and collection. Collection is **ready=true**. No build or collector failure, source/tool/environment/dependency/lock edit, download, cache cleanup or retry occurred.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Complete original ZIP, `mac-original.zip` | 4938722 | `d935f86ab7d25c95b953fe70c6bf4c883b1837198a6006067f86d899228c8adb` |
| Original executable | 16375584 | `33c5635855372ec7f8fe6c6110d813366b645335b259bff549d5b6e55e1262a5` |
| Complete local adhoc ZIP, `mac-sealed.zip` | 4866554 | `02d51696b6d350847835ec596e244c526074c4d3793e2d494dc3b0e51ae8a663` |
| Derived executable | 16298512 | `32613a70664293b214b1713293a3744570b0c13f1f37ce588267a5b162842191` |

Complete original app: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-smart-u-build09/mac-attempt01/mac-original.app`. Original bundle aggregate: `8f83498605cedf1f9eb981a16d53043c5a23c08efd23fd950cd1838804059880`.

Complete derived app: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-smart-u-build09/mac-attempt01/mac-sealed.app`. Derived bundle aggregate: `c3674acf458db8cda813685a888bdfc297b7bd29ac36bf076694bc9dce3e0aed`.

The original Mach-O is arm64 and linker adhoc signed. Its original deep/strict verification returned exit 1, stating that resources are required but absent; the full original and raw command-06 log remain unchanged. This non-required original signature result is explicitly retained by the approved collector, not relabeled as a verified bundle. The separately derived full app was local adhoc signed with identifier `com.local.notesclone`; deep/strict verification returned exit 0. Only `Contents/MacOS/notes-clone` and `Contents/_CodeSignature/CodeResources` differ, as required; original files remained unchanged. There is no DeveloperID signature or notarization.

Raw build provenance and complete identities are in `mac-attempt01/result.json`, `output-isolation.json`, `generated-outputs.json`, and `collection/result.json`. Signing command logs and the four full artifacts are in `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-smart-u-build09/mac-attempt01`. Canonical byte/signature readiness does not establish installation, launch, persistence, native input, device interaction, TCC or pixel acceptance. No GUI/ADB/user DB/original Notes operation was performed. Root will arrange independent package review and finite device acceptance separately.
