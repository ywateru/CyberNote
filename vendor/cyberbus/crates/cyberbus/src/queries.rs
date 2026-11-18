//! One adapter-wide namespace for query IDs. Four accepted queries reserve at most
//! 24 MiB of terminal storage until the single consumer actually dequeues the result.
use crate::pb;
pub(crate) const SLOTS: usize = 4;
pub(crate) const TERMINAL_BYTES: usize = 24 * 1024 * 1024;
pub(crate) fn command_id(command: &pb::SdkCommand) -> Option<&[u8]> {
    use pb::sdk_command::Body as C;
    match command.body.as_ref()? {
        C::GetDevices(c) => Some(&c.query_id),
        C::RefreshDevices(c) => Some(&c.query_id),
        C::GetDeviceDescriptor(c) => Some(&c.query_id),
        C::GetBlockedDevices(c) => Some(&c.query_id),
        C::PullDescriptor(c) => Some(&c.query_id),
        _ => None,
    }
}
pub(crate) fn event_id(event: &pb::SdkEvent) -> Option<&[u8]> {
    use pb::sdk_event::Body as E;
    match event.body.as_ref()? {
        E::DevicesQuery(c) => Some(&c.query_id),
        E::RefreshDevices(c) => Some(&c.query_id),
        E::DeviceDescriptor(c) => Some(&c.query_id),
        E::BlockedDevices(c) => Some(&c.query_id),
        E::Descriptor(c) => Some(&c.query_id),
        _ => None,
    }
}
