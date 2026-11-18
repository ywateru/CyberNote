//! Application-owned protobuf contract. No address or port can be supplied over the wire.
use crate::{Error, Result};
use prost::Message;

pub const TYPE_URL: &str = "type.notes.cyberbus/notes.bridge.v1.Envelope";
pub const MAX_CHUNK: usize = 24 * 1024;

#[derive(Clone, PartialEq, Message)]
pub struct Envelope {
    #[prost(uint32, tag = "1")]
    pub version: u32,
    #[prost(bytes = "vec", tag = "2")]
    pub stream_id: Vec<u8>,
    /// Initiator's random lease generation. Echoed and bound for this stream's lifetime.
    #[prost(bytes = "vec", tag = "3")]
    pub generation: Vec<u8>,
    #[prost(uint64, tag = "4")]
    pub sequence: u64,
    #[prost(enumeration = "FrameKind", tag = "5")]
    pub kind: i32,
    #[prost(enumeration = "crate::Service", tag = "6")]
    pub service: i32,
    #[prost(bytes = "vec", tag = "7")]
    pub payload: Vec<u8>,
    #[prost(enumeration = "CloseCode", tag = "8")]
    pub close_code: i32,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum FrameKind {
    Unspecified = 0,
    Open = 1,
    OpenAck = 2,
    Chunk = 3,
    Close = 4,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum CloseCode {
    Unspecified = 0,
    Eof = 1,
    Cancelled = 2,
    Rejected = 3,
    Failed = 4,
}
impl Envelope {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.version != 1
            || self.stream_id.len() != 16
            || self.generation.len() != 16
            || self.payload.len() > MAX_CHUNK
            || crate::Service::try_from(self.service).is_err()
        {
            return Err(Error::Protocol);
        }
        match FrameKind::try_from(self.kind) {
            Ok(FrameKind::Open | FrameKind::OpenAck)
                if self.sequence == 0 && self.payload.is_empty() && self.close_code == 0 =>
            {
                Ok(())
            }
            Ok(FrameKind::Chunk)
                if self.sequence > 0 && !self.payload.is_empty() && self.close_code == 0 =>
            {
                Ok(())
            }
            Ok(FrameKind::Close)
                if self.sequence > 0
                    && self.payload.is_empty()
                    && matches!(
                        CloseCode::try_from(self.close_code),
                        Ok(CloseCode::Eof
                            | CloseCode::Cancelled
                            | CloseCode::Rejected
                            | CloseCode::Failed)
                    ) =>
            {
                Ok(())
            }
            _ => Err(Error::Protocol),
        }
    }
    pub(crate) fn decode_frame(fragment: &crate::pb::PayloadFragment) -> Result<Self> {
        if fragment.application_type_url != TYPE_URL
            || fragment.encoding != crate::pb::PayloadEncoding::ProtobufMessage as i32
            || fragment.offset != 0
            || fragment.total_size as usize != fragment.protobuf_bytes.len()
            || fragment.protobuf_bytes.len() > MAX_CHUNK + 128
        {
            return Err(Error::Protocol);
        }
        let frame =
            Self::decode(fragment.protobuf_bytes.as_slice()).map_err(|_| Error::Protocol)?;
        frame.validate()?;
        // Our own versioned protocol uses canonical prost encoding. Reject duplicate fields,
        // unknown fields and alternate encodings rather than accepting ambiguous controls.
        if frame.encode_to_vec() != fragment.protobuf_bytes {
            return Err(Error::Protocol);
        }
        Ok(frame)
    }
}

/// An explicit descriptor matching the prost declarations above. Avoids an additional protoc
/// invocation in this crate and registers only our application-owned schema with the SDK.
pub(crate) fn descriptor_set() -> Vec<u8> {
    use prost_types::{
        field_descriptor_proto::{Label, Type},
        DescriptorProto, EnumDescriptorProto, EnumValueDescriptorProto, FieldDescriptorProto,
        FileDescriptorProto, FileDescriptorSet,
    };
    let enumeration = |name: &str, values: &[(&str, i32)]| EnumDescriptorProto {
        name: Some(name.into()),
        value: values
            .iter()
            .map(|(n, v)| EnumValueDescriptorProto {
                name: Some((*n).into()),
                number: Some(*v),
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    };
    let fields = [
        ("version", 1, Type::Uint32, None),
        ("stream_id", 2, Type::Bytes, None),
        ("generation", 3, Type::Bytes, None),
        ("sequence", 4, Type::Uint64, None),
        ("kind", 5, Type::Enum, Some(".notes.bridge.v1.FrameKind")),
        ("service", 6, Type::Enum, Some(".notes.bridge.v1.Service")),
        ("payload", 7, Type::Bytes, None),
        (
            "close_code",
            8,
            Type::Enum,
            Some(".notes.bridge.v1.CloseCode"),
        ),
    ];
    FileDescriptorSet {
        file: vec![FileDescriptorProto {
            name: Some("notes/bridge/v1/envelope.proto".into()),
            package: Some("notes.bridge.v1".into()),
            syntax: Some("proto3".into()),
            message_type: vec![DescriptorProto {
                name: Some("Envelope".into()),
                field: fields
                    .into_iter()
                    .map(|(name, number, kind, ty)| FieldDescriptorProto {
                        name: Some(name.into()),
                        number: Some(number),
                        label: Some(Label::Optional as i32),
                        r#type: Some(kind as i32),
                        type_name: ty.map(str::to_owned),
                        ..Default::default()
                    })
                    .collect(),
                ..Default::default()
            }],
            enum_type: vec![
                enumeration(
                    "FrameKind",
                    &[
                        ("FRAME_UNSPECIFIED", 0),
                        ("OPEN", 1),
                        ("OPEN_ACK", 2),
                        ("CHUNK", 3),
                        ("CLOSE", 4),
                    ],
                ),
                enumeration(
                    "Service",
                    &[("SERVICE_UNSPECIFIED", 0), ("BOOTSTRAP", 1), ("SYNC", 2)],
                ),
                enumeration(
                    "CloseCode",
                    &[
                        ("CLOSE_UNSPECIFIED", 0),
                        ("EOF", 1),
                        ("CANCELLED", 2),
                        ("REJECTED", 3),
                        ("FAILED", 4),
                    ],
                ),
            ],
            ..Default::default()
        }],
    }
    .encode_to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sdk_descriptor_validates_custom_envelope_at_chunk_limit() {
        let pool = prost_reflect::DescriptorPool::decode(descriptor_set().as_slice()).unwrap();
        let descriptor = pool
            .get_message_by_name("notes.bridge.v1.Envelope")
            .unwrap();
        let frame = Envelope {
            version: 1,
            stream_id: vec![1; 16],
            generation: vec![2; 16],
            sequence: 1,
            kind: FrameKind::Chunk as i32,
            service: crate::Service::Sync as i32,
            payload: vec![8; MAX_CHUNK],
            close_code: 0,
        };
        let bytes = frame.encode_to_vec();
        cyberbus_protocol::reassembly::validate_application(
            TYPE_URL,
            crate::pb::PayloadEncoding::ProtobufMessage,
            &bytes,
            Some(&descriptor),
            false,
        )
        .unwrap();
        let mut fragment = crate::pb::PayloadFragment {
            application_type_url: TYPE_URL.into(),
            encoding: crate::pb::PayloadEncoding::ProtobufMessage as i32,
            total_size: bytes.len() as u32,
            offset: 0,
            protobuf_bytes: bytes,
        };
        assert_eq!(Envelope::decode_frame(&fragment).unwrap(), frame);
        fragment.protobuf_bytes.extend([8, 1]);
        fragment.total_size = fragment.protobuf_bytes.len() as u32;
        assert!(Envelope::decode_frame(&fragment).is_err());
        fragment.offset = 1;
        assert!(Envelope::decode_frame(&fragment).is_err());
    }
}
