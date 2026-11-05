# Mac21 independent read-only freeze and package review

Result: **PASS / SOURCE-AND-PACKAGE-IDENTITY-READY / RUNTIME-OPEN**. No blocking finding in this scope. The independent reviewer did not build, sign, launch, test audio, operate devices, or change root inputs. Root GUI acceptance is separate and is not established by this report.

The review reads the root workspace `/Users/water/work/2026/Apple-Notes-Clone`, while all new evidence is written in the independent worktree `/private/tmp/apple-notes-mac-recording-quit6869-independent-01`. Root collector-ready authorization preceded package inspection. Root HEAD remained `bd51ae6aae37cf2f9576bf50e44e568c67a17427` through the source and package audits. The reviewer compared the reviewed source at `1ddeca7cb51727cd40203101d5447800bd43da04`; the intervening source changes were documentation only.

## Exact identities

| Item | Identity |
| --- | --- |
| Freeze | 353304 bytes; SHA256 `5a01650d4a621540eb03f3f99b2a37bae366cfaa7cdcc23fef0d1f575f98c1f4` |
| Products / inputs | 366 / 387 |
| Product aggregate | `cd01c9943be7fe95dacb108716f723f0dcdf8963d375788e91e529aca63a273c` |
| Input aggregate | `22cbefc567271d7b74fd5e1dc905c21fb53733b2c64e1e460c9cd4396df434e1` |
| Authorization | 40074 bytes; SHA256 `f7c697d0c152a0b1eba877dd733612e918deeea64fb18aa6355a52cfb7e508b1` |
| Build nonce | `57403b1daf814132a202d9bae1c06543` |
| Original archive | 5089198 bytes; SHA256 `acbe7a943e384526c6327d2f0cfb0d7e82e9f2c5defd452f6cdb188379533aaf` |
| Original executable | 16826112 bytes; SHA256 `73fa5b74e71899eb49452e0998005769686b917a8a031e1e773b37f81a264f16` |
| Sealed archive | 5014264 bytes; SHA256 `b7a544f1c3e5f2f29d078c58f8cd02d6d559c5c15a99e646417c771f2fb14685` |
| Sealed executable | 16746416 bytes; SHA256 `b8228d203acebb4750b6b43e5f1360b2a7f62f54aeaca01721187fb3443eba73` |
| Sealed bundle aggregate | `16df48fa523bb25285495d49d9eb39edbefed77a0220566da69fefeafdabd34e` |
| Sealed CDHash | `658a782daeb747b08bc62092843670f7fc402b40` |

Source/run: `docs/verification/unified-candidate06/mac-recording-quit-build21`; artifacts: `artifacts/unified-candidate06/mac-recording-quit-build21/mac-attempt01`. The root freeze review is in preparation directory `recording-quit68-native69-preparation/root-freeze-review.json`, not the run directory.

## Findings

`audit-freeze.py` independently reconstructs the full product set and checks the current bytes of 387 inputs and 366 committed product objects. Mac20's full union is retained: 378 existing inputs unchanged, four modified, five added, none removed. All 78 plugin files and 21 historical input-only entries are included. The exact 275 independently reviewed production files, 356 reviewed inputs, and 112 independent source evidence files match current bytes. Both removed child capabilities remain absent. The three retained capabilities, complete handler bodies, seven recording commands, permission resources and listed boundaries remain unchanged. `macos-notes-ui.json` retains the main/note-* macOS `notes-ui:allow-recording-access` grant; there is no missing-grant finding.

The freeze tool records, five version observations, six effective environment values, two overlay files, 701 Gradle distribution entries and 25 OCR models match the frozen records. No tool version, distribution or model was executed. Root's direct freeze capture contains 15 true checks and the START record binds the exact review file. These are explicit input checks, not a claim of full operating-system/SDK/transitive reproducibility.

`audit-package.py` checks all four input snapshots before/after build and collection, excluding only their timestamps. The fixed `pnpm mac:build` command exited zero; its owned process group is recorded stopped. There is one attempt01, with matching nonce, source, freeze, product/input aggregates and exact build-result identity. Collector ready and all 15 collection input comparisons are true. All 13 recorded collector operations are preserved and their process groups are recorded stopped.

Both original and sealed archives were read directly. Entries are unique and safe, every ordinary file matches the respective full bundle inventory, and only recognized `__MACOSX` AppleDouble metadata is permitted beyond the bundle. The preserved original equals fresh build output. Atomic output isolation retains the full old app and dist snapshots, modes, inode and device identities. The prior app files exactly equal the Mac20 original bundle inventory; no prior app was opened. Prior dist is independently preserved without asserting that it is Mac20's dist.

The collector records exactly one ad hoc signing operation, applied only to the separate sealed copy. Independently computed file changes are only `Contents/MacOS/notes-clone` and `Contents/_CodeSignature/CodeResources`. All 37 Mach-O code/data sections are byte identical before and after signing. Info.plist, application identifier and microphone usage description are retained. Read-only codesign display, entitlements, requirements and strict/deep validation were independently run for both bundles. The original linker signature's strict failure (exit 1: `code has no resources but signature indicates they must be present`) is reproduced and preserved; sealed strict/deep passes (exit 0). The sealed identity is local ad hoc, with no Developer ID or notarization claim. Bundles, archives, all source inputs and seven tool files are rechecked after this audit.

`audit-package-tree.py` resolves the remaining directory-level check: full generated and preserved trees, root directory modes, inode/device, full original/sealed directory/file modes, and archive ordinary directory entries match exactly. It also independently computes the actual sealing delta and compares it to the collector record.

## Evidence and limits

- `freeze-readonly-result.json`: complete freeze/source checks and identities.
- `package-readonly-result.json`: snapshots, build/collection records, full bundle/ZIP inventories, section hashes and eight read-only signature commands.
- `package-tree-readonly-result.json`: complete directory checks and actual signing delta.
- `prior-application-cross-reference.json`: exact Mac20 original comparison.
- `*-attempt01.stdout` / `*.stderr`: first runs of the three independent read-only auditors. All passed on their first run; empty stderr files are retained.
- `original-*.txt` / `sealed-*.txt`: independent raw signature outputs, including the original failure.
- `evidence-manifest.json`: hashes of all evidence except the manifest itself.

The scripts were adapted from the prior independent package auditor for this exact source/freeze and reviewed 275-file binding. They are read-only audit adapters, not product changes or new runtime tests. No old hardcoded 271-file/Mac20 identity was accepted for Mac21.

This result does not prove recording persistence, microphone behavior, audibility, native termination behavior, WebKit behavior or pixel parity. Root must separately accept the actual sidebar-close, CmdQ, Dock quit, main-close/reopen and other authorized GUI paths as applicable. Android's original unsaved recording remains untouched. No recovery/preservation claim is made for the earlier Mac18 unsaved audio. User-authorized cache cleanup does not remove the recorded source evidence, and no released native/debug target is required for this read-only review.
