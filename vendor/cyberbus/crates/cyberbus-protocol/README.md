# cyberbus-protocol

CyberBus v1 protocol foundation. This crate reconstructs the missing schema from
`docs/protocol.md` and `docs/design.md`. The old documents mention historical
field-number comparisons, but no historical schema or descriptor was present to
recover those numbers; the checked-in proto files are the concrete baseline.
`SdkResult` keeps tag 14 and `devices_snapshot` reserved as the document requires.

## Generated contract

- `pb`: all standard local commands/results/events and independent peer records.
- `example`: generated `EchoRequest`, `EchoReply`, `PublicConfig` sample types.
- `FILE_DESCRIPTOR_SET` and `validation::descriptor_pool()`: complete schema and WKT dependencies.
- `codec::{encode,decode,decode_command,decode_result,decode_event,decode_wire}`:
  checked binary codecs. Direct `prost::Message::decode` bypasses validation.
- `Error` / `Result`: common errors, `Error::code()` and sanitized `to_protocol_error()`.

The proto service is a generation contract; the crate starts no listener.
`protoc-bin-vendored` supplies protoc; no system compiler is required. Cargo.lock
pins the resolved dependencies. Workspace members use `crates/*` and explicitly
exclude `.worktrees`; independent crates may use their own manifests before merge.

## Secure streams

```rust,no_run
use cyberbus_protocol::{noise, pb, Result};
use tokio::io::{AsyncRead, AsyncWrite};

async fn session<S: AsyncRead + AsyncWrite + Unpin>(
    io: S,
    installation_private_key: [u8; 32],
    app_psk: [u8; 32],
    binding_id: [u8; 32],
    boot_id: [u8; 16],
) -> Result<()> {
    let mut config = noise::NoiseConfig::new(
        installation_private_key, app_psk, binding_id, "1", boot_id,
    );
    // config.expected_peer = Some(the_device_id_selected_by_the_application);
    config.receive_limits = noise::default_receive_limits();
    let session = noise::connect(io, config, |authenticated_bind| {
        // Runtime: check current account block/admission policy using this device ID.
        // Return Err(...) to close before Ready. Do not call business handlers here.
        let _device_id = &authenticated_bind.device_id;
        Ok(())
    }).await?;
    let (mut reader, mut writer, peer) = session.into_split();
    let _authenticated_device_id = peer.device_id;
    writer.send(pb::wire_envelope::Body::Ping(pb::Ping {
        nonce: noise::random_bytes::<16>()?.to_vec(),
    })).await?;
    let _envelope = reader.recv().await?;
    writer.shutdown().await?;
    Ok(())
}
```

Use `noise::accept` on the accepting end, with the same signature. Both functions
perform exact hello/prologue binding, real snow XXpsk3, static-key authentication,
SessionBind validation, admission callback and bilateral Ready before returning.
`SecureStream::{peer,send,recv,into_split,close}` is also available without splitting.
Sequence/session IDs are generated and checked automatically. Transport nonces are
owned by snow. `SecureReader::recv` returns a checked `pb::WireEnvelope`;
`SecureWriter::send` accepts a `pb::wire_envelope::Body`. Established streams reject
bind/ready reuse and enforce negotiated payload sizes and granted feature bits.
The receiver grants only features supported by both ends. Internal forwarding is
absent from the default permissions and needs explicit runtime registration.

Drive reading in a persistent task, and use the independent writer for duplex
traffic. **Any send/receive error or cancellation poisons both halves** because a
partial TCP record/advanced Noise nonce cannot safely be retried. Reconnect with
fresh hello and handshake. Dropping a read future in every `select!` iteration is
therefore unsuitable. `shutdown()` closes admission even if underlying shutdown
fails. Runtime block/generation/lease gates must also run before every dispatch.

## Framing and application payloads

`framing::{read_record,write_record}` works over any Tokio AsyncRead/AsyncWrite.
`read_record` returns `None` only for clean EOF between records; partial EOF is an
error. Length is checked before allocation; five seconds without read/write
progress fails. A frame is `u32be(N) || body`, N=1..65532. Noise plaintext is at
most 65516 bytes. The full handshake has a ten-second budget.

`reassembly::{fragment_data,DataAssembler,FragmentAssembler}` handles complete
local data versus 16KiB wire fragments, consistent headers and contiguous offsets.
Reserve the runtime aggregate budget/active-operation slot **before** creating an
assembler; its `new` reserves a single declared bounded logical item. `push`
includes the first fragment; constructors only establish/reserve its header.
`finish` fails on missing fragments. Runtime owns deadline/cancellation cleanup.
`validate_application` checks a complete Protobuf message or Any against an
explicit registered descriptor, or performs a wire scan only when `allow_opaque`
is explicitly true. No code/type URL is fetched. Empty application messages are
valid. `finish_descriptor` checks SHA256, declarations, imports and symbol closure
before returning a descriptor pool. Opaque fields cannot reveal nested message
types, so only registered descriptors enforce nested singular/oneof rules.

## Local logout and close

`CloudLogoutPolicy` includes `RevokeAndEndSession`. `AuthLogout.cloud_budget` is
optional; runtime supplies 30 seconds when absent (explicit range (0,30s]).
`AuthLogoutResult.cloud_status` uses `CloudLogoutStatus::{NotRequested,Succeeded,
Failed,Unsupported,UnknownOutcome}` independently of `local_closed/local_error`.
Failed/unsupported/unknown cloud outcomes require `cloud_error`.
`SdkClosed.cleanup_error` reports cleanup failure while the SDK remains closed.

## Validation and ownership

Raw scans reject duplicate singular/oneof fields, absent required oneofs, unknown
enums, mismatched wire types, groups, invalid lengths/varints/UTF-8, excessive
repetition/field count/depth, and oversized objects including unknown bytes.
Semantic checks cover IDs, public profile/metadata, snapshots, budgets, enums,
error consistency, ACK/RPC fragments, masks, limits, descriptor digests and WKT.
Unknown ordinary fields remain forward compatible within the resource budget.

The runtime still owns stateful contracts: local command/query ID uniqueness and
terminal delivery, final CAS profile merging and handler/type registration,
permissions with current block/generation/lease gates, rate/concurrency/global
memory limits, watch ordering, liveness/ping state, RPC credits/item counts and
call lifecycle, deduplication, admission/capacity sorting and secret classification
inside application-defined Any values. This crate does not implement auth,
transport, runtime, protected storage or JNI. No real EasyTier/Logto, Android or
cross-platform SDK integration is claimed by its in-memory stream tests.

## Verification

On Rust 1.97.1:

```sh
cargo +stable test --locked -p cyberbus-protocol
cargo +stable clippy --locked -p cyberbus-protocol --all-targets -- -D warnings
cargo +stable fmt --all -- --check
```

Tests exercise binary generation/roundtrips, structural rejection and boundaries,
partial/coalesced framing, complete 1MiB data reassembly, descriptor closure/hash,
Any and opaque application policy, real bidirectional Noise over duplex streams,
wrong PSK/binding/config/identity/block rejection, cancellation poisoning,
ciphertext replay/tampering/cross-session replay and authenticated sequence gaps.
