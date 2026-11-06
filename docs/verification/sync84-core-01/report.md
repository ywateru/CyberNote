# APP-SYNC84 Store core author verification

Source and author tests are frozen at `d484ab95e73c16794aceee96401e711874fcb40e`, tree `69eb567d42038881c3d8b8e1c897796006a35efc`. The accompanying fingerprint lists SHA-256 and byte length for the complete committed `src-tauri/src` source set, production manifest/lock, and lean runner files. Final02 ran immediately before this commit; no Rust/manifests/lock files changed between that run and commit. The runner README was added to explain scope.

This is real production Store + Session/model code compiled by the lean crate, not a copied algorithm, UI fixture or network test. No Tauri application build, Android installation, desktop automation, original Notes, real microphone, or push was performed.

The exact successful command was:

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path scripts/sync84/Cargo.toml synchronization --no-fail-fast
```

`final02.status.json` records natural exit 0 and 5.432848930358887 seconds wall time. stdout records 29 passed, 0 failed, 82 filtered out, 1.50 seconds test execution. One selected test is the child-process entry point; 28 are substantive scenarios. The real SIGKILL scenario starts that entry point in separate processes, kills before and after COMMIT, reopens the same SQLite files, and verifies business rows and trigger-captured dirty rows follow the same commit boundary.

`cargo metadata --offline --locked --format-version 1 --manifest-path src-tauri/Cargo.toml` also naturally exited 0. Its raw stdout is gzip-compressed and stderr/status are retained. This validates the production lock resolution but is not a Tauri compilation claim. Production lock changes are limited to the fs2 package and root fs2/sha2 dependencies. `git diff --check` passed before source commit. New modules were rustfmt-formatted with `--config skip_children=true` to avoid unrelated formatting.

Scope covered by final run:

- Opt-in bootstrap and persistent identity; prepared-device adoption on empty/existing local-note stores; bad UUID, workspace/device drift rejection; restart. Authentication happens in the adapter and is outside this test. The test proves no schema exists before adopt and invalid adopt leaves no extension.
- Transactional dirty capture for notes/folders/smart folders/attachment owner changes/import, no settings wire; A to B to A, 100 duplicate deliveries, no echo/revision churn, raw CAS preservation.
- Durable inbox then plan/apply, excluded busy note owner and all folder-derived changes deferred while unrelated note applies; generation recheck rejects new local drafts and tampered plans; injected SQL abort rolls back capture/counter/heads/inbox/business rows.
- Concurrent-head convergence, same-vector different-content rejection after compaction, tombstone/delete/restore/purge behavior, keep-all copies, deterministic folder fallback/cycle repair and derived note targets.
- Persistent actor frontiers include accepted inbox versions. A deterministic deleted remote A1B1 branch projects ahead of local A2; restore forks a new actor and cannot silently dominate A2. Autosave/restart reuse that actor. A separate fixture removes retained heads/inbox to assert old seen frontier still protects an old projection after restart. The fixture explicitly models compaction; it is not a product workflow claim.
- Actor/frontier budget, administrative counter overflow preserving dirty, 32 heads, malformed envelope/unknown fields/path/depth/time, inbox 1024 limit; schema tamper and failed bootstrap preserve old usability.
- Independent hash-verified file blobs, missing/half/wrong hash rejection, restart, dedupe, four staging files/cache budget, corruption, independent attachment IDs/paths for conflict copies, collision with unreferenced local media, and known-version replay with a missing local blob never falsely ACKs durable.
- Raw locked sealed wire without decrypted workspace export. Local lock clears selected head payload plus already-staged causal ancestors in the same business SQL transaction, before sync_flush. The test checks SQL state and checkpointed SQLite bytes, restarts with sealed dirty still pending, and verifies concurrent plaintext remains and becomes an explicit listed conflict. A late ancestor replay cannot restore linear plaintext into inbox. This does not claim to erase concurrent plaintext, filesystem snapshots or unrelated user data.
- Resolve chosen remote sealed conflict retires old business attachment metadata; media files and sync blobs are retained rather than garbage-collected.

Original failures are retained, not replaced with green-only logs:

- tests01/tests02: initial helper/schema mistakes (wrong smart-folder action and attachment attrs) and the discovered stable-device-vector implicit-join flaw. The actor/frontier design fixed the real flaw.
- tests03: compiler-required explicit Vec<BlobRef> annotation, corrected.
- tests04: archive helper wrongly exported inside application data root; purge test assumed conflict still existed without constructing one; tamper test cleared a targets vector that could already be empty. Corrected to external export directory, explicit independent conflict, and a forged extra target.
- tests05/tests06: the new deterministic branch test exposed that `local_note_wire` test helper returned the first digest-sorted current head rather than the actual projected head. The helper now resolves `sync_projection.digest`; no test is retried to obtain convenient random digests. Test05 also used an invalid trashed-note folder combination, corrected to the production `trash` owner contract. The final actor fixture uses delete-priority selection, independent of random UUID/hash order.
- tests08: an attempted fixture called lockNote while that same store still owned an attachment, which the existing product explicitly rejects. The final fixture starts B from the text-only base and adds A's media on its independent branch before B locks. No production lock restriction was weakened.
- tests07, tests09 and final01/final02 preserve the succeeding runs and their natural outputs as the implementation was completed.

Frozen API (Result wrappers omitted below only for readability):

```rust
sync_identity(&self) -> Option<SyncIdentity>
sync_enable(&mut self, Option<&str>) -> SyncIdentity
sync_enable_with_device(&mut self, Option<&str>, &str) -> SyncIdentity
sync_flush(&mut self) -> ()
sync_inventory(&self) -> Vec<VersionSummary>
sync_version(&self, &str) -> WireVersion
sync_required_blobs(&self, &WireVersion) -> Vec<BlobRef>
sync_receive(&mut self, Vec<WireVersion>) -> SyncApplyReport
sync_blob_path(&self, &str) -> PathBuf
sync_store_blob(&self, &str, u64, impl Read) -> ()
sync_plan_apply(&mut self, &[String]) -> SyncApplyPlan
sync_apply_plan(&mut self, &SyncApplyPlan) -> SyncApplyReport
sync_apply_pending(&mut self) -> SyncApplyReport // headless only
sync_conflicts(&self) -> Vec<SyncConflict>
sync_resolve(&mut self, EntityKind, &str, &str, bool) -> SyncApplyReport
```

`BlobRef` is `{hash,size}`; the network adapter may map it to its `{sha256,size}` shape. `SyncApplyPlan` contains generation, excludedNoteIds, eligibleDigests, note targets, and changes. Inventory errors `sync_pending_flush` until dirty is flushed; stale plans error `sync_plan_stale`. `sync_receive` never projects business rows. Product integration must place plan/apply and resolve behind its Session barriers. Blob readers must already be local staged readers; never hold the Store lock over a network reader.

All vector components are persistent actor counters; stable physical device identity is separate. Limits are conservative: 64 actor components/frontiers per entity, 32 heads, 10,000 entities, 1024 inbox versions/64 MiB, 16 MiB message, 256 MiB blob, 4 staging files/512 MiB, 4 GiB blob cache and 256 MiB free reserve. Exhaustion leaves dirty and reports an error; explicit join does not guarantee that actor exhaustion is reversible. Payload history is compacted, while causal digest/vector/frontier metadata intentionally persists. No automatic tombstone/blob GC is provided.

Networking85, Session/UI86, independent review, full product builds and device/release verification remain separate work. This evidence does not mark full synchronization or the overall data-management goal complete.
