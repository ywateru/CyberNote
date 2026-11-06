# APP-SYNC84 real Store verification

This lean crate imports the production Store, Session and sync model directly through `src-tauri/src/sync_test_root84.rs`. It does not copy synchronization algorithms and does not compile Tauri, run devices, or open microphones.

Run from the repository root:

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target cargo test --offline --locked --manifest-path scripts/sync84/Cargo.toml synchronization --no-fail-fast
```

The 29 selected tests include one child-process entry point used by the real SIGKILL test; there are 28 substantive scenarios. Other production tests are compiled but filtered out. The test root suppresses dead-code warnings because it deliberately imports full production modules without the product command surface.

Store opt-in APIs are `sync_enable(workspace)` and `sync_enable_with_device(workspace, prepared_device_id)`. The latter adopts the transport-prepared identity atomically after authentication. Existing identities cannot drift. Neither Store::open nor transport identity preparation enables the extension.

`sync_receive` only validates and stages durable metadata. Production application must use `sync_plan_apply(excluded_note_ids)` then `sync_apply_plan(plan)` across the Session barrier. `sync_apply_pending()` is the headless wrapper, not a network callback. Inventory requires a preceding `sync_flush`; blob readers passed to `sync_store_blob` must be already staged local readers, not network-blocking readers under a Store lock.

Version vectors are actor-to-counter. Physical device IDs stay stable; the Store persists local branch actors and a per-entity max-seen frontier, including inbox vectors. Continuing an old selected branch allocates a new actor instead of implicitly joining conflicts. Counters are actor-local; the separate identity counter measures local operations. Limits include 64 vector/frontier actors per entity, 32 current heads, 10,000 entities, 1,024 inbox envelopes / 64 MiB, 16 MiB messages, 256 MiB single blobs, four staging files / 512 MiB, 4 GiB sync blob cache and 256 MiB disk reserve. Exhaustion is an error; dirty local data remains and vector keys are not discarded.

Schema capture triggers execute in the business SQL transaction. A local lock prunes its linear selected head payload and causally older staged inbox bodies before background flush; causal replays cannot restore that plaintext. Concurrent plaintext versions remain explicit conflicts. Purge prunes all known head bodies, preserving causal digests/vector context; unseen concurrent bodies stay recoverable without resurrecting the purged note. Raw sealed state is read from Store, never from decrypted workspace().

This verifies the Store core only. It does not establish networking, Session/UI barrier, full Tauri linking, Android, desktop packaging, or release completion. Those require their own integration evidence.
