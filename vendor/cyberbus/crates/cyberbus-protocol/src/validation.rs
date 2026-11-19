//! Descriptor-driven wire validation, performed before prost's permissive decoder.
use crate::{
    error::invalid, Error, Result, FILE_DESCRIPTOR_SET, MAX_DESCRIPTOR, MAX_FRAGMENT,
    MAX_LOCAL_OBJECT, MAX_MESSAGE, MAX_PLAINTEXT,
};
use prost::Message;
use prost_reflect::{
    Cardinality, DescriptorPool, DynamicMessage, Kind, MessageDescriptor, ReflectMessage, Value,
};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    sync::OnceLock,
};

pub fn descriptor_pool() -> &'static DescriptorPool {
    static POOL: OnceLock<DescriptorPool> = OnceLock::new();
    POOL.get_or_init(|| {
        DescriptorPool::decode(FILE_DESCRIPTOR_SET).expect("compiled descriptor set")
    })
}
#[derive(Clone, Copy)]
pub struct ScanLimits {
    pub max_bytes: usize,
    pub max_depth: usize,
    pub max_fields: usize,
    pub max_repeated: usize,
}
impl Default for ScanLimits {
    fn default() -> Self {
        Self {
            max_bytes: MAX_LOCAL_OBJECT,
            max_depth: 32,
            max_fields: 100_000,
            max_repeated: 4096,
        }
    }
}
fn varint(input: &mut &[u8]) -> Result<u64> {
    let mut value = 0;
    for i in 0..10 {
        let (&b, rest) = input
            .split_first()
            .ok_or_else(|| invalid("truncated varint"))?;
        *input = rest;
        if i == 9 && b > 1 {
            return Err(invalid("varint overflow"));
        }
        value |= u64::from(b & 127) << (i * 7);
        if b < 128 {
            return Ok(value);
        }
    }
    Err(invalid("varint overflow"))
}
fn take<'a>(input: &mut &'a [u8], n: usize) -> Result<&'a [u8]> {
    if n > input.len() {
        return Err(invalid("truncated field"));
    }
    let (value, rest) = input.split_at(n);
    *input = rest;
    Ok(value)
}
fn wire_kind(kind: &Kind) -> u64 {
    match kind {
        Kind::Double | Kind::Fixed64 | Kind::Sfixed64 => 1,
        Kind::String | Kind::Bytes | Kind::Message(_) => 2,
        Kind::Float | Kind::Fixed32 | Kind::Sfixed32 => 5,
        _ => 0,
    }
}
fn repeated_limit(message: &str, field: &str, fallback: usize) -> usize {
    match (message, field) {
        ("DevicesSnapshot", "devices") => 256,
        ("BlockedDevicesSnapshot", "devices") => 1024,
        ("PublicProfile", "capabilities") => 64,
        ("SubscribeData", "type_urls") => 64,
        ("SessionBind", "requested_permissions") | ("SessionReady", "granted_permissions") => 6,
        ("FileDescriptorSet", "file") => 128,
        ("FieldMask", "paths") => 16,
        _ => fallback,
    }
}
fn scan(
    mut input: &[u8],
    desc: Option<&MessageDescriptor>,
    limits: ScanLimits,
    depth: usize,
    fields_left: &mut usize,
) -> Result<()> {
    if depth > limits.max_depth {
        return Err(Error::Limit("protobuf nesting"));
    }
    let mut seen = HashSet::new();
    let mut oneofs = HashSet::new();
    let mut counts = HashMap::<u32, usize>::new();
    while !input.is_empty() {
        *fields_left = fields_left
            .checked_sub(1)
            .ok_or(Error::Limit("protobuf field count"))?;
        let key = varint(&mut input)?;
        let number = key >> 3;
        let wire = key & 7;
        if number == 0 || number > 0x1fff_ffff || !matches!(wire, 0 | 1 | 2 | 5) {
            return Err(invalid("invalid protobuf tag or forbidden group"));
        }
        let number = number as u32;
        let field = desc.and_then(|d| d.get_field(number));
        if let Some(f) = &field {
            if f.cardinality() != Cardinality::Repeated && !seen.insert(number) {
                return Err(invalid(format!("duplicate singular {}", f.full_name())));
            }
            if let Some(oneof) = f.containing_oneof() {
                if !oneofs.insert(oneof.full_name().to_string()) {
                    return Err(invalid("conflicting oneof fields"));
                }
            }
            let kind = f.kind();
            let packed = wire == 2
                && f.is_list()
                && !matches!(kind, Kind::String | Kind::Bytes | Kind::Message(_));
            if wire != wire_kind(&kind) && !packed {
                return Err(invalid("field wire type mismatch"));
            }
            let count = if packed { 0 } else { 1 };
            *counts.entry(number).or_default() += count;
        }
        let data = match wire {
            0 => {
                let n = varint(&mut input)?;
                if let Some(f) = &field {
                    validate_scalar(&f.kind(), n)?;
                }
                None
            }
            1 => {
                take(&mut input, 8)?;
                None
            }
            5 => {
                take(&mut input, 4)?;
                None
            }
            2 => {
                let n = usize::try_from(varint(&mut input)?)
                    .map_err(|_| Error::Limit("field length"))?;
                Some(take(&mut input, n)?)
            }
            _ => unreachable!(),
        };
        if let (Some(f), Some(data)) = (&field, data) {
            match f.kind() {
                Kind::Message(nested) => {
                    let cap = match nested.name() {
                        "PeerMetadata" | "PublicProfile" => 16384,
                        "Any" if f.name() == "public_config" => 8192,
                        "DevicesSnapshot" => MAX_LOCAL_OBJECT,
                        "AuthEvent" | "BlockedDevicesSnapshot" => 65536,
                        _ => limits.max_bytes,
                    };
                    if data.len() > cap {
                        return Err(Error::Limit("nested message size"));
                    }
                    if nested.name() == "Any" && f.name() == "public_config" && data.len() > 8192 {
                        return Err(Error::Limit("public config"));
                    }
                    scan(data, Some(&nested), limits, depth + 1, fields_left)?;
                }
                Kind::String => {
                    std::str::from_utf8(data).map_err(|_| invalid("invalid UTF-8"))?;
                }
                Kind::Bytes => {}
                kind => {
                    let mut packed = data;
                    while !packed.is_empty() {
                        *fields_left = fields_left
                            .checked_sub(1)
                            .ok_or(Error::Limit("packed scalar count"))?;
                        match wire_kind(&kind) {
                            0 => validate_scalar(&kind, varint(&mut packed)?)?,
                            1 => {
                                take(&mut packed, 8)?;
                            }
                            5 => {
                                take(&mut packed, 4)?;
                            }
                            _ => unreachable!(),
                        }
                        *counts.entry(number).or_default() += 1;
                    }
                }
            }
        }
        if let Some(f) = &field {
            if f.is_list() || f.is_map() {
                let cap = repeated_limit(desc.unwrap().name(), f.name(), limits.max_repeated);
                if counts.get(&number).copied().unwrap_or(0) > cap {
                    return Err(Error::Limit("repeated field count"));
                }
            }
        }
    }
    Ok(())
}
fn validate_scalar(kind: &Kind, n: u64) -> Result<()> {
    match kind {
        Kind::Enum(e)
            if e.get_value(n as i32).is_none() || (n > i32::MAX as u64 && n < i64::MIN as u64) =>
        {
            Err(invalid("unknown enum value"))
        }
        Kind::Bool if n > 1 => Err(invalid("noncanonical boolean")),
        Kind::Uint32 | Kind::Sint32 if n > u32::MAX as u64 => {
            Err(invalid("32 bit scalar overflow"))
        }
        Kind::Int32 if n > i32::MAX as u64 && n < (i32::MIN as i64 as u64) => {
            Err(invalid("int32 scalar overflow"))
        }
        _ => Ok(()),
    }
}
/// Scan an explicitly opaque application Protobuf. Unknown length-delimited fields remain opaque;
/// only a registered descriptor can identify nested messages and enforce their structure.
pub fn validate_opaque(bytes: &[u8]) -> Result<()> {
    if bytes.len() > MAX_MESSAGE {
        return Err(Error::Limit("application message"));
    }
    let limits = ScanLimits {
        max_bytes: MAX_MESSAGE,
        ..Default::default()
    };
    scan(bytes, None, limits, 0, &mut limits.max_fields.clone())
}
/// Enforce wire structure, including duplicate/oneof conflicts, without requiring
/// optional application oneofs to be set. Protocol body presence is checked by `validate`.
pub fn validate_structure(
    bytes: &[u8],
    desc: &MessageDescriptor,
    limits: ScanLimits,
) -> Result<()> {
    if bytes.len() > limits.max_bytes {
        return Err(Error::Limit("protobuf object"));
    }
    scan(bytes, Some(desc), limits, 0, &mut limits.max_fields.clone())
}
pub fn validate(bytes: &[u8], full_name: &str) -> Result<()> {
    let desc = descriptor_pool()
        .get_message_by_name(full_name)
        .ok_or_else(|| invalid("unregistered schema"))?;
    let max_bytes = match desc.name() {
        "WireEnvelope" => MAX_PLAINTEXT,
        "PreSessionRecord" => crate::MAX_RECORD_BODY,
        "SdkResult" | "AuthEvent" | "BlockedDevicesQueryResult" => 65536,
        "PeerMetadata" => 16384,
        "PublicProfile" => 16384,
        _ => MAX_LOCAL_OBJECT,
    };
    validate_structure(
        bytes,
        &desc,
        ScanLimits {
            max_bytes,
            ..Default::default()
        },
    )?;
    let dynamic = DynamicMessage::decode(desc, bytes)?;
    semantic(&dynamic, "")
}
fn value(m: &DynamicMessage, name: &str) -> Value {
    m.get_field_by_name(name)
        .map(|v| v.into_owned())
        .unwrap_or(Value::Bool(false))
}
fn number(m: &DynamicMessage, name: &str) -> u64 {
    match value(m, name) {
        Value::U32(v) => v.into(),
        Value::U64(v) => v,
        Value::EnumNumber(v) => v as u64,
        Value::I32(v) => v as u64,
        Value::I64(v) => v as u64,
        _ => 0,
    }
}
fn flag(m: &DynamicMessage, name: &str) -> bool {
    matches!(value(m, name), Value::Bool(true))
}
fn bytes(m: &DynamicMessage, name: &str) -> Vec<u8> {
    match value(m, name) {
        Value::Bytes(v) => v.to_vec(),
        _ => vec![],
    }
}
fn text(m: &DynamicMessage, name: &str) -> String {
    match value(m, name) {
        Value::String(v) => v,
        _ => String::new(),
    }
}
fn list(m: &DynamicMessage, name: &str) -> Vec<Value> {
    match value(m, name) {
        Value::List(v) => v,
        _ => vec![],
    }
}
fn has(m: &DynamicMessage, name: &str) -> bool {
    m.descriptor()
        .get_field_by_name(name)
        .is_some_and(|f| m.has_field(&f))
}
fn require(m: &DynamicMessage, names: &[&str]) -> Result<()> {
    for name in names {
        if !has(m, name) {
            return Err(invalid(format!("missing {}.{name}", m.descriptor().name())));
        }
    }
    Ok(())
}
fn positive(m: &DynamicMessage, names: &[&str]) -> Result<()> {
    for name in names {
        if number(m, name) == 0 {
            return Err(invalid(format!("zero {}.{name}", m.descriptor().name())));
        }
    }
    Ok(())
}
fn bounded_text(s: &str, min: usize, max: usize, newline: bool) -> Result<()> {
    if s.len() < min
        || s.len() > max
        || s.chars().any(|c| c.is_control() && !(newline && c == '\n'))
    {
        return Err(invalid("invalid text length or control character"));
    }
    Ok(())
}
pub fn validate_type_url(s: &str) -> Result<()> {
    bounded_text(s, 1, 512, false)?;
    let (prefix, name) = s
        .rsplit_once('/')
        .ok_or_else(|| invalid("type URL missing prefix"))?;
    if prefix.is_empty() || !name.contains('.') || !name.split('.').all(identifier) {
        return Err(invalid("invalid type URL"));
    }
    Ok(())
}
fn identifier(s: &str) -> bool {
    let mut c = s.chars();
    c.next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && c.all(|c| c.is_ascii_alphanumeric() || c == '_')
}
fn semantic(m: &DynamicMessage, parent: &str) -> Result<()> {
    let desc = m.descriptor();
    let name = desc.name();
    if !desc.full_name().starts_with("cyberbus.easytier.v1.")
        && !desc.full_name().starts_with("google.protobuf.")
    {
        return Ok(());
    }
    // These protocol contracts require a selected body/result. Protobuf oneofs
    // are otherwise optional, including those in registered application messages.
    if desc.full_name().starts_with("cyberbus.easytier.v1.") {
        let required = match name {
            "PreSessionRecord" | "WireEnvelope" | "SdkCommand" | "SdkResult" | "SdkEvent"
            | "DevicesEvent" | "RpcEvent" => Some("body"),
            "DevicesQueryResult"
            | "DeviceDescriptorResult"
            | "CompleteData"
            | "DataStatus"
            | "DescriptorResult"
            | "BlockedDevicesQueryResult" => Some("result"),
            _ => None,
        };
        if let Some(required) = required {
            let oneof = desc
                .oneofs()
                .find(|o| o.name() == required)
                .expect("protocol oneof");
            if !oneof.fields().any(|f| m.has_field(&f)) {
                return Err(invalid(format!("missing {}", oneof.full_name())));
            }
        }
    }
    // Required enums use neither UNSPECIFIED nor unknown values. Unknowns were rejected by scan.
    for f in desc.fields() {
        if let Kind::Enum(_) = f.kind() {
            if (f.name() != "reason" || name != "AuthEvent")
                && !f.is_list()
                && (!f.supports_presence() || m.has_field(&f))
                && number(m, f.name()) == 0
            {
                return Err(invalid("unspecified enum"));
            }
        }
        let v = m.get_field(&f);
        if let Value::Bytes(b) = v.as_ref() {
            let (len, optional) = match f.name() {
                "device_id"
                | "peer_device_id"
                | "installation_public_key"
                | "binding_id"
                | "session_id"
                | "digest" => (32, f.supports_presence() && !m.has_field(&f)),
                "descriptor_digest" => (32, true),
                "operation_id" => (16, name == "AuthEvent"),
                "runtime_id" => (16, name == "SdkEvent"),
                "command_id" | "message_id" | "call_id" | "query_id" | "boot_id" | "watch_id"
                | "subscription_id" => (16, false),
                "handler_id" => (16, name == "RpcEvent"),
                "in_reply_to" => (16, true),
                "virtual_ipv4" => (4, true),
                "nonce" => (if name == "ProtocolHello" { 32 } else { 16 }, false),
                _ => (0, true),
            };
            if len > 0 && !(b.len() == len || optional && b.is_empty()) {
                return Err(invalid(format!("invalid {}.{} length", name, f.name())));
            }
        }
        if let Value::String(s) = v.as_ref() {
            match f.name() {
                "application_type_url" | "type_url" | "request_type_url" | "response_type_url" => {
                    validate_type_url(s)?
                }
                "device_name" | "method_id" => bounded_text(s, 1, 128, false)?,
                "semantic_version" | "config_semantic_version" => {
                    bounded_text(s, 1, 64, false)?;
                    semver::Version::parse(s).map_err(|_| invalid("invalid semantic version"))?;
                }
                "message" if name == "ProtocolError" => bounded_text(s, 0, 512, true)?,
                "authorization_uri" | "callback_uri" => bounded_text(s, 1, 8192, false)?,
                _ => {}
            }
        }
    }
    match name {
        "ProtocolHello" => {
            if number(m, "major") != 1
                || number(m, "minor") != 0
                || text(m, "suite") != crate::noise::NOISE_SUITE
            {
                return Err(invalid("unsupported version or Noise suite"));
            }
        }
        "PreSessionRecord" => {
            if has(m, "noise") && (bytes(m, "noise").is_empty() || bytes(m, "noise").len() > 4096) {
                return Err(Error::Limit("Noise handshake record"));
            }
        }
        "WireEnvelope" => positive(m, &["sequence"])?,
        "SdkEvent" => {
            positive(m, &["event_sequence"])?;
            if !has(m, "auth") && bytes(m, "runtime_id").len() != 16 {
                return Err(invalid("event runtime ID required"));
            }
        }
        "SessionBind" => {
            require(m, &["receive_limits"])?;
            if number(m, "max_devices") != 256 {
                return Err(invalid("incompatible device capacity"));
            }
            if Sha256::digest(bytes(m, "installation_public_key")).as_slice()
                != bytes(m, "device_id")
            {
                return Err(invalid("device ID/public key mismatch"));
            }
        }
        "ReceiveLimits" => {
            for (field, max) in [
                ("max_message_bytes", MAX_MESSAGE),
                ("max_fragment_bytes", MAX_FRAGMENT),
                ("max_data_in_flight", 8),
                ("max_rpc_in_flight", 16),
                ("rpc_byte_window", 65536),
                ("rpc_item_window", 4),
                ("max_descriptor_bytes", MAX_DESCRIPTOR),
            ] {
                let n = number(m, field);
                if n == 0 || n > max as u64 {
                    return Err(invalid("invalid receive limit"));
                }
            }
            if number(m, "max_fragment_bytes") > number(m, "max_message_bytes") {
                return Err(invalid("fragment limit exceeds message limit"));
            }
        }
        "SessionReady" => {}
        "PeerMetadata" => require(m, &["profile"])?,
        "PublicProfile" => {
            if parent != "UpdatePublicProfile" {
                positive(m, &["config_revision"])?;
            } else if number(m, "config_revision") != 0 {
                return Err(invalid("SDK assigns profile revision"));
            }
            let mut methods = HashSet::new();
            for v in list(m, "capabilities") {
                if let Value::Message(c) = v {
                    if !methods.insert(text(&c, "method_id")) {
                        return Err(invalid("duplicate capability"));
                    }
                }
            }
        }
        "DeviceSnapshot" => {
            if Sha256::digest(bytes(m, "installation_public_key")).as_slice()
                != bytes(m, "device_id")
            {
                return Err(invalid("device ID/public key mismatch"));
            }
            if !has(m, "profile") && !(flag(m, "is_local") && number(m, "presence") == 2) {
                return Err(invalid("device profile required"));
            }
            if !flag(m, "is_local") {
                require(m, &["last_authenticated_at"])?;
            }
        }
        "DevicesSnapshot" => {
            positive(m, &["revision"])?;
            let mut local = 0;
            let mut last = None;
            for v in list(m, "devices") {
                if let Value::Message(d) = v {
                    local += usize::from(flag(&d, "is_local"));
                    let id = bytes(&d, "device_id");
                    if last.as_ref().is_some_and(|previous| previous >= &id) {
                        return Err(invalid("snapshot device IDs must be unique and sorted"));
                    }
                    last = Some(id);
                }
            }
            if local != 1 {
                return Err(invalid("snapshot requires exactly one self"));
            }
        }
        "AuthEvent" => {
            positive(m, &["state_revision"])?;
            if flag(m, "reauth_required") != (number(m, "reason") != 0)
                || number(m, "phase") == 6 && !flag(m, "reauth_required")
            {
                return Err(invalid("invalid reauthentication latch"));
            }
            if has(m, "account") && number(m, "phase") != 4 {
                return Err(invalid("account only in authenticated state"));
            }
        }
        "BlockScope" | "AccountSummary" => {
            for n in ["issuer", "subject", "product_id"] {
                if text(m, n).is_empty() {
                    return Err(invalid("missing account binding"));
                }
            }
        }
        "DeviceBlockResult" => {
            require(m, &["scope", "state"])?;
            positive(m, &["revision", "state_revision"])?;
        }
        "BlockedDevicesSnapshot" => {
            require(m, &["scope"])?;
            positive(m, &["revision", "state_revision"])?;
            let ids: Vec<_> = list(m, "devices")
                .iter()
                .filter_map(|v| {
                    if let Value::Message(d) = v {
                        Some(bytes(d, "device_id"))
                    } else {
                        None
                    }
                })
                .collect();
            if ids.windows(2).any(|w| w[0] >= w[1]) {
                return Err(invalid("block IDs must be unique and sorted"));
            }
        }
        "DeviceBlockState" => {
            if !flag(m, "persistence_pending") && flag(m, "blocked") != flag(m, "persisted_blocked")
            {
                return Err(invalid("inconsistent persisted block state"));
            }
        }
        "PayloadFragment" => {
            let total = number(m, "total_size");
            let offset = number(m, "offset");
            let len = bytes(m, "protobuf_bytes").len() as u64;
            if total > MAX_MESSAGE as u64 || offset + len > total {
                return Err(Error::Limit("payload fragment bounds"));
            }
            if total > 0 && len == 0 {
                return Err(invalid("empty nonterminal fragment"));
            }
        }
        "DataMessage" => {
            require(m, &["fragment", "timeout"])?;
        }
        "RpcChunk" => require(m, &["fragment"])?,
        "RpcEvent" => {
            if has(m, "request") && bytes(m, "handler_id").len() != 16 {
                return Err(invalid("inbound RPC request missing handler binding"));
            }
        }
        "Send" | "DataReceived" => require(m, &["message"])?,
        "RpcRequest" | "DescriptorQuery" => require(m, &["timeout"])?,
        "RpcEnd" => {
            if number(m, "direction") == 1 && has(m, "error") {
                return Err(invalid("request end cannot carry an error"));
            }
        }
        "RpcWindow" => {
            if number(m, "byte_credit") > 65536
                || number(m, "item_credit") > 4
                || number(m, "byte_credit") + number(m, "item_credit") == 0
            {
                return Err(invalid("invalid RPC credit"));
            }
        }
        "DescriptorChunk" => {
            let total = number(m, "total_size");
            let offset = number(m, "offset");
            let n = bytes(m, "protobuf_bytes").len() as u64;
            if total == 0
                || total > MAX_DESCRIPTOR as u64
                || n == 0
                || n > MAX_FRAGMENT as u64
                || offset + n > total
            {
                return Err(Error::Limit("descriptor fragment bounds"));
            }
        }
        "RegisterHandler" => {
            require(m, &["capability"])?;
            if has(m, "descriptor_set") {
                validate_descriptor_set(&bytes(m, "descriptor_set"))?;
            }
        }
        "DescriptorResult" => {
            if has(m, "descriptor_set") {
                let raw = bytes(m, "descriptor_set");
                validate_descriptor_set(&raw)?;
                if Sha256::digest(&raw).as_slice() != bytes(m, "digest") {
                    return Err(invalid("descriptor digest mismatch"));
                }
            }
        }
        "SubscribeData" => {
            let urls = list(m, "type_urls");
            if urls.is_empty() {
                return Err(invalid("empty data subscription"));
            }
            let mut seen = HashSet::new();
            for v in urls {
                if let Value::String(s) = v {
                    validate_type_url(&s)?;
                    if !seen.insert(s) {
                        return Err(invalid("duplicate subscription type"));
                    }
                }
            }
        }
        "UpdatePublicProfile" => {
            require(m, &["profile", "update_mask"])?;
            check_mask(
                m,
                "update_mask",
                &[
                    "device_name",
                    "public_config",
                    "config_semantic_version",
                    "capabilities",
                ],
            )?;
        }
        "DeviceUpdated" => {
            require(m, &["device", "changed_fields"])?;
            check_mask(
                m,
                "changed_fields",
                &[
                    "profile.device_name",
                    "profile.public_config",
                    "profile.config_revision",
                    "profile.config_semantic_version",
                    "profile.capabilities",
                    "boot_id",
                    "presence",
                    "last_authenticated_at",
                    "virtual_ipv4",
                ],
            )?;
        }
        "DeviceAdded" | "DeviceOffline" => require(m, &["device"])?,
        "DevicesReset" => require(m, &["snapshot"])?,
        "DevicesEvent" => {
            positive(m, &["revision"])?;
            if has(m, "snapshot") {
                if number(m, "previous_revision") != 0 {
                    return Err(invalid("initial watch previous revision"));
                }
            } else if !has(m, "reset")
                && number(m, "previous_revision").checked_add(1) != Some(number(m, "revision"))
            {
                return Err(invalid("watch revision gap"));
            }
        }
        "GetDeviceDescriptor" => {
            if has(m, "conditional_revision") {
                positive(m, &["conditional_revision"])?;
            }
        }
        "DeviceDescriptorResult" => {
            if has(m, "unchanged") {
                positive(m, &["unchanged"])?;
            }
            if flag(m, "from_cache") {
                require(m, &["authenticated_at"])?;
            }
        }
        "RefreshDevicesResult" => {
            positive(m, &["revision"])?;
            if number(m, "verified") > number(m, "attempted")
                || ["attempted", "verified", "deferred"]
                    .iter()
                    .any(|f| number(m, f) > 512)
            {
                return Err(invalid("refresh counters"));
            }
        }
        "InvokeRpc" => require(m, &["request"])?,
        "SendRpcChunk" => require(m, &["chunk"])?,
        "EndRpc" => require(m, &["end"])?,
        "CancelRpc" => require(m, &["cancel"])?,
        "GrantRpcWindow" => require(m, &["window"])?,
        "CompleteData" if has(m, "stage") && number(m, "stage") == 1 => {
            return Err(invalid(
                "application completion must be accepted or processed",
            ))
        }
        "DataError" | "DescriptorError" => require(m, &["error"])?,
        "AuthLogoutResult" => {
            if flag(m, "local_closed") == has(m, "local_error") {
                return Err(invalid("local logout status/error mismatch"));
            }
            if matches!(number(m, "cloud_status"), 1 | 2) == has(m, "cloud_error") {
                return Err(invalid("cloud logout status/error mismatch"));
            }
        }
        "AuthStarted" => require(m, &["expires_at"])?,
        "Duration" => {
            let seconds = number(m, "seconds") as i64;
            let nanos = number(m, "nanos") as i32;
            let max = if matches!(parent, "RefreshDevices" | "AuthLogout") {
                30
            } else {
                300
            };
            if seconds < 0
                || seconds > max
                || !(0..1_000_000_000).contains(&nanos)
                || seconds == max && nanos > 0
                || seconds == 0 && nanos == 0 && parent != "ProtocolError"
            {
                return Err(invalid("invalid positive duration"));
            }
        }
        "Timestamp" => {
            let s = number(m, "seconds") as i64;
            let n = number(m, "nanos") as i32;
            if !(-62_135_596_800..=253_402_300_799).contains(&s) || !(0..1_000_000_000).contains(&n)
            {
                return Err(invalid("invalid WKT timestamp"));
            }
        }
        _ => {}
    }
    for (f, v) in m.fields() {
        match v {
            Value::Message(child) => semantic(child, name)?,
            Value::List(items) => {
                let mut unique = HashSet::new();
                for v in items {
                    match v {
                        Value::Message(child) => semantic(child, name)?,
                        Value::EnumNumber(n) if *n == 0 || !unique.insert(*n) => {
                            return Err(invalid("invalid repeated enum"));
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
        if let Value::Message(child) = v {
            if f.name() == "fragment" {
                let n = bytes(child, "protobuf_bytes").len();
                if matches!(parent, "Send" | "DataReceived") {
                    if number(child, "offset") != 0 || number(child, "total_size") != n as u64 {
                        return Err(invalid("local data must be complete"));
                    }
                } else if n > MAX_FRAGMENT {
                    return Err(Error::Limit("wire fragment"));
                }
            }
        }
    }
    Ok(())
}
fn check_mask(m: &DynamicMessage, field: &str, allowed: &[&str]) -> Result<()> {
    let Value::Message(mask) = value(m, field) else {
        return Err(invalid("missing mask"));
    };
    let paths = list(&mask, "paths");
    if paths.is_empty() {
        return Err(invalid("empty mask"));
    }
    let mut seen = HashSet::new();
    for p in paths {
        if let Value::String(s) = p {
            if !allowed.contains(&s.as_str()) || !seen.insert(s) {
                return Err(invalid("unknown or duplicate mask path"));
            }
        }
    }
    Ok(())
}
/// Validate size, declaration count, depth, symbols and complete import/type closure. No network fetch.
pub fn validate_descriptor_set(raw: &[u8]) -> Result<DescriptorPool> {
    let desc = descriptor_pool()
        .get_message_by_name("google.protobuf.FileDescriptorSet")
        .unwrap();
    validate_structure(
        raw,
        &desc,
        ScanLimits {
            max_bytes: MAX_DESCRIPTOR,
            max_depth: 100,
            ..Default::default()
        },
    )?;
    let set = prost_types::FileDescriptorSet::decode(raw)?;
    if set.file.is_empty() {
        return Err(invalid("empty descriptor set"));
    }
    fn count(
        messages: &[prost_types::DescriptorProto],
        depth: usize,
        total: &mut usize,
    ) -> Result<()> {
        if depth > 32 {
            return Err(Error::Limit("descriptor type depth"));
        }
        for m in messages {
            *total += 1 + m.enum_type.len();
            count(&m.nested_type, depth + 1, total)?;
        }
        Ok(())
    }
    let mut total = 0;
    let mut names = HashSet::new();
    for f in &set.file {
        if f.name.as_ref().is_none_or(|s| s.is_empty()) || !names.insert(f.name.clone()) {
            return Err(invalid("missing or duplicate descriptor file name"));
        }
        total += f.enum_type.len() + f.service.len();
        count(&f.message_type, 1, &mut total)?;
    }
    if total > 4096 {
        return Err(Error::Limit("descriptor declarations"));
    }
    DescriptorPool::from_file_descriptor_set(set)
        .map_err(|_| invalid("invalid descriptor symbols or dependency closure"))
}
