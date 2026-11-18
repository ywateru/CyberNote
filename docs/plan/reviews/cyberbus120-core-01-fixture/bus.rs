// Included only into the committed snapshot's existing bus test module.
#[tokio::test]
async fn review_sdk_eof_drains_adapter_owned_tasks() {
    let bus = Bus::new(config(), Box::<cyberbus_auth::MemoryStore>::default(), StoreMode::CreateNew).await.unwrap();
    let result = bus.inner.client.execute(pb::SdkCommand {
        command_id: random_id().to_vec(), body:Some(C::SdkClose(pb::SdkClose{})),
    }).await;
    assert!(matches!(result.body, Some(pb::sdk_result::Body::SdkClosed(_))));
    tokio::time::timeout(Duration::from_secs(2),bus.inner.owner_done.cancelled()).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;
    let outstanding = bus.inner.tasks.len();
    let stopped = bus.inner.stop.is_cancelled();
    assert!(bus.snapshot().closed);
    bus.close().await.unwrap(); // Always clean up, including when the assertions below fail.
    assert!(stopped && outstanding == 0, "EOF left stop={stopped}, {outstanding} adapter-owned tasks active");
}

#[tokio::test]
async fn review_real_sdk_schema_registration_and_offline_send_gate() {
    use prost::Message;
    let bus = Bus::new(config(), Box::<cyberbus_auth::MemoryStore>::default(), StoreMode::CreateNew).await.unwrap();
    let frame = Envelope {version:1,stream_id:vec![1;16],generation:vec![2;16],sequence:1,
        kind:FrameKind::Chunk as i32,service:Service::Sync as i32,payload:vec![8;MAX_CHUNK],close_code:0};
    let bytes=frame.encode_to_vec();
    let send = |bytes:Vec<u8>| C::Send(pb::Send {peer_device_id:vec![4;32],message:Some(pb::DataMessage {
        message_id:random_id().to_vec(),requested_ack:pb::AckStage::Processed as i32,
        timeout:Some(prost_types::Duration{seconds:1,nanos:0}),
        fragment:Some(pb::PayloadFragment {application_type_url:TYPE_URL.into(),encoding:pb::PayloadEncoding::ProtobufMessage as i32,
        total_size:bytes.len() as u32,offset:0,protobuf_bytes:bytes}), ..Default::default()
    })});
    let result=bus.internal(send(bytes)).await;
    let malformed=bus.internal(send(vec![255,255,255])).await;
    // Offline Send gates before payload dispatch. Do not claim this tests authenticated Data.
    assert!(matches!(result,Err(Error::Sdk(code)) if code==pb::ErrorCode::NetworkNotReady as i32));
    assert!(matches!(malformed,Err(Error::Sdk(code)) if code==pb::ErrorCode::NetworkNotReady as i32));
    let unknown=bus.internal(C::SubscribeData(pb::SubscribeData {
        subscription_id:random_id().to_vec(),type_urls:vec!["type.notes.cyberbus/notes.unknown.Message".into()]
    })).await;
    assert!(matches!(unknown,Err(Error::Sdk(code)) if code==pb::ErrorCode::TypeMismatch as i32));
    bus.close().await.unwrap();
}

#[tokio::test]
async fn review_watch_recovers_after_revocation_without_account_or_network() {
    let bus = Bus::new(config(), Box::<cyberbus_auth::MemoryStore>::default(), StoreMode::CreateNew).await.unwrap();
    let mut updates=bus.watch();
    tokio::time::timeout(Duration::from_secs(1),async {
        while !updates.borrow_and_update().directory_valid { updates.changed().await.unwrap(); }
    }).await.unwrap();
    // Public NetworkStop revokes even when already offline; SDK's existing watch remains alive.
    bus.cmd(C::NetworkStop(pb::NetworkStop{})).await.unwrap();
    // Generate an ordinary revision through the real SDK, without authentication or networking.
    bus.cmd(C::UpdatePublicProfile(pb::UpdatePublicProfile {
        profile:Some(pb::PublicProfile {device_name:"review watch recovery".into(),
            public_config:Some(prost_types::Any {type_url:"type.notes.test/notes.test.Profile".into(),value:vec![8,1]}),
            config_semantic_version:"1.0.0".into(),..Default::default()}),
        expected_revision:bus.snapshot().devices.devices.iter().filter_map(|d|d.profile.as_ref()).map(|p|p.config_revision).max().unwrap_or(0),
        update_mask:Some(prost_types::FieldMask{paths:vec!["device_name".into(),"public_config".into(),"config_semantic_version".into()]}),..Default::default()
    })).await.unwrap();
    let recovered=tokio::time::timeout(Duration::from_millis(350),async {
        while !updates.borrow_and_update().directory_valid { updates.changed().await.unwrap(); }
    }).await.is_ok();
    bus.close().await.unwrap();
    assert!(recovered,"valid SDK watch delta after NetworkStop does not restore directory; no resubscription/reset requested");
}
