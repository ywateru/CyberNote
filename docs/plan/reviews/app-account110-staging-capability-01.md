# Account110 staging capability independent review

Verdict: **APPROVE** source `28b00eb733891c3430052c5415236505ec8f6e52` against architecture contract `66a1fa6bca204f7690abe12f31f27021a5ee7477`. No remaining source blocker was found. This verdict is independent static review and verification of existing author test evidence; no independent Cargo rerun, target lease, App, device, external network or account-data access occurred.

## Cause and repair

The preserved reproduction at `7b03217a9beb66de7261b7e621261e82571a9d8d` distinguishes the original noncanonical fixture from the exact account path. With source `07b94f115dd8136eb259e1281019f685a084cc54`, the account-layout plain test passes and dual-attachment test fails at publisher `source-path / sync_invalid`, propagated through `store_blob / Protocol` and PutBlob remote Invalid. The canonical-directory control changes only the test environment's directory selector and passes both tests. All 14 archive hashes and the four original raw-log hashes were independently verified; archived command/result bytes match their original files. Historical failures remain failures. This proves the deterministic source-path contract mismatch, but does not retrospectively add a publisher-branch observation to the earlier live App result.

The repair introduces a crate-internal `NetworkStaging` with private root/namespace fields and finite Manual/Account(UUID) variants. It is not deserialized or exposed to IPC. Account construction requires the canonical UUID spelling; backend validation binds its account device to the backend device and retains the Store device and epoch checks. Manual remains `.sync/network-staging`; account remains `.account/staging/<device>`. Each activation constructs one capability, prepares its service directory from it, and retains that same capability in the production backend for publication. The existing SyncService path argument remains internal; a mismatched publisher source is rejected rather than accepted as an alternate path.

Publication verifies the capability's library root and each namespace directory, exact hash/size filename, nonsymlink regular file, length, inode/stability, hash, publication lock, cache quota/free space, rename identity and directory fsync. The existing checks after directory selection are retained. Account/manual/device paths are not merged and no arbitrary expected-directory override was introduced. No claim is made that this change provides descriptor-relative protection against every concurrent local filesystem namespace replacement; it preserves the existing file-stability model and adds namespace ancestor checks.

No network direction/handshake/receipt code, account authorization, deadline, cancellation or retirement code changed relative to the contract base. The common immutable blob cache remains unchanged; this patch separates transport partial namespaces, not already verified content-addressed blobs.

## Exact regression coverage and source boundary

The final commit itself includes `adapter_account_transfer_tests.rs` and its `#[cfg(test)]` module declaration. It does not require the prior fixture commits to be separately picked. Every StoreBackend construction site has the new staging field. The account fixture defaults to typed account capabilities with no canonical-control environment override. It delegates all backend operations to production StoreBackend, uses real Session/Store and Gate, performs pure pair, shuts down/drops services and persistence owners, reopens Store/Session/IdentityStore, reuses the persisted peer with reassigned routes, then performs Push with plain content or a valid PNG plus a 49,169-byte binary. It checks durable inbox without foreground application, local note preservation, absence of the remote note/inbox on the sender, and exact recipient blob bytes.

Three publication tests cover canonical device syntax, wrong manual/device/root capability, arbitrary filename, incorrect content hash/size, backend device mismatch and stale epoch, account namespace ancestor/directory/file symlinks, root symlink, successful account publication, and the existing manual inode/duplicate/corrupt-cache checks. Eight existing adapter tests provide bounded compatibility coverage. Negative checks do not delete the staged source or accept it under an alternate capability.

The fixture limitations remain: directly admitted synthetic Claims without SDK/lifecycle attachment; reassigned socket addresses without an inequality assertion; no complete received WireVersion/document comparison or foreground Session apply; the pure-pair helper omits read_blob_chunk from its counter. These limit acceptance claims, but do not prevent regression coverage of this publisher path defect. No real login, SDK mapping or live App transfer is established here.

The final tree contains neither the investigation's temporary RPC/source-path trace nor its canonical-control switch. The test-only bounded TracedStore method/error observations remain inside the fixture. The diff from the contract base is exactly seven files: four product files, the new fixture, and two existing fixture construction updates. SDK, manifest, frontend and protocol scope are unchanged.

## Verified author evidence

Evidence was read from the author's then-untracked `docs/verification/account110/native/staging-capability01/` directory. It should be archived by the author/parent; this reviewer did not modify that directory. All seven entries in tested-inputs.json match the committed bytes of the reviewed source. The complete src-tauri/vendor/crates/plugins trees also match tested checkpoint `1171dca12e61517aee5c01502068b6184857d864`; the checkpoint-to-final changes are documentation only.

| Run | Observed result | Independently computed log SHA-256 |
| --- | --- | --- |
| publication01 | First run: 2 passed / 1 failed, exit 101; preserved | `a73c9a969d0b7e4dc4c641ec97a9bead6f5fb286e21255dba5e1e9d848df306b` |
| publication02 | 3 passed / 0 failed / 0 ignored, exit 0 | `ed28ff0d8d209b0d30907b7c39264f9965f3040afabb1593260532e7b043aa8d` |
| real-store01 | 2 passed / 0 failed / 0 ignored, exit 0 | `3be225e9a63ce1d569dd4651616ab9fe9f1a1a3f3cbe817e75f5df497044d046` |
| adapter-compat01 | 8 passed / 0 failed / 0 ignored, exit 0 | `6bb66cb8abb6d1239b14a572b0e1ab3018f1d8ae008a9587500dbca95d18b6da` |

Final evidence totals **13 passed, zero failed/ignored**; the first publication run is historical overlap and is not added. Its log records an absent-file lookup unwrap in the new negative test before publication; the final assertion uses `contains` to test absence. The author classifies that correction as fixture-only. The reviewed final test still rejects the wrong capabilities and asserts source preservation.

Summary SHA-256: `4adbafe15111620bd7adf0a5ebf0f168d494ab574cc6668fc50e46a445f6d4ef`. Tested-inputs SHA-256: `7a1c9423b4509b6c79b89b5556f41938fcf3ac8cc42cad64e950b27fc383d240`. Existing command/result receipts specify the shared target, jobs 2, debug 0, incremental 0, locked/offline, serial tests and a 6 GiB floor. The author's summary reports target released; the reviewer acquired no lease.

This approves the exact source repair and bounded regression evidence. The prior real-App transfer remains FAIL; push/pull/both actual acceptance remains pending.

## Final committed evidence confirmation

The author subsequently committed the evidence as `22f1031650b73b3cace80fc297dbdd8d0fb2b719`, directly atop reviewed product `28b00eb733891c3430052c5415236505ec8f6e52`. Independent Git-object verification confirms all **16/16 SHA256SUMS entries**, all seven committed source pins, and byte-for-byte equality of the four logs, summary and tested-inputs with the previously reviewed evidence. The first failed run is preserved. The evidence commit changes documentation only. Verdict remains **APPROVE** for this exact product/evidence chain. No additional Cargo rerun was necessary after the evidence was committed; no target work was started, and the newly offered exclusive lease is relinquished for pins/build coordination.
