use cyberbus_protocol::{codec, pb};
use prost::Message;
// The original local event shape decodes the additive binding field unchanged.
#[derive(Clone, PartialEq, Message)]
struct LegacyEvent {
    #[prost(bytes = "vec", tag = "1")]
    peer_device_id: Vec<u8>,
    #[prost(oneof = "LegacyBody", tags = "10")]
    body: Option<LegacyBody>,
}
#[derive(Clone, PartialEq, prost::Oneof)]
enum LegacyBody {
    #[prost(message, tag = "10")]
    Request(pb::RpcRequest),
}
fn request() -> pb::RpcRequest {
    pb::RpcRequest {
        call_id: vec![1; 16],
        method_id: "cyberbus.example.v1.Echo/Unary".into(),
        request_type_url: "type.googleapis.com/cyberbus.example.v1.EchoRequest".into(),
        response_type_url: "type.googleapis.com/cyberbus.example.v1.EchoReply".into(),
        streaming: 1,
        semantic_version: "1.0.0".into(),
        timeout: Some(prost_types::Duration {
            seconds: 30,
            nanos: 0,
        }),
    }
}
#[test]
fn local_handler_binding_is_strict_and_additive_for_existing_consumers() {
    let event = pb::RpcEvent {
        peer_device_id: vec![2; 32],
        handler_id: vec![3; 16],
        body: Some(pb::rpc_event::Body::Request(request())),
    };
    let raw = codec::encode(&event).unwrap();
    let legacy = LegacyEvent::decode(raw.as_slice()).unwrap();
    assert_eq!(legacy.peer_device_id, event.peer_device_id);
    assert!(matches!(legacy.body,Some(LegacyBody::Request(r)) if r==request()));
    let mut malformed = event.clone();
    malformed.handler_id = vec![3; 15];
    assert!(codec::encode(&malformed).is_err());
    malformed.handler_id.clear();
    assert!(codec::encode(&malformed).is_err());
    let outgoing = pb::RpcEvent {
        peer_device_id: vec![2; 32],
        handler_id: vec![],
        body: Some(pb::rpc_event::Body::Window(pb::RpcWindow {
            call_id: vec![1; 16],
            direction: 1,
            byte_credit: 1,
            item_credit: 0,
        })),
    };
    codec::encode(&outgoing).unwrap();
    let pool = cyberbus_protocol::validation::descriptor_pool();
    assert!(pool
        .get_message_by_name("cyberbus.easytier.v1.RpcRequest")
        .unwrap()
        .get_field_by_name("handler_id")
        .is_none());
}
