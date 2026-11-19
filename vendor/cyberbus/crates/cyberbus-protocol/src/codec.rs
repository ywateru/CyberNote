//! All decode paths scan the original bytes before prost can discard ambiguity/unknown fields.
use crate::{pb, validation, Result};
use prost::{Message, Name};
pub fn decode<M: Message + Name + Default>(bytes: &[u8]) -> Result<M> {
    validation::validate(bytes, &M::full_name())?;
    Ok(M::decode(bytes)?)
}
pub fn encode<M: Message + Name>(message: &M) -> Result<Vec<u8>> {
    let bytes = message.encode_to_vec();
    validation::validate(&bytes, &M::full_name())?;
    Ok(bytes)
}
pub fn decode_command(bytes: &[u8]) -> Result<pb::SdkCommand> {
    decode(bytes)
}
pub fn decode_result(bytes: &[u8]) -> Result<pb::SdkResult> {
    decode(bytes)
}
pub fn decode_event(bytes: &[u8]) -> Result<pb::SdkEvent> {
    decode(bytes)
}
pub fn decode_wire(bytes: &[u8]) -> Result<pb::WireEnvelope> {
    decode(bytes)
}
