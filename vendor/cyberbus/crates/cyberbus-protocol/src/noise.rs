//! Real snow XXpsk3 sessions. Only `connect`/`accept` produce an established stream.
//! Runtime admission runs after cryptographic identity validation and before Ready.
use crate::{codec, error::invalid, framing, pb, Error, Result, MAX_PLAINTEXT};
use prost::Message;
use sha2::{Digest, Sha256};
use snow::{
    params::DHChoice,
    resolvers::{CryptoResolver, DefaultResolver},
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt, ReadHalf, WriteHalf};
use zeroize::Zeroizing;

pub const NOISE_SUITE: &str = "Noise_XXpsk3_25519_ChaChaPoly_SHA256";
pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
pub const DEFAULT_PERMISSIONS: [i32; 5] = [1, 2, 3, 4, 5];
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Initiator,
    Responder,
}
/// Contains secrets; deliberately has no Debug/Clone implementation. The auth owner supplies
/// the installation private key, derived app_psk/binding_id, verified config version and boot ID.
pub struct NoiseConfig {
    private_key: Zeroizing<[u8; 32]>,
    psk: Zeroizing<[u8; 32]>,
    pub binding_id: [u8; 32],
    pub config_version: String,
    pub boot_id: [u8; 16],
    pub receive_limits: pb::ReceiveLimits,
    pub permissions: Vec<i32>,
    /// Optional expected identity when connecting by a known device ID. No TOFU substitution.
    pub expected_peer: Option<[u8; 32]>,
}
impl NoiseConfig {
    pub fn new(
        private_key: [u8; 32],
        app_psk: [u8; 32],
        binding_id: [u8; 32],
        config_version: impl Into<String>,
        boot_id: [u8; 16],
    ) -> Self {
        Self {
            private_key: Zeroizing::new(private_key),
            psk: Zeroizing::new(app_psk),
            binding_id,
            config_version: config_version.into(),
            boot_id,
            receive_limits: default_receive_limits(),
            permissions: DEFAULT_PERMISSIONS.to_vec(),
            expected_peer: None,
        }
    }
    pub fn local_bind(&self) -> Result<pb::SessionBind> {
        let public = static_public_key(&self.private_key)?;
        Ok(pb::SessionBind {
            device_id: device_id(&public).to_vec(),
            installation_public_key: public.to_vec(),
            binding_id: self.binding_id.to_vec(),
            boot_id: self.boot_id.to_vec(),
            max_devices: 256,
            receive_limits: Some(self.receive_limits),
            requested_permissions: self.permissions.clone(),
        })
    }
}
pub fn default_receive_limits() -> pb::ReceiveLimits {
    pb::ReceiveLimits {
        max_message_bytes: 1_048_576,
        max_fragment_bytes: 16_384,
        max_data_in_flight: 8,
        max_rpc_in_flight: 16,
        rpc_byte_window: 65536,
        rpc_item_window: 4,
        max_descriptor_bytes: 262144,
    }
}
pub fn random_bytes<const N: usize>() -> Result<[u8; N]> {
    let mut value = [0; N];
    DefaultResolver
        .resolve_rng()
        .ok_or_else(|| invalid("Noise RNG unavailable"))?
        .try_fill_bytes(&mut value)?;
    Ok(value)
}
pub fn generate_keypair() -> Result<snow::Keypair> {
    Ok(snow::Builder::new(NOISE_SUITE.parse()?).generate_keypair()?)
}
pub fn static_public_key(private_key: &[u8; 32]) -> Result<[u8; 32]> {
    let mut dh = DefaultResolver
        .resolve_dh(&DHChoice::Curve25519)
        .ok_or_else(|| invalid("X25519 unavailable"))?;
    dh.set(private_key);
    dh.pubkey()
        .try_into()
        .map_err(|_| invalid("X25519 public key length"))
}
pub fn device_id(public_key: &[u8; 32]) -> [u8; 32] {
    Sha256::digest(public_key).into()
}
/// Exact E(parts...) used by the protocol, preserving raw UTF-8 and embedded NULs.
pub fn encode_parts(parts: &[&[u8]]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    for part in parts {
        let n = u32::try_from(part.len()).map_err(|_| Error::Limit("transcript field"))?;
        out.extend_from_slice(&n.to_be_bytes());
        out.extend_from_slice(part);
    }
    Ok(out)
}
pub fn prologue(
    binding_id: &[u8; 32],
    config_version: &str,
    initiator_hello_raw: &[u8],
    responder_hello_raw: &[u8],
) -> Result<Vec<u8>> {
    if config_version.is_empty() || config_version.len() > 64 || !config_version.is_ascii() {
        return Err(invalid("invalid config version"));
    }
    encode_parts(&[
        b"cyberbus/easytier/session/v1",
        binding_id,
        config_version.as_bytes(),
        initiator_hello_raw,
        responder_hello_raw,
    ])
}
#[derive(Clone, Debug)]
pub struct PeerIdentity {
    pub public_key: [u8; 32],
    pub device_id: [u8; 32],
    pub session_id: [u8; 32],
    pub bind: pb::SessionBind,
    pub granted_permissions: Vec<i32>,
}
struct Shared {
    transport: Mutex<snow::TransportState>,
    closed: Arc<AtomicBool>,
    session_id: [u8; 32],
}
struct Operation {
    closed: Arc<AtomicBool>,
    complete: bool,
}
impl Operation {
    fn new(shared: &Shared) -> Result<Self> {
        if shared.closed.load(Ordering::Acquire) {
            return Err(Error::Closed);
        }
        Ok(Self {
            closed: shared.closed.clone(),
            complete: false,
        })
    }
    fn finish(mut self) {
        self.complete = true;
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        if !self.complete {
            self.closed.store(true, Ordering::Release);
        }
    }
}
/// Established authenticated stream. Split it to independently drive inbound and outbound I/O.
/// Any error or cancellation of send/recv poisons both halves; reconnect with a fresh handshake.
pub struct SecureStream<S> {
    reader: SecureReader<ReadHalf<S>>,
    writer: SecureWriter<WriteHalf<S>>,
    peer: PeerIdentity,
}
pub struct SecureReader<R> {
    io: R,
    shared: Arc<Shared>,
    sequence: u64,
    limits: pb::ReceiveLimits,
    permissions: Vec<i32>,
}
pub struct SecureWriter<W> {
    io: W,
    shared: Arc<Shared>,
    sequence: u64,
    limits: pb::ReceiveLimits,
    permissions: Vec<i32>,
}
impl<S: AsyncRead + AsyncWrite + Unpin> SecureStream<S> {
    pub fn peer(&self) -> &PeerIdentity {
        &self.peer
    }
    pub async fn send(&mut self, body: pb::wire_envelope::Body) -> Result<()> {
        self.writer.send(body).await
    }
    pub async fn recv(&mut self) -> Result<pb::WireEnvelope> {
        self.reader.recv().await
    }
    pub fn into_split(
        self,
    ) -> (
        SecureReader<ReadHalf<S>>,
        SecureWriter<WriteHalf<S>>,
        PeerIdentity,
    ) {
        (self.reader, self.writer, self.peer)
    }
    pub async fn close(&mut self) -> Result<()> {
        self.writer.shutdown().await
    }
}
impl<R: AsyncRead + Unpin> SecureReader<R> {
    pub async fn recv(&mut self) -> Result<pb::WireEnvelope> {
        let operation = Operation::new(&self.shared)?;
        let envelope = receive(&mut self.io, &self.shared, &mut self.sequence).await?;
        established_body(
            envelope
                .body
                .as_ref()
                .ok_or_else(|| invalid("missing body"))?,
            &self.permissions,
            &self.limits,
        )?;
        if matches!(envelope.body, Some(pb::wire_envelope::Body::Close(_))) {
            self.shared.closed.store(true, Ordering::Release);
        }
        operation.finish();
        Ok(envelope)
    }
}
impl<W: AsyncWrite + Unpin> SecureWriter<W> {
    pub async fn send(&mut self, body: pb::wire_envelope::Body) -> Result<()> {
        let operation = Operation::new(&self.shared)?;
        established_body(&body, &self.permissions, &self.limits)?;
        let close = matches!(body, pb::wire_envelope::Body::Close(_));
        transmit(&mut self.io, &self.shared, &mut self.sequence, body).await?;
        if close {
            self.shared.closed.store(true, Ordering::Release);
        }
        operation.finish();
        Ok(())
    }
    /// Closes admission even if the underlying shutdown fails or this future is cancelled.
    pub async fn shutdown(&mut self) -> Result<()> {
        self.shared.closed.store(true, Ordering::Release);
        tokio::time::timeout(framing::RECORD_IDLE_TIMEOUT, self.io.shutdown())
            .await
            .map_err(|_| Error::Timeout)??;
        Ok(())
    }
}
fn established_body(
    body: &pb::wire_envelope::Body,
    permissions: &[i32],
    limits: &pb::ReceiveLimits,
) -> Result<()> {
    use pb::wire_envelope::Body::*;
    let permission = match body {
        Bind(_) | Ready(_) => return Err(invalid("bind/ready after establishment")),
        Metadata(_) => Some(pb::Permission::ReadPublicConfig),
        Data(_) | DataAck(_) | DataError(_) | DataCancel(_) => Some(pb::Permission::Data),
        RpcRequest(_) | RpcChunk(_) | RpcEnd(_) | RpcCancel(_) | RpcWindow(_) => {
            Some(pb::Permission::Rpc)
        }
        DescriptorQuery(_) | DescriptorChunk(_) | DescriptorError(_) => {
            Some(pb::Permission::PullDescriptor)
        }
        _ => None,
    };
    if permission.is_some_and(|p| !permissions.contains(&(p as i32))) {
        return Err(invalid("session permission not granted"));
    }
    let fragment = match body {
        Data(m) => m.fragment.as_ref(),
        RpcChunk(m) => m.fragment.as_ref(),
        _ => None,
    };
    if let Some(f) = fragment {
        if f.total_size > limits.max_message_bytes
            || f.protobuf_bytes.len() > limits.max_fragment_bytes as usize
        {
            return Err(Error::Limit("negotiated payload limit"));
        }
    }
    if let DescriptorChunk(c) = body {
        if c.total_size > limits.max_descriptor_bytes
            || c.protobuf_bytes.len() > limits.max_fragment_bytes as usize
        {
            return Err(Error::Limit("negotiated descriptor limit"));
        }
    }
    Ok(())
}
async fn transmit<W: AsyncWrite + Unpin>(
    io: &mut W,
    shared: &Shared,
    sequence: &mut u64,
    body: pb::wire_envelope::Body,
) -> Result<()> {
    let next = sequence
        .checked_add(1)
        .ok_or_else(|| invalid("sequence exhausted"))?;
    let plaintext = Zeroizing::new(codec::encode(&pb::WireEnvelope {
        session_id: shared.session_id.to_vec(),
        sequence: *sequence,
        body: Some(body),
    })?);
    if plaintext.len() > MAX_PLAINTEXT {
        return Err(Error::Limit("Noise plaintext"));
    }
    let mut ciphertext = vec![0; plaintext.len() + 16];
    let n = shared
        .transport
        .lock()
        .map_err(|_| Error::Closed)?
        .write_message(&plaintext, &mut ciphertext)?;
    framing::write_record(io, &ciphertext[..n]).await?;
    *sequence = next;
    Ok(())
}
async fn receive<R: AsyncRead + Unpin>(
    io: &mut R,
    shared: &Shared,
    sequence: &mut u64,
) -> Result<pb::WireEnvelope> {
    let next = sequence
        .checked_add(1)
        .ok_or_else(|| invalid("sequence exhausted"))?;
    let ciphertext = framing::read_record(io).await?.ok_or(Error::Closed)?;
    if ciphertext.len() < 16 {
        return Err(invalid("short Noise ciphertext"));
    }
    let mut plaintext = Zeroizing::new(vec![0; ciphertext.len()]);
    let n = shared
        .transport
        .lock()
        .map_err(|_| Error::Closed)?
        .read_message(&ciphertext, &mut plaintext)?;
    let envelope = codec::decode_wire(&plaintext[..n])?;
    if envelope.session_id != shared.session_id || envelope.sequence != *sequence {
        return Err(invalid("session ID or sequence mismatch"));
    }
    *sequence = next;
    Ok(envelope)
}
/// Connect over an already connected AsyncRead+AsyncWrite stream. `admit` MUST check the
/// current account's block/admission policy using the authenticated peer bind. It may return
/// an error to close before Ready; it must not publish metadata or run application callbacks.
pub async fn connect<S, F>(io: S, config: NoiseConfig, admit: F) -> Result<SecureStream<S>>
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: FnOnce(&pb::SessionBind) -> Result<()>,
{
    establish(io, Role::Initiator, config, admit).await
}
pub async fn accept<S, F>(io: S, config: NoiseConfig, admit: F) -> Result<SecureStream<S>>
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: FnOnce(&pb::SessionBind) -> Result<()>,
{
    establish(io, Role::Responder, config, admit).await
}
async fn pre_send<S: AsyncWrite + Unpin>(
    io: &mut S,
    body: pb::pre_session_record::Body,
) -> Result<()> {
    framing::write_record(
        io,
        &codec::encode(&pb::PreSessionRecord { body: Some(body) })?,
    )
    .await
}
async fn pre_recv<S: AsyncRead + Unpin>(io: &mut S) -> Result<pb::pre_session_record::Body> {
    let bytes = framing::read_record(io).await?.ok_or(Error::Closed)?;
    codec::decode::<pb::PreSessionRecord>(&bytes)?
        .body
        .ok_or_else(|| invalid("missing pre-session body"))
}
async fn establish<S, F>(
    io: S,
    role: Role,
    config: NoiseConfig,
    admit: F,
) -> Result<SecureStream<S>>
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: FnOnce(&pb::SessionBind) -> Result<()>,
{
    tokio::time::timeout(HANDSHAKE_TIMEOUT, establish_inner(io, role, config, admit))
        .await
        .map_err(|_| Error::Timeout)?
}
async fn establish_inner<S, F>(
    mut io: S,
    role: Role,
    config: NoiseConfig,
    admit: F,
) -> Result<SecureStream<S>>
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: FnOnce(&pb::SessionBind) -> Result<()>,
{
    use pb::{pre_session_record::Body as Pre, wire_envelope::Body};
    let local_bind = config.local_bind()?;
    codec::encode(&local_bind)?;
    let hello = pb::ProtocolHello {
        major: 1,
        minor: 0,
        nonce: random_bytes::<32>()?.to_vec(),
        suite: NOISE_SUITE.into(),
    };
    let local_raw = hello.encode_to_vec();
    // Retain the exact raw ProtocolHello submessage, including allowed unknown fields.
    let remote_raw = if role == Role::Initiator {
        pre_send(&mut io, Pre::Hello(hello)).await?;
        read_hello(&mut io).await?
    } else {
        let raw = read_hello(&mut io).await?;
        pre_send(&mut io, Pre::Hello(hello)).await?;
        raw
    };
    let (initiator, responder) = if role == Role::Initiator {
        (&local_raw, &remote_raw)
    } else {
        (&remote_raw, &local_raw)
    };
    let prologue = prologue(
        &config.binding_id,
        &config.config_version,
        initiator,
        responder,
    )?;
    let builder = snow::Builder::new(NOISE_SUITE.parse()?)
        .local_private_key(config.private_key.as_ref())?
        .psk(3, &config.psk)?
        .prologue(&prologue)?;
    let mut handshake = if role == Role::Initiator {
        builder.build_initiator()?
    } else {
        builder.build_responder()?
    };
    let mut scratch = Zeroizing::new(vec![0; 4096]);
    for step in 0..3 {
        let sending = (step % 2 == 0) == (role == Role::Initiator);
        if sending {
            let n = handshake.write_message(&[], &mut scratch)?;
            pre_send(&mut io, Pre::Noise(scratch[..n].to_vec())).await?;
        } else {
            let Pre::Noise(bytes) = pre_recv(&mut io).await? else {
                return Err(invalid("expected Noise handshake record"));
            };
            let n = handshake.read_message(&bytes, &mut scratch)?;
            if n != 0 {
                return Err(invalid("nonempty Noise application payload"));
            }
        }
    }
    if !handshake.is_handshake_finished() {
        return Err(invalid("incomplete Noise handshake"));
    }
    let remote_static: [u8; 32] = handshake
        .get_remote_static()
        .ok_or_else(|| invalid("missing authenticated static key"))?
        .try_into()
        .map_err(|_| invalid("static key length"))?;
    let remote_id = device_id(&remote_static);
    if config.expected_peer.is_some_and(|id| id != remote_id) {
        return Err(invalid("unexpected peer identity"));
    }
    let mut hash = Sha256::new();
    hash.update(b"cyberbus/easytier/session-id/v1");
    hash.update(handshake.get_handshake_hash());
    let session_id: [u8; 32] = hash.finalize().into();
    let shared = Arc::new(Shared {
        transport: Mutex::new(handshake.into_transport_mode()?),
        closed: Arc::new(AtomicBool::new(false)),
        session_id,
    });
    let mut send_seq = 1;
    let mut recv_seq = 1;
    let remote = if role == Role::Initiator {
        transmit(&mut io, &shared, &mut send_seq, Body::Bind(local_bind)).await?;
        receive(&mut io, &shared, &mut recv_seq).await?
    } else {
        let b = receive(&mut io, &shared, &mut recv_seq).await?;
        transmit(&mut io, &shared, &mut send_seq, Body::Bind(local_bind)).await?;
        b
    };
    let Some(Body::Bind(remote_bind)) = remote.body else {
        return Err(invalid("first ciphertext must be bind"));
    };
    if remote_bind.installation_public_key != remote_static
        || remote_bind.device_id != remote_id
        || remote_bind.binding_id != config.binding_id
    {
        return Err(invalid("Noise identity or binding mismatch"));
    }
    admit(&remote_bind)?;
    let granted: Vec<i32> = remote_bind
        .requested_permissions
        .iter()
        .copied()
        .filter(|p| config.permissions.contains(p))
        .collect();
    let ready = Body::Ready(pb::SessionReady {
        granted_permissions: granted.clone(),
    });
    let remote = if role == Role::Initiator {
        transmit(&mut io, &shared, &mut send_seq, ready).await?;
        receive(&mut io, &shared, &mut recv_seq).await?
    } else {
        let r = receive(&mut io, &shared, &mut recv_seq).await?;
        transmit(&mut io, &shared, &mut send_seq, ready).await?;
        r
    };
    let Some(Body::Ready(ready)) = remote.body else {
        return Err(invalid("expected session ready"));
    };
    if ready
        .granted_permissions
        .iter()
        .any(|p| !config.permissions.contains(p))
    {
        return Err(invalid("unrequested permission grant"));
    }
    let peer = PeerIdentity {
        public_key: remote_static,
        device_id: remote_id,
        session_id,
        bind: remote_bind.clone(),
        granted_permissions: ready.granted_permissions.clone(),
    };
    let (read, write) = tokio::io::split(io);
    Ok(SecureStream {
        reader: SecureReader {
            io: read,
            shared: shared.clone(),
            sequence: recv_seq,
            limits: config.receive_limits,
            permissions: granted,
        },
        writer: SecureWriter {
            io: write,
            shared,
            sequence: send_seq,
            limits: remote_bind
                .receive_limits
                .ok_or_else(|| invalid("missing receive limits"))?,
            permissions: ready.granted_permissions,
        },
        peer,
    })
}
async fn read_hello<S: AsyncRead + Unpin>(io: &mut S) -> Result<Vec<u8>> {
    let record = framing::read_record(io).await?.ok_or(Error::Closed)?;
    let decoded = codec::decode::<pb::PreSessionRecord>(&record)?;
    if !matches!(decoded.body, Some(pb::pre_session_record::Body::Hello(_))) {
        return Err(invalid("expected hello"));
    }
    // Extract original bytes instead of re-encoding prost's parsed message. Structure was checked.
    let mut input = record.as_slice();
    fn read_varint(input: &mut &[u8]) -> u64 {
        let mut n = 0;
        for i in 0..10 {
            let b = input[0];
            *input = &input[1..];
            n |= u64::from(b & 127) << (7 * i);
            if b < 128 {
                return n;
            }
        }
        unreachable!()
    }
    while !input.is_empty() {
        let key = read_varint(&mut input);
        match key & 7 {
            0 => {
                read_varint(&mut input);
            }
            1 => input = &input[8..],
            5 => input = &input[4..],
            2 => {
                let n = read_varint(&mut input) as usize;
                let data = &input[..n];
                input = &input[n..];
                if key >> 3 == 1 {
                    return Ok(data.to_vec());
                }
            }
            _ => unreachable!(),
        }
    }
    Err(invalid("missing hello"))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn transport_pair() -> (Shared, Shared) {
        let params = NOISE_SUITE.parse().unwrap();
        let mut a = snow::Builder::new(params)
            .local_private_key(&[1; 32])
            .unwrap()
            .psk(3, &[3; 32])
            .unwrap()
            .prologue(b"test")
            .unwrap()
            .build_initiator()
            .unwrap();
        let mut b = snow::Builder::new(NOISE_SUITE.parse().unwrap())
            .local_private_key(&[2; 32])
            .unwrap()
            .psk(3, &[3; 32])
            .unwrap()
            .prologue(b"test")
            .unwrap()
            .build_responder()
            .unwrap();
        let mut out = [0; 256];
        let mut plain = [0; 256];
        let n = a.write_message(&[], &mut out).unwrap();
        b.read_message(&out[..n], &mut plain).unwrap();
        let n = b.write_message(&[], &mut out).unwrap();
        a.read_message(&out[..n], &mut plain).unwrap();
        let n = a.write_message(&[], &mut out).unwrap();
        b.read_message(&out[..n], &mut plain).unwrap();
        let make = |transport| Shared {
            transport: Mutex::new(transport),
            closed: Arc::new(AtomicBool::new(false)),
            session_id: [8; 32],
        };
        (
            make(a.into_transport_mode().unwrap()),
            make(b.into_transport_mode().unwrap()),
        )
    }
    fn encrypted(shared: &Shared, session: Vec<u8>, sequence: u64) -> Vec<u8> {
        let message = codec::encode(&pb::WireEnvelope {
            session_id: session,
            sequence,
            body: Some(pb::wire_envelope::Body::Ping(pb::Ping {
                nonce: vec![7; 16],
            })),
        })
        .unwrap();
        let mut out = vec![0; message.len() + 16];
        shared
            .transport
            .lock()
            .unwrap()
            .write_message(&message, &mut out)
            .unwrap();
        out
    }
    #[tokio::test]
    async fn rejects_ciphertext_replay_tamper_and_cross_session() {
        for case in 0..3 {
            let (a, b) = transport_pair();
            let raw = encrypted(&a, vec![8; 32], 1);
            let mut record = vec![];
            framing::write_record(&mut record, &raw).await.unwrap();
            let mut seq = 1;
            receive(&mut record.as_slice(), &b, &mut seq).await.unwrap();
            let mut replay = raw.clone();
            if case == 1 {
                replay[0] ^= 1;
            }
            let mut bytes = vec![];
            framing::write_record(&mut bytes, &replay).await.unwrap();
            if case == 2 {
                let (_, fresh) = transport_pair();
                assert!(receive(&mut bytes.as_slice(), &fresh, &mut 1)
                    .await
                    .is_err());
            } else {
                assert!(receive(&mut bytes.as_slice(), &b, &mut seq).await.is_err());
            }
        }
    }
    #[tokio::test]
    async fn rejects_authenticated_sequence_gap_or_wrong_session() {
        for (session, sequence) in [(vec![8; 32], 2), (vec![9; 32], 1)] {
            let (a, b) = transport_pair();
            let raw = encrypted(&a, session, sequence);
            let mut record = vec![];
            framing::write_record(&mut record, &raw).await.unwrap();
            assert!(receive(&mut record.as_slice(), &b, &mut 1).await.is_err());
        }
    }
}
