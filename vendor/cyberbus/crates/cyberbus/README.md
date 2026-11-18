# CyberBus runtime

The runtime joins the real Logto owner, embedded EasyTier no-TUN transport and Noise/Protobuf
protocol. Creating a client performs no authentication or network startup. The installation
identity and an OFFLINE self directory are available immediately.

```rust,ignore
let config = cyberbus::ClientConfig::from_json(&public_json)?;
let client = cyberbus::Client::new(config, store, StoreMode::Existing).await?;
let mut events = client.take_event_receiver().await.unwrap();
let result = client.execute(command).await;
```

`store` is `Box<dyn SecureStore>`. `StoreMode::CreateNew` explicitly provisions a new
installation; missing/corrupt Existing storage fails. Samples use `DevelopmentFileStore` or a
host `CallbackStore`, as requested by the user. OAuth grants stay in memory. This development
storage is not claimed to be Keystore protection.

The public configuration accepts `deploy/test-client.json` and the deployment manifest shape.
Fields are issuer, client_id, resource, product_id, native_clients (client ID to product),
redirect_uri, bootstrap_peers, optional listeners, offline_access and enable_p2p. A manifest's
redirect_uris selects `cyberbus://auth/callback` on Android and the fixed desktop loopback on
other platforms; its bootstrap.peers and public client/product pins are normalized locally.
Token, seed and client-secret configuration entrypoints are rejected.

`Client` is Clone + Send + Sync. `execute` and `execute_bytes` retain a single serialized owner;
bytes are strictly decoded before dispatch. `execute` returns command admission/results and
events carry directory/query/data/RPC outcomes. `poll_event(Duration)` or
`take_event_receiver()` consumes one bounded event stream, never both. Poll returns None on
timeout/EOF. Slow consumers exhaust a bounded queue and close remote admission; callers must
treat outstanding outcomes as unknown on EOF. There is no unbounded callback allocation.

`on_resume().await` checks the suspend-inclusive validation lease before foreground business.
`GetAuthState` remains an observational query. Expiry closes the peer gate independently of a
slow command. Stop/logout/close cancel discovery, all sessions and in-flight work; queued data
without a terminal ACK produces UNKNOWN_OUTCOME. Call Close through SdkClose before discarding
a native handle; drain the remaining events to EOF.

Set the public profile before NetworkStart. UpdatePublicProfile uses a nonempty FieldMask,
expected_revision CAS and input profile.config_revision=0. RegisterHandler makes a capability
available through RpcEvent; applications implement the handler by issuing RpcChunk/End/Window.
The runtime does not fabricate business completion. Data consumers explicitly issue
CompleteData(PROCESSED) or a business error after handling DataReceived.

The event path admits a remote device only after real Noise authentication and a validated
public profile. Up to 16 active peer sessions and 256 directory entries are bounded separately.
Messages are fragmented into 16KiB pieces, with up to 8 in flight per peer. Unary and bidi calls
track direction, item order, half-close, deadline and byte/item credit. Registered descriptors
are pulled in bounded chunks and SHA-256 verified. Block state persists with the installation
store and is enforced before queued peer callbacks and sends.

Acceptance evidence and remaining scope are recorded in [未解决事项](../../docs/UNRESOLVED.md)
root. Public signatures and messages are the cyberbus.easytier.v1 schema, reexported as `pb`.
