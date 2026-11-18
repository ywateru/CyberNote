# Notes runtime patch

Source: https://github.com/osd-pub/CyberBus
Commit: 359465e83bd74b571a963f3d1fdc238f50169919 (2026-11-18)

Only crates/cyberbus is copied, with both upstream root licenses. All other SDK crates,
including the complete EasyTier source/licenses, resolve through the same pinned Git commit.

Reason: upstream SubscribeData rejects custom application types unless an RPC handler is
registered. Notes Data needs its own protobuf descriptor without advertising a fictitious RPC.
The first real-SDK Notes lifecycle tests failed with TYPE_MISMATCH before this patch.

Changes:
- Client::new_with_application_schema takes an immutable descriptor set (max 64 KiB / 32
  messages). Existing Client::new delegates with an empty descriptor set.
- Runtime validates Data type names/payloads against this additional local pool, alongside
  upstream built-ins and RPC handler descriptors. No changes to auth, network or wire protocol.
- Cargo dependencies on sibling SDK crates point to the fixed public Git revision; the upstream
  test-util dependency uses its explicit version rather than the removed workspace inheritance.

No sibling-directory absolute dependency, opaque Data bypass, test transport or substitute
network runtime is used in production. Upstream source tests are retained.
