use cyberbus_protocol::{
    codec, example, framing, noise, pb, reassembly, validation, Error, MAX_RECORD_BODY,
};
use prost::Message;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

fn duration() -> Option<prost_types::Duration> {
    Some(prost_types::Duration {
        seconds: 30,
        nanos: 0,
    })
}
fn data(raw: Vec<u8>) -> pb::DataMessage {
    pb::DataMessage {
        message_id: vec![9; 16],
        in_reply_to: vec![],
        requested_ack: pb::AckStage::Processed as i32,
        timeout: duration(),
        fragment: Some(pb::PayloadFragment {
            application_type_url: "type.googleapis.com/cyberbus.example.v1.EchoRequest".into(),
            encoding: pb::PayloadEncoding::ProtobufMessage as i32,
            total_size: raw.len() as u32,
            offset: 0,
            protobuf_bytes: raw,
        }),
    }
}
fn varint(mut n: u64) -> Vec<u8> {
    let mut v = vec![];
    while n >= 128 {
        v.push((n as u8) | 128);
        n >>= 7;
    }
    v.push(n as u8);
    v
}
fn field(tag: u32, raw: &[u8]) -> Vec<u8> {
    let mut v = varint(u64::from(tag) * 8 + 2);
    v.extend(varint(raw.len() as u64));
    v.extend(raw);
    v
}
fn command() -> pb::SdkCommand {
    pb::SdkCommand {
        command_id: vec![1; 16],
        body: Some(pb::sdk_command::Body::GetDevices(pb::GetDevices {
            query_id: vec![2; 16],
        })),
    }
}
#[test]
fn generated_schema_local_and_sample_roundtrips() {
    let cmd = command();
    let raw = codec::encode(&cmd).unwrap();
    assert_eq!(codec::decode_command(&raw).unwrap(), cmd);
    let app = example::EchoRequest {
        text: "hello protobuf".into(),
    };
    let raw = codec::encode(&app).unwrap();
    assert_eq!(codec::decode::<example::EchoRequest>(&raw).unwrap(), app);
    let result = pb::SdkResult {
        command_id: vec![1; 16],
        body: Some(pb::sdk_result::Body::Ok(())),
    };
    assert_eq!(
        codec::decode_result(&codec::encode(&result).unwrap()).unwrap(),
        result
    );
    assert!(validation::descriptor_pool()
        .get_service_by_name("cyberbus.easytier.v1.cyberbusSdkControl")
        .is_some());
}
#[test]
fn rejects_duplicates_conflicting_or_missing_body_and_nested_singular() {
    let raw = command().encode_to_vec();
    let mut dup = raw.clone();
    dup.extend(field(1, &[1; 16]));
    assert!(codec::decode_command(&dup).is_err());
    let mut dup = raw.clone();
    dup.extend(field(33, &[]));
    assert!(codec::decode_command(&dup).is_err());
    let mut dup = raw.clone();
    dup.extend(field(
        34,
        &pb::GetDevices {
            query_id: vec![3; 16],
        }
        .encode_to_vec(),
    ));
    assert!(codec::decode_command(&dup).is_err());
    let mut nested = field(1, &[2; 16]);
    nested.extend(field(1, &[3; 16]));
    let mut raw = field(1, &[1; 16]);
    raw.extend(field(34, &nested));
    assert!(codec::decode_command(&raw).is_err());
    let mut raw = field(1, &[1; 16]);
    raw.extend(field(500, &[]));
    assert!(codec::decode_command(&raw).is_err());
    assert!(codec::decode_command(&field(1, &[1; 16])).is_err());
}
#[test]
fn protocol_bodies_and_results_remain_required() {
    for (name, oneof) in [
        ("PreSessionRecord", "body"),
        ("WireEnvelope", "body"),
        ("SdkCommand", "body"),
        ("SdkResult", "body"),
        ("SdkEvent", "body"),
        ("DevicesEvent", "body"),
        ("RpcEvent", "body"),
        ("DevicesQueryResult", "result"),
        ("DeviceDescriptorResult", "result"),
        ("CompleteData", "result"),
        ("DataStatus", "result"),
        ("DescriptorResult", "result"),
        ("BlockedDevicesQueryResult", "result"),
    ] {
        let full_name = format!("cyberbus.easytier.v1.{name}");
        assert!(matches!(
            validation::validate(&[], &full_name),
            Err(Error::Invalid(message)) if message == format!("missing {full_name}.{oneof}")
        ));
    }
    let event = pb::SdkEvent {
        runtime_id: vec![1; 16],
        event_sequence: 1,
        body: Some(pb::sdk_event::Body::DevicesQuery(pb::DevicesQueryResult {
            query_id: vec![2; 16],
            result: None,
        })),
    };
    assert!(matches!(
        codec::decode_event(&event.encode_to_vec()),
        Err(Error::Invalid(message))
            if message == "missing cyberbus.easytier.v1.DevicesQueryResult.result"
    ));
}
#[test]
fn unknown_ordinary_fields_are_allowed_but_count_towards_budget() {
    let mut raw = command().encode_to_vec();
    raw.extend(field(500, b"allowed"));
    assert!(codec::decode_command(&raw).is_ok());
    let error = pb::SdkResult {
        command_id: vec![1; 16],
        body: Some(pb::sdk_result::Body::Error(pb::ProtocolError {
            code: pb::ErrorCode::Unavailable as i32,
            ..Default::default()
        })),
    };
    let mut raw = error.encode_to_vec();
    raw.extend(field(500, &vec![0; 65536]));
    assert!(codec::decode_result(&raw).is_err());
}
#[test]
fn rejects_malformed_utf8_varint_groups_wrong_wire_and_enum() {
    for raw in [
        vec![0],
        vec![11, 12],
        vec![128; 11],
        vec![10, 255],
        vec![8, 1],
        vec![10, 32, 1],
    ] {
        assert!(codec::decode_command(&raw).is_err());
    }
    let invalid_utf8 = field(1, &[0xff]);
    assert!(validation::validate(&invalid_utf8, "cyberbus.example.v1.EchoRequest").is_err());
    for code in [0, 999] {
        let error = pb::ProtocolError {
            code,
            ..Default::default()
        };
        assert!(codec::encode(&error).is_err());
    }
    let mut m = data(vec![]);
    m.requested_ack = 999;
    assert!(codec::encode(&m).is_err());
    let mut raw = vec![8];
    raw.extend(varint(u64::from(u32::MAX) + 1));
    assert!(validation::validate(&raw, "cyberbus.easytier.v1.ProtocolHello").is_err());
}
#[test]
fn validates_ids_limits_durations_and_strings() {
    let mut c = command();
    c.command_id.pop();
    assert!(codec::encode(&c).is_err());
    let mut m = data(vec![]);
    m.timeout = None;
    assert!(codec::encode(&m).is_err());
    for (seconds, nanos) in [
        (0, 0),
        (-1, 0),
        (301, 0),
        (30, -1),
        (300, 1),
        (1, 1_000_000_000),
    ] {
        m.timeout = Some(prost_types::Duration { seconds, nanos });
        assert!(codec::encode(&m).is_err());
    }
    m.timeout = duration();
    assert!(codec::encode(&m).is_ok());
    let profile = pb::PublicProfile {
        device_name: "bad\0name".into(),
        config_semantic_version: "1.0.0".into(),
        config_revision: 1,
        ..Default::default()
    };
    assert!(codec::encode(&profile).is_err());
    for url in [
        "https://example.com/",
        "NoPrefix",
        "type.googleapis.com/bad-name.Type",
    ] {
        assert!(validation::validate_type_url(url).is_err());
    }
    let mut limits = noise::default_receive_limits();
    limits.max_data_in_flight = 0;
    assert!(codec::encode(&limits).is_err());
    let subscription = pb::SubscribeData {
        subscription_id: vec![1; 16],
        type_urls: vec!["type.googleapis.com/a.B".into(); 65],
    };
    assert!(codec::encode(&subscription).is_err());
}
fn self_device() -> pb::DeviceSnapshot {
    let public = noise::static_public_key(&[1; 32]).unwrap();
    pb::DeviceSnapshot {
        device_id: noise::device_id(&public).to_vec(),
        installation_public_key: public.to_vec(),
        boot_id: vec![1; 16],
        is_local: true,
        presence: pb::DevicePresence::Offline as i32,
        ..Default::default()
    }
}
#[test]
fn snapshot_self_identity_order_and_local_limits() {
    let snapshot = pb::DevicesSnapshot {
        runtime_id: vec![1; 16],
        revision: 1,
        devices: vec![self_device()],
    };
    assert!(codec::encode(&snapshot).is_ok());
    let mut bad = snapshot.clone();
    bad.devices.clear();
    assert!(codec::encode(&bad).is_err());
    let mut bad = snapshot.clone();
    bad.devices.push(self_device());
    assert!(codec::encode(&bad).is_err());
    let mut bad = snapshot.clone();
    bad.devices[0].device_id[0] ^= 1;
    assert!(codec::encode(&bad).is_err());
    let mut bad = snapshot;
    bad.devices[0].is_local = false;
    assert!(codec::encode(&bad).is_err());
}
#[test]
fn metadata_unknown_bytes_and_public_config_cannot_bypass_size() {
    let profile = pb::PublicProfile {
        device_name: "test".into(),
        config_semantic_version: "1.0.0".into(),
        config_revision: 1,
        ..Default::default()
    };
    let mut raw = pb::PeerMetadata {
        profile: Some(profile.clone()),
    }
    .encode_to_vec();
    raw.extend(field(500, &vec![0; 16384]));
    assert!(codec::decode::<pb::PeerMetadata>(&raw).is_err());
    let mut profile = profile;
    profile.public_config = Some(prost_types::Any {
        type_url: "type.googleapis.com/a.B".into(),
        value: vec![0; 8192],
    });
    assert!(codec::encode(&profile).is_err());
}
#[test]
fn bounded_depth_field_count_and_descriptor_closure() {
    let desc = validation::descriptor_pool()
        .get_message_by_name("cyberbus.easytier.v1.SdkCommand")
        .unwrap();
    let limits = validation::ScanLimits {
        max_depth: 0,
        ..Default::default()
    };
    assert!(validation::validate_structure(&command().encode_to_vec(), &desc, limits).is_err());
    let limits = validation::ScanLimits {
        max_fields: 1,
        ..Default::default()
    };
    assert!(validation::validate_structure(&command().encode_to_vec(), &desc, limits).is_err());
    let descset = prost_types::FileDescriptorSet {
        file: vec![prost_types::FileDescriptorProto {
            name: Some("a.proto".into()),
            dependency: vec!["missing.proto".into()],
            ..Default::default()
        }],
    };
    assert!(validation::validate_descriptor_set(&descset.encode_to_vec()).is_err());
    let descset = prost_types::FileDescriptorSet {
        file: vec![
            prost_types::FileDescriptorProto {
                name: Some("a.proto".into()),
                ..Default::default()
            };
            129
        ],
    };
    assert!(validation::validate_descriptor_set(&descset.encode_to_vec()).is_err());
    assert!(validation::validate_descriptor_set(cyberbus_protocol::FILE_DESCRIPTOR_SET).is_ok());
}
#[test]
fn megabyte_fragmentation_enforces_complete_headers_and_continuity() {
    let original = data(vec![1; 1024 * 1024]);
    let fragments = reassembly::fragment_data(&original, 16384).unwrap();
    assert_eq!(fragments.len(), 64);
    let mut state = reassembly::DataAssembler::new(&fragments[0], 1024 * 1024).unwrap();
    for (i, f) in fragments.iter().enumerate() {
        assert_eq!(state.push(f).unwrap(), i == 63);
    }
    assert_eq!(state.finish().unwrap(), original);
    let mut state = reassembly::DataAssembler::new(&fragments[0], 1024 * 1024).unwrap();
    assert!(state.push(&fragments[1]).is_err());
    let mut state = reassembly::DataAssembler::new(&fragments[0], 1024 * 1024).unwrap();
    state.push(&fragments[0]).unwrap();
    let mut bad = fragments[1].clone();
    bad.requested_ack = 1;
    assert!(state.push(&bad).is_err());
    let empty = data(vec![]);
    let mut state = reassembly::DataAssembler::new(&empty, 1024).unwrap();
    assert!(state.push(&empty).unwrap());
    assert_eq!(state.finish().unwrap(), empty);
    assert!(reassembly::DataAssembler::new(&fragments[0], 1024).is_err());
}
#[test]
fn application_message_any_opaque_and_descriptor_digest() {
    let url = "type.googleapis.com/cyberbus.example.v1.EchoRequest";
    let raw = example::EchoRequest {
        text: "hello".into(),
    }
    .encode_to_vec();
    let desc = validation::descriptor_pool()
        .get_message_by_name("cyberbus.example.v1.EchoRequest")
        .unwrap();
    assert!(reassembly::validate_application(
        url,
        pb::PayloadEncoding::ProtobufMessage,
        &raw,
        Some(&desc),
        false
    )
    .is_ok());
    assert!(reassembly::validate_application(
        url,
        pb::PayloadEncoding::ProtobufMessage,
        &raw,
        None,
        false
    )
    .is_err());
    assert!(reassembly::validate_application(
        url,
        pb::PayloadEncoding::ProtobufMessage,
        b"{\"json\":1}",
        None,
        true
    )
    .is_err());
    let any = prost_types::Any {
        type_url: url.into(),
        value: raw,
    }
    .encode_to_vec();
    assert!(reassembly::validate_application(
        url,
        pb::PayloadEncoding::ProtobufAny,
        &any,
        Some(&desc),
        false
    )
    .is_ok());
    assert!(reassembly::validate_application(
        "type.googleapis.com/a.B",
        pb::PayloadEncoding::ProtobufAny,
        &any,
        None,
        true
    )
    .is_err());
    let digest: [u8; 32] = Sha256::digest(cyberbus_protocol::FILE_DESCRIPTOR_SET).into();
    assert!(reassembly::finish_descriptor(cyberbus_protocol::FILE_DESCRIPTOR_SET, &digest).is_ok());
    assert!(
        reassembly::finish_descriptor(cyberbus_protocol::FILE_DESCRIPTOR_SET, &[0; 32]).is_err()
    );
}
#[test]
fn registered_application_oneofs_are_optional_but_cannot_repeat() {
    use prost_types::{field_descriptor_proto::Type, DescriptorProto, FieldDescriptorProto};
    let set = prost_types::FileDescriptorSet {
        file: vec![prost_types::FileDescriptorProto {
            name: Some("choice.proto".into()),
            package: Some("application".into()),
            syntax: Some("proto3".into()),
            message_type: vec![DescriptorProto {
                name: Some("Choice".into()),
                oneof_decl: vec![prost_types::OneofDescriptorProto {
                    name: Some("value".into()),
                    ..Default::default()
                }],
                field: [
                    ("text", Type::String, Some(0)),
                    ("bytes", Type::Bytes, Some(0)),
                    ("note", Type::String, None),
                    ("child", Type::Message, None),
                ]
                .into_iter()
                .enumerate()
                .map(|(i, (name, kind, oneof_index))| FieldDescriptorProto {
                    name: Some(name.into()),
                    number: Some(i as i32 + 1),
                    label: Some(prost_types::field_descriptor_proto::Label::Optional as i32),
                    r#type: Some(kind as i32),
                    type_name: (kind == Type::Message).then(|| ".application.Choice".into()),
                    oneof_index,
                    ..Default::default()
                })
                .collect(),
                ..Default::default()
            }],
            ..Default::default()
        }],
    };
    let pool = validation::validate_descriptor_set(&set.encode_to_vec()).unwrap();
    let desc = pool.get_message_by_name("application.Choice").unwrap();
    let url = "type.googleapis.com/application.Choice";
    for encoding in [
        pb::PayloadEncoding::ProtobufMessage,
        pb::PayloadEncoding::ProtobufAny,
    ] {
        let encode = |value: Vec<u8>| match encoding {
            pb::PayloadEncoding::ProtobufAny => prost_types::Any {
                type_url: url.into(),
                value,
            }
            .encode_to_vec(),
            _ => value,
        };
        // Empty, unrelated field, nested empty choice, and an explicitly selected member.
        for raw in [vec![], field(3, b"note"), field(4, &[]), field(1, b"text")] {
            prost_reflect::DynamicMessage::decode(desc.clone(), raw.as_slice()).unwrap();
            reassembly::validate_application(url, encoding, &encode(raw), Some(&desc), false)
                .unwrap();
        }
        for tag in [1, 2] {
            let mut duplicate = field(1, b"first");
            duplicate.extend(field(tag, b"second"));
            for raw in [duplicate.clone(), field(4, &duplicate)] {
                assert!(matches!(
                    reassembly::validate_application(url, encoding, &encode(raw), Some(&desc), false),
                    Err(Error::Invalid(message))
                        if message.contains("duplicate singular") || message == "conflicting oneof fields"
                ));
            }
        }
    }
}
#[tokio::test]
async fn framing_handles_partial_and_coalesced_records_and_boundaries() {
    let (mut writer, mut reader) = tokio::io::duplex(128);
    let sender = tokio::spawn(async move {
        for b in [0, 0, 0, 3, 1, 2, 3, 0, 0, 0, 1, 4] {
            writer.write_all(&[b]).await.unwrap();
        }
    });
    assert_eq!(
        framing::read_record(&mut reader).await.unwrap(),
        Some(vec![1, 2, 3])
    );
    assert_eq!(
        framing::read_record(&mut reader).await.unwrap(),
        Some(vec![4])
    );
    assert!(framing::read_record(&mut reader).await.unwrap().is_none());
    sender.await.unwrap();
    let mut bytes = vec![];
    assert!(framing::write_record(&mut bytes, &vec![1; MAX_RECORD_BODY])
        .await
        .is_ok());
    assert_eq!(bytes.len(), 65536);
    assert!(
        framing::write_record(&mut bytes, &vec![1; MAX_RECORD_BODY + 1])
            .await
            .is_err()
    );
    assert!(framing::write_record(&mut bytes, &[]).await.is_err());
    for raw in [
        vec![0, 0, 0, 0],
        vec![0, 1, 0, 0],
        vec![0, 0],
        vec![0, 0, 0, 2, 1],
    ] {
        assert!(framing::read_record(&mut raw.as_slice()).await.is_err());
    }
}
#[tokio::test(start_paused = true)]
async fn framing_started_header_and_body_require_progress() {
    for partial in [&[0][..], &[0, 0, 0, 2, 1][..]] {
        let (mut writer, mut reader) = tokio::io::duplex(128);
        writer.write_all(partial).await.unwrap();
        let start = tokio::time::Instant::now();
        assert!(matches!(
            framing::read_record(&mut reader).await,
            Err(Error::Timeout)
        ));
        assert_eq!(start.elapsed(), framing::RECORD_IDLE_TIMEOUT);
    }
}
fn config(private: u8) -> noise::NoiseConfig {
    noise::NoiseConfig::new([private; 32], [4; 32], [5; 32], "1", [private; 16])
}
#[tokio::test(start_paused = true)]
async fn silent_handshake_still_has_an_overall_deadline() {
    let (_peer, reader) = tokio::io::duplex(512);
    let start = tokio::time::Instant::now();
    assert!(matches!(
        noise::accept(reader, config(1), |_| Ok(())).await,
        Err(Error::Timeout)
    ));
    assert_eq!(start.elapsed(), noise::HANDSHAKE_TIMEOUT);
}
#[tokio::test(start_paused = true)]
async fn established_noise_survives_idle_until_keepalive_and_can_still_send() {
    let (a, b) = tokio::io::duplex(512);
    let (a, b) = tokio::join!(
        noise::connect(a, config(1), |_| Ok(())),
        noise::accept(b, config(2), |_| Ok(()))
    );
    let (mut ar, mut aw, _) = a.unwrap().into_split();
    let (mut br, mut bw, _) = b.unwrap().into_split();
    let a_read = tokio::spawn(async move { ar.recv().await });
    let b_read = tokio::spawn(async move { br.recv().await });
    tokio::task::yield_now().await;
    tokio::time::advance(std::time::Duration::from_secs(36)).await;
    tokio::task::yield_now().await;
    assert!(
        !a_read.is_finished(),
        "idle initiator reader must stay open"
    );
    assert!(
        !b_read.is_finished(),
        "idle responder reader must stay open"
    );

    let ping = pb::wire_envelope::Body::Ping(pb::Ping { nonce: vec![7; 16] });
    aw.send(ping.clone()).await.unwrap();
    assert_eq!(b_read.await.unwrap().unwrap().body, Some(ping));
    let pong = pb::wire_envelope::Body::Pong(pb::Pong { nonce: vec![7; 16] });
    bw.send(pong.clone()).await.unwrap();
    assert_eq!(a_read.await.unwrap().unwrap().body, Some(pong));
}
#[tokio::test]
async fn real_noise_authentication_bidirectional_data_and_split() {
    let (a, b) = tokio::io::duplex(128);
    let (a, b) = tokio::join!(
        noise::connect(a, config(1), |_| Ok(())),
        noise::accept(b, config(2), |_| Ok(()))
    );
    let mut a = a.unwrap();
    let mut b = b.unwrap();
    assert_eq!(a.peer().session_id, b.peer().session_id);
    assert_eq!(
        a.peer().device_id,
        noise::device_id(&noise::static_public_key(&[2; 32]).unwrap())
    );
    let message = data(
        example::EchoRequest {
            text: "encrypted message".into(),
        }
        .encode_to_vec(),
    );
    let (sent, received) = tokio::join!(
        a.send(pb::wire_envelope::Body::Data(message.clone())),
        b.recv()
    );
    sent.unwrap();
    let envelope = received.unwrap();
    assert_eq!(envelope.sequence, 3);
    assert_eq!(envelope.body, Some(pb::wire_envelope::Body::Data(message)));
    let (mut ar, mut aw, _) = a.into_split();
    let (mut br, mut bw, _) = b.into_split();
    let (s1, s2, r1, r2) = tokio::join!(
        aw.send(pb::wire_envelope::Body::Ping(pb::Ping {
            nonce: vec![7; 16]
        })),
        bw.send(pb::wire_envelope::Body::Pong(pb::Pong {
            nonce: vec![7; 16]
        })),
        ar.recv(),
        br.recv()
    );
    s1.unwrap();
    s2.unwrap();
    r1.unwrap();
    r2.unwrap();
}
#[tokio::test]
async fn wrong_psk_binding_config_peer_and_block_are_rejected() {
    for case in 0..5 {
        let (a, b) = tokio::io::duplex(512);
        let left = config(1);
        let mut right = config(2);
        match case {
            0 => right = noise::NoiseConfig::new([2; 32], [99; 32], [5; 32], "1", [2; 16]),
            1 => right.binding_id = [99; 32],
            2 => right.config_version = "2".into(),
            3 => right.expected_peer = Some([99; 32]),
            _ => {}
        }
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            tokio::join!(
                noise::connect(a, left, |_| Ok(())),
                noise::accept(b, right, |_| if case == 4 {
                    Err(Error::Closed)
                } else {
                    Ok(())
                })
            )
        })
        .await
        .unwrap();
        assert!(result.0.is_err() || result.1.is_err(), "case {case}");
    }
}
#[tokio::test]
async fn established_rejects_binding_reuse_and_cancelled_read_poisons_session() {
    let (a, b) = tokio::io::duplex(512);
    let (a, b) = tokio::join!(
        noise::connect(a, config(1), |_| Ok(())),
        noise::accept(b, config(2), |_| Ok(()))
    );
    let mut a = a.unwrap();
    let _b = b.unwrap();
    let timeout = tokio::time::timeout(std::time::Duration::from_millis(1), a.recv()).await;
    assert!(timeout.is_err());
    assert!(matches!(
        a.send(pb::wire_envelope::Body::Ping(pb::Ping {
            nonce: vec![1; 16]
        }))
        .await,
        Err(Error::Closed)
    ));
    let (a, b) = tokio::io::duplex(512);
    let (a, b) = tokio::join!(
        noise::connect(a, config(1), |_| Ok(())),
        noise::accept(b, config(2), |_| Ok(()))
    );
    let mut a = a.unwrap();
    let _b = b.unwrap();
    assert!(a
        .send(pb::wire_envelope::Body::Ready(pb::SessionReady {
            granted_permissions: vec![1]
        }))
        .await
        .is_err());
}
#[test]
fn prologue_uses_exact_bytes_and_length_prefixes() {
    let a = noise::prologue(&[1; 32], "1", b"hello", b"peer").unwrap();
    assert_ne!(
        a,
        noise::prologue(&[2; 32], "1", b"hello", b"peer").unwrap()
    );
    assert_ne!(
        a,
        noise::prologue(&[1; 32], "2", b"hello", b"peer").unwrap()
    );
    assert_ne!(
        a,
        noise::prologue(&[1; 32], "1", b"hello!", b"peer").unwrap()
    );
    assert_ne!(
        noise::encode_parts(&[b"a\0", b"b"]).unwrap(),
        noise::encode_parts(&[b"a", b"\0b"]).unwrap()
    );
}

#[test]
fn logout_contract_expresses_local_and_cloud_outcomes() {
    let command = pb::AuthLogout {
        cloud_policy: Some(pb::CloudLogoutPolicy::RevokeAndEndSession as i32),
        cloud_budget: duration(),
    };
    assert!(codec::encode(&command).is_ok());
    for status in 1..=5 {
        let result = pb::AuthLogoutResult {
            local_closed: true,
            cloud_status: status,
            local_error: None,
            cloud_error: if status > 2 {
                Some(pb::ProtocolError {
                    code: pb::ErrorCode::UnknownOutcome as i32,
                    ..Default::default()
                })
            } else {
                None
            },
        };
        assert!(codec::encode(&result).is_ok());
    }
    let closed = pb::SdkClosed {
        closed: true,
        cleanup_error: Some(pb::ProtocolError {
            code: pb::ErrorCode::DeadlineExceeded as i32,
            ..Default::default()
        }),
    };
    assert!(codec::encode(&closed).is_ok());
}
