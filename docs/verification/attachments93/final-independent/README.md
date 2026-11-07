# APP93 Mac31 independent package audit

Result: **PASS-MAC31-PACKAGE-IDENTITY-AND-ENTITLEMENTS**, natural exit 0, 18.862413 seconds. This was a read-only audit of the admitted final package; no application launch, signing, compilation, Notes access, device access, user database access, or shared target use.

Approved product source: `1cc8deaea4335bffb87b32ddcba4421b5bded971`. Actual build entry: `a35a72bd2e09ff708d3d77b48f9e31a26158fba4`. The complete dynamic set of 341 product paths matches approved Git bytes, actual entry Git bytes, current clean source, and build before/after/packaging inventories. The driver matches its build-entry source and captured snapshot. This build completed naturally in 133.829 seconds with exit 0 and no compile reuse/continuation.

Final ZIP: `artifacts/attachments93/备忘录-Mac31.zip`, 7,047,765 bytes, SHA-256 `cb367e01d7508947b66da1f41ba44553006eeb865d43cd1e1160befcbf2bb856`. Derived executable SHA-256: `c0b9e732cb9ccb4610db832d97810a4d1930de4e72a503f091081dcbc5726b27`.

The audit verifies every bundle file and ZIP payload/mode/CRC, safe unique ZIP paths, both complete embedded frontend asset sets (all non-HTML bytes and complete ordered HTML tokens), exact embedded native JXA source, absence of debug/synthetic source markers, every Mach-O section and all 21,739,152 pre-signature bytes after masking only three signature size fields. Only the executable signature and CodeResources changed between original and derived bundles.

The derived application passes `codesign --verify --deep --strict`; its actual entitlement dictionary exactly equals source (`com.apple.security.automation.apple-events: true`). The original bundler application has no entitlement dictionary and returns strict exit 1, faithfully retained rather than treated as passing. Info.plist microphone/camera/Apple Events explanations match source, and minimum macOS is 12.0. Signature is local ad hoc, with no TeamIdentifier.

`result.json` holds full results, observed counts, full HTML tokens, section hashes and ZIP entries. `commands.json` and individual stdout/stderr files retain natural verifier outputs. `invocation.json` binds command, scripts, driver, manifest and build-log hashes. The two `*-extracted-result.json` files retain all decoded resource hashes and offsets without duplicating frontend assets. The archived scripts are the exact scripts run (APP92 audit methods adapted to this admitted artifact, without fixed inventory counts).

Limits: this proves package/source identity and actual local signatures, not hermetic reproducibility, notarization, packaged TCC/runtime acceptance, native attachment export UI, or device acceptance. Independent Rust and React DOM verification is recorded separately in this feature's evidence tree. Original earlier DOM failures remain in independent-dom; this package audit had no failed attempt.
