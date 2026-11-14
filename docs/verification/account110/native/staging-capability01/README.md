# Account attachment publication: typed staging fix

2026-11-14. Author verification; independent Erdos review pending. Product commit `28b00eb733891c3430052c5415236505ec8f6e52`, based on architecture contract `66a1fa6bca204f7690abe12f31f27021a5ee7477`. This commit is self-contained: it includes the real Store fixture and does not require cherry-picking the earlier investigative fixture commits.

Feynman's preserved comparison is in `../store-staging-reproducer01/` (main evidence commit `6c44c647`). Exact production account staging gave plain PASS / dual attachment FAIL, with the fixed source-path rejection and Protocol chain; changing only the test staging directory to the old canonical publisher directory gave both PASS. This establishes the production path mismatch and its causal attachment-publication branch. The controlled fixture does not by itself prove the full real App failure has no additional cause.

The fix keeps account isolation. It does not route accounts through manual staging and does not accept an additional arbitrary path at publication. `src-tauri/src/store/synchronization/blob.rs` defines `NetworkStaging`, re-exported internally as `crate::store::NetworkStaging`; its root and namespace fields are private. There is no serde, IPC, remote-input, Debug, or runtime configuration surface for it.

The exact internal API is:

```rust
NetworkStaging::manual(root: &Path) -> NetworkStaging
NetworkStaging::account(root: &Path, device: &str) -> store::Result<NetworkStaging>
staging.prepare() -> store::Result<PathBuf>
staging.matches_device(device: &str) -> bool
BlobStorage::publish_staged(
    &self, staging: &NetworkStaging, hash: &str, size: u64, source: &Path
) -> store::Result<()>
```

`root` comes from the existing native Runtime/Store, never the remote peer or IPC. The only namespaces are private `Manual` and `Account(uuid::Uuid)`. `account` requires a canonical UUID string; traversal, compact/uppercase UUID spellings and empty values are rejected. The fixed directories are:

| Namespace | Directory relative to Store root |
| --- | --- |
| Manual | `.sync/network-staging` |
| Account(current protocol device) | `.account/staging/<canonical device UUID>` |

`prepare` checks that root is a real directory, then checks/creates each fixed component without following a symlink in those components. The resulting path is passed to the existing SyncService constructor; the same capability is moved into StoreBackend. Account backend validation checks its captured device against the capability, in addition to the existing Store device and backend-epoch checks. Manual service setup uses the same typed derivation and retains its original path. Identity/Noise namespaces, Gate, single-owner admission, cancellation, 185-second deadline and shutdown/join behavior are unchanged.

Publisher `checked_directory` is private. It first requires the capability root to equal the BlobStorage root, and checks root plus every fixed directory component again. Publication then retains the exact `{sha256}-{size}.part` basename/parent rule and the existing directory/file no-symlink rules, bounded size/full SHA, opened/current inode and metadata stability checks, publication lock, existing-cache verification, allocation budget, atomic rename and directory/file fsync. No raw directory parameter is added. Old partials are neither moved nor deleted by this patch.

Final focused results, using the one shared Mac target, `--lib --features sync-e2e --locked --offline`, jobs 2, dev/test debug 0, incremental 0, serial test execution:

| Invocation | Result |
| --- | --- |
| `sync::adapter::publication_tests::` first run | 2 PASS / 1 FAIL / 0 ignored |
| Same group after fixture assertion correction | 3 PASS / 0 FAIL / 0 ignored |
| `sync::adapter::account_transfer_tests::` | 2 PASS / 0 FAIL / 0 ignored |
| `sync::adapter::tests::` | 8 PASS / 0 FAIL / 0 ignored |

The first failure is preserved in `publication01.log`, `command.json`, and `result.json`. A newly added negative assertion used `sync_blob_path`, whose contract requires the blob to exist, while asserting that rejection had not published it. The assertion was corrected to `contains`; no product adjustment was made in response to that failure. Compilation succeeded on both invocations. Existing warnings remain in the raw logs.

The final 13/13 cover account vs manual/other-device/other-root rejection, canonical UUID input, wrong filename, hash/size failures, symlinked root/each account directory ancestor/file, current-device and stale-epoch rejection, existing manual publication inode reuse/duplicate/corrupt-cache checks, plus manual pause/join/fencing, read-only preflight and strict command/token boundaries. Two real Store/Session/StoreBackend account-policy tests reopen persisted peers, use fresh routes without re-pairing, assert pure pairing and single-direction durable receipts, retain original note values, and verify received PNG and multi-chunk binary bytes. Their Gate admits synthetic trusted Claims directly: they do not exercise actual SDK mapping, OAuth/enrollment, GUI application or foreground projection. The fixture uses the same typed staging derivation as production, without the earlier investigative environment switch.

Tests ran on checkpoint `1171dca12e61517aee5c01502068b6184857d864`. Final source was consolidated onto the approved documentation base without changing native inputs; `tested-inputs.json` records all seven changed native file SHA256 values, verified equal to the final product commit. `summary.json` records the final totals and source relationship. All original logs/exit codes are retained; no live-run failure has been rewritten.

The shared target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` is released. The controller enforced a 6 GiB free-space floor; receipts record about 8.62 GB free before/after. No App, original library, credentials/grant, real SDK/network request, account enable, device or ADB operation occurred. No manifest pins, dependency versions, policy, deadlines or published package were changed. This is native author regression evidence, not independent approval or product acceptance.
