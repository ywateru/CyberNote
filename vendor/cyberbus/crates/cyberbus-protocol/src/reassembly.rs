//! One logical item, with allocation reserved only after checking its declared size.
//! The runtime reserves its aggregate budget/concurrency slot before constructing an assembler.
use crate::{
    error::invalid, pb, validation, Error, Result, MAX_DESCRIPTOR, MAX_FRAGMENT, MAX_MESSAGE,
};
use prost::Message;
use prost_reflect::MessageDescriptor;
use sha2::{Digest, Sha256};

pub struct FragmentAssembler {
    type_url: String,
    encoding: i32,
    total: usize,
    bytes: Vec<u8>,
    complete: bool,
}
impl FragmentAssembler {
    pub fn new(first: &pb::PayloadFragment, limit: usize) -> Result<Self> {
        if limit == 0 || limit > MAX_MESSAGE || first.total_size as usize > limit {
            return Err(Error::Limit("logical item reservation"));
        }
        validation::validate_type_url(&first.application_type_url)?;
        match pb::PayloadEncoding::try_from(first.encoding) {
            Ok(pb::PayloadEncoding::ProtobufMessage | pb::PayloadEncoding::ProtobufAny) => {}
            _ => return Err(invalid("payload encoding")),
        }
        if first.offset != 0 {
            return Err(invalid("initial fragment offset"));
        }
        Ok(Self {
            type_url: first.application_type_url.clone(),
            encoding: first.encoding,
            total: first.total_size as usize,
            bytes: Vec::with_capacity(first.total_size as usize),
            complete: false,
        })
    }
    /// Returns true only once the exact complete item is present. Further pushes are errors.
    pub fn push(&mut self, fragment: &pb::PayloadFragment) -> Result<bool> {
        let n = fragment.protobuf_bytes.len();
        if self.complete
            || fragment.application_type_url != self.type_url
            || fragment.encoding != self.encoding
            || fragment.total_size as usize != self.total
            || fragment.offset as usize != self.bytes.len()
        {
            return Err(invalid("inconsistent or noncontiguous fragment"));
        }
        if n > MAX_FRAGMENT || n > self.total - self.bytes.len() || n == 0 && self.total != 0 {
            return Err(Error::Limit("fragment size"));
        }
        self.bytes.extend_from_slice(&fragment.protobuf_bytes);
        self.complete = self.bytes.len() == self.total;
        Ok(self.complete)
    }
    pub fn finish(self) -> Result<Vec<u8>> {
        if !self.complete {
            return Err(invalid("incomplete logical item"));
        }
        Ok(self.bytes)
    }
}
/// Enforces all stable data headers in addition to fragment continuity.
pub struct DataAssembler {
    header: pb::DataMessage,
    fragments: FragmentAssembler,
}
impl DataAssembler {
    pub fn new(first: &pb::DataMessage, limit: usize) -> Result<Self> {
        crate::codec::encode(first)?;
        let fragment = first
            .fragment
            .as_ref()
            .ok_or_else(|| invalid("missing data fragment"))?;
        let mut header = first.clone();
        header.fragment = None;
        Ok(Self {
            header,
            fragments: FragmentAssembler::new(fragment, limit)?,
        })
    }
    pub fn push(&mut self, message: &pb::DataMessage) -> Result<bool> {
        let mut header = message.clone();
        let fragment = header
            .fragment
            .take()
            .ok_or_else(|| invalid("missing data fragment"))?;
        if header != self.header {
            return Err(invalid("data fragment headers changed"));
        }
        self.fragments.push(&fragment)
    }
    pub fn finish(self) -> Result<pb::DataMessage> {
        let mut message = self.header;
        let type_url = self.fragments.type_url.clone();
        let encoding = self.fragments.encoding;
        let bytes = self.fragments.finish()?;
        message.fragment = Some(pb::PayloadFragment {
            application_type_url: type_url,
            encoding,
            total_size: bytes.len() as u32,
            offset: 0,
            protobuf_bytes: bytes,
        });
        Ok(message)
    }
}
/// Fragment a complete local message without changing IDs, timeout, ACK or binary contents.
pub fn fragment_data(
    message: &pb::DataMessage,
    max_fragment: usize,
) -> Result<Vec<pb::DataMessage>> {
    if max_fragment == 0 || max_fragment > MAX_FRAGMENT {
        return Err(Error::Limit("fragment size"));
    }
    let fragment = message
        .fragment
        .as_ref()
        .ok_or_else(|| invalid("missing data fragment"))?;
    if fragment.offset != 0
        || fragment.total_size as usize != fragment.protobuf_bytes.len()
        || fragment.total_size as usize > MAX_MESSAGE
    {
        return Err(invalid("incomplete local data"));
    }
    // Validate complete local form through the same local boundary used by Send.
    crate::codec::encode(&pb::Send {
        peer_device_id: vec![1; 32],
        message: Some(message.clone()),
    })?;
    let mut output = Vec::new();
    if fragment.protobuf_bytes.is_empty() {
        output.push(message.clone());
        return Ok(output);
    }
    for (i, bytes) in fragment.protobuf_bytes.chunks(max_fragment).enumerate() {
        let mut m = message.clone();
        let f = m.fragment.as_mut().unwrap();
        f.offset = (i * max_fragment) as u32;
        f.protobuf_bytes = bytes.to_vec();
        output.push(m);
    }
    Ok(output)
}
/// Validate a complete application message. A descriptor is mandatory unless the host explicitly
/// opts into opaque forwarding. Type registration/approval is owned by the runtime, never a URL fetch.
pub fn validate_application(
    type_url: &str,
    encoding: pb::PayloadEncoding,
    raw: &[u8],
    descriptor: Option<&MessageDescriptor>,
    allow_opaque: bool,
) -> Result<()> {
    validation::validate_type_url(type_url)?;
    if raw.len() > MAX_MESSAGE {
        return Err(Error::Limit("logical item"));
    }
    let any;
    let payload = match encoding {
        pb::PayloadEncoding::ProtobufMessage => raw,
        pb::PayloadEncoding::ProtobufAny => {
            validation::validate(raw, "google.protobuf.Any")?;
            any = prost_types::Any::decode(raw)?;
            if any.type_url != type_url {
                return Err(invalid("Any type URL mismatch"));
            }
            any.value.as_slice()
        }
        _ => return Err(invalid("unsupported payload encoding")),
    };
    if let Some(desc) = descriptor {
        if type_url.rsplit('/').next() != Some(desc.full_name()) {
            return Err(invalid("registered type mismatch"));
        }
        validation::validate_structure(
            payload,
            desc,
            validation::ScanLimits {
                max_bytes: MAX_MESSAGE,
                ..Default::default()
            },
        )
    } else if allow_opaque {
        validation::validate_opaque(payload)
    } else {
        Err(invalid("application type not registered"))
    }
}
pub fn finish_descriptor(raw: &[u8], digest: &[u8; 32]) -> Result<prost_reflect::DescriptorPool> {
    if raw.len() > MAX_DESCRIPTOR {
        return Err(Error::Limit("descriptor"));
    }
    if Sha256::digest(raw).as_slice() != digest {
        return Err(invalid("descriptor digest mismatch"));
    }
    validation::validate_descriptor_set(raw)
}
