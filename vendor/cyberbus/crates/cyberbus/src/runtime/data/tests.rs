use super::*;
const PEER: [u8; 32] = [42; 32];
const TYPE: &str = "type.googleapis.com/cyberbus.example.v1.EchoRequest";
fn runtime() -> (Runtime, crate::EventReceiver, session::PeerOutput) {
    let config = ClientConfig::from_json(r#"{"issuer":"https://auth.example.com/oidc","client_id":"native","resource":"https://cyberbus.example/api","product_id":"cyberbus","native_clients":{"native":"cyberbus"},"redirect_uri":"http://127.0.0.1:18765/callback"}"#).unwrap();
    let clock = Arc::new(cyberbus_auth::SystemClock::new().unwrap());
    let auth = AuthManager::new(
        config.auth(),
        Box::new(cyberbus_auth::MemoryStore::default()),
        crate::StoreMode::CreateNew,
        clock.clone(),
    )
    .unwrap();
    let (events, rx) = crate::events::channel();
    let mut r = Runtime::new(config, auth, events, clock, Arc::new(Mutex::new(None))).unwrap();
    r.admission.open.store(true, Ordering::Release);
    r.generation = Some(1);
    let (send, output) = session::test_channel();
    r.peers.insert(
        PEER.to_vec(),
        Peer {
            send,
            session: Session {
                generation: 1,
                address_generation: 0,
                business: Arc::new(std::sync::atomic::AtomicBool::new(true)),
                outbound: true,
                id: [1; 32],
                policy_epoch: 0,
                cancel: CancellationToken::new(),
                progress: Arc::default(),
            },
            bind: pb::SessionBind {
                boot_id: vec![8; 16],
                ..Default::default()
            },
            ip: std::net::Ipv4Addr::new(10, 0, 0, 2),
            used: tokio::time::Instant::now(),
            ping: None,
            pending_profile: None,
        },
    );
    (r, rx, output)
}
fn message(id: u8, ack: pb::AckStage) -> pb::DataMessage {
    let bytes = crate::example::EchoRequest {
        text: "hello".into(),
    }
    .encode_to_vec();
    pb::DataMessage {
        message_id: vec![id; 16],
        requested_ack: ack as i32,
        timeout: Some(prost_types::Duration {
            seconds: 90,
            nanos: 0,
        }),
        fragment: Some(pb::PayloadFragment {
            application_type_url: TYPE.into(),
            encoding: pb::PayloadEncoding::ProtobufMessage as i32,
            total_size: bytes.len() as u32,
            protobuf_bytes: bytes,
            offset: 0,
        }),
        ..Default::default()
    }
}
fn owner(r: &mut Runtime) {
    r.subscriptions.insert(vec![1; 16], vec![TYPE.into()]);
}
async fn complete(
    r: &mut Runtime,
    id: u8,
    result: pb::complete_data::Result,
) -> PResult<ResultBody> {
    r.dispatch_data(pb::sdk_command::Body::CompleteData(pb::CompleteData {
        peer_device_id: PEER.to_vec(),
        message_id: vec![id; 16],
        result: Some(result),
    }))
    .await
}
async fn output(out: &mut session::PeerOutput) -> Vec<Body> {
    let mut bodies = vec![];
    while let Ok(body) = out.try_recv() {
        bodies.push(body);
    }
    bodies
}
#[tokio::test]
async fn subscriptions_reject_duplicate_overlap_and_wildcard() {
    let (mut r, _events, _out) = runtime();
    owner(&mut r);
    for (id, types) in [(1, vec![TYPE.into()]), (2, vec![TYPE.into()]), (3, vec![])] {
        let e = r
            .dispatch_data(pb::sdk_command::Body::SubscribeData(pb::SubscribeData {
                subscription_id: vec![id; 16],
                type_urls: types,
            }))
            .await
            .unwrap_err();
        assert_eq!(e.code, pb::ErrorCode::Conflict as i32);
    }
    assert_eq!(r.subscriptions.len(), 1);
}
#[tokio::test]
async fn ack_ceiling_and_idempotent_completion_preserve_first_terminal() {
    for requested in [
        pb::AckStage::Received,
        pb::AckStage::Accepted,
        pb::AckStage::Processed,
    ] {
        let (mut r, mut events, mut out) = runtime();
        owner(&mut r);
        r.receive_data(PEER.to_vec(), message(1, requested));
        assert!(matches!(
            events.try_recv().unwrap().body,
            Some(Event::DataReceived(_))
        ));
        complete(&mut r, 1, pb::complete_data::Result::Stage(2))
            .await
            .unwrap();
        complete(&mut r, 1, pb::complete_data::Result::Stage(2))
            .await
            .unwrap();
        complete(&mut r, 1, pb::complete_data::Result::Stage(3))
            .await
            .unwrap();
        complete(
            &mut r,
            1,
            pb::complete_data::Result::Error(error(pb::ErrorCode::Cancelled, "late")),
        )
        .await
        .unwrap_err();
        complete(&mut r, 1, pb::complete_data::Result::Stage(3))
            .await
            .unwrap();
        let bodies = output(&mut out).await;
        let stages: Vec<_> = bodies
            .iter()
            .filter_map(|b| {
                if let Body::DataAck(a) = b {
                    Some(a.stage)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(stages, (1..=requested as i32).collect::<Vec<_>>());
        assert!(!bodies.iter().any(|b| matches!(b, Body::DataError(_))));
        assert_eq!(r.reassembly_budget.used(), 0);
    }
}
#[tokio::test]
async fn missing_owner_and_business_failure_remain_failed() {
    let (mut r, _events, mut out) = runtime();
    r.receive_data(PEER.to_vec(), message(1, pb::AckStage::Processed));
    assert_eq!(
        r.receiving[&(PEER.to_vec(), vec![1; 16])]
            .terminal_error
            .as_ref()
            .unwrap()
            .code,
        pb::ErrorCode::NotFound as i32
    );
    owner(&mut r);
    r.receive_data(PEER.to_vec(), message(2, pb::AckStage::Processed));
    complete(
        &mut r,
        2,
        pb::complete_data::Result::Error(error(pb::ErrorCode::Internal, "business failure")),
    )
    .await
    .unwrap();
    complete(
        &mut r,
        2,
        pb::complete_data::Result::Error(error(pb::ErrorCode::Internal, "same terminal")),
    )
    .await
    .unwrap();
    assert_eq!(
        complete(
            &mut r,
            2,
            pb::complete_data::Result::Error(error(pb::ErrorCode::Cancelled, "opposite terminal"))
        )
        .await
        .unwrap_err()
        .code,
        pb::ErrorCode::Conflict as i32
    );
    let late = complete(&mut r, 2, pb::complete_data::Result::Stage(3))
        .await
        .unwrap_err();
    assert_eq!(late.code, pb::ErrorCode::Internal as i32);
    assert!(!output(&mut out)
        .await
        .iter()
        .any(|b| matches!(b, Body::DataAck(a) if a.stage == 3)));
}
#[tokio::test]
async fn cancellation_purges_unstarted_and_preserves_started_completion() {
    let (mut r, mut events, _out) = runtime();
    owner(&mut r);
    for id in [1, 2] {
        r.receive_data(PEER.to_vec(), message(id, pb::AckStage::Processed));
    }
    assert!(matches!(
        events.try_recv().unwrap().body,
        Some(Event::DataReceived(_))
    ));
    for id in [1, 2, 99, 1] {
        r.receive_data_frame(
            PEER.to_vec(),
            Body::DataCancel(pb::DataCancel {
                message_id: vec![id; 16],
            }),
        );
    }
    let ev = events.try_recv().unwrap();
    assert!(matches!(ev.body, Some(Event::PeerDataCancel(c)) if c.message_id == vec![1;16]));
    assert!(events.try_recv().is_err());
    complete(
        &mut r,
        1,
        pb::complete_data::Result::Error(error(pb::ErrorCode::Cancelled, "cooperative stop")),
    )
    .await
    .unwrap();
    let late = complete(&mut r, 1, pb::complete_data::Result::Stage(3))
        .await
        .unwrap_err();
    assert_eq!(late.code, pb::ErrorCode::Cancelled as i32);
    assert_eq!(
        r.receiving[&(PEER.to_vec(), vec![1; 16])]
            .terminal_error
            .as_ref()
            .unwrap()
            .code,
        pb::ErrorCode::Cancelled as i32
    );
}
#[tokio::test]
async fn queue_capacity_fails_data_without_closing_runtime() {
    let (mut r, mut events, _out) = runtime();
    owner(&mut r);
    // RECEIVED releases the in-flight slot but still occupies a bounded application queue.
    for id in 1..=65 {
        r.receive_data(PEER.to_vec(), message(id, pb::AckStage::Received));
    }
    assert!(!r.closed);
    assert_eq!(
        r.receiving[&(PEER.to_vec(), vec![65; 16])]
            .terminal_error
            .as_ref()
            .unwrap()
            .code,
        pb::ErrorCode::ResourceExhausted as i32
    );
    let mut count = 0;
    while let Ok(e) = events.try_recv() {
        if matches!(e.body, Some(Event::DataReceived(_))) {
            count += 1;
        }
    }
    assert_eq!(count, 64);
    assert_eq!(r.reassembly_budget.used(), 0);
}
#[tokio::test]
async fn unsubscribe_purges_and_duplicate_payload_is_verified() {
    let (mut r, mut events, mut out) = runtime();
    owner(&mut r);
    let m = message(1, pb::AckStage::Processed);
    r.receive_data(PEER.to_vec(), m.clone());
    r.receive_data(PEER.to_vec(), m.clone());
    let mut changed = m;
    changed.fragment.as_mut().unwrap().protobuf_bytes[2] ^= 1;
    r.receive_data(PEER.to_vec(), changed);
    assert!(output(&mut out).await.iter().any(|b| matches!(b, Body::DataError(e) if e.error.as_ref().unwrap().code == pb::ErrorCode::Conflict as i32)));
    r.dispatch_data(pb::sdk_command::Body::UnsubscribeData(
        pb::UnsubscribeData {
            subscription_id: vec![1; 16],
        },
    ))
    .await
    .unwrap();
    assert!(events.try_recv().is_err());
}
#[tokio::test]
async fn deadline_wins_late_ack_and_completion_and_cancel_is_local_first() {
    let (mut r, mut events, _out) = runtime();
    owner(&mut r);
    let key = (PEER.to_vec(), vec![1; 16]);
    r.pending.insert(
        key.clone(),
        PendingData {
            owner: r.peers[PEER.as_slice()].clone(),
            deadline: tokio::time::Instant::now() - Duration::from_secs(1),
            stage: 0,
            requested: 3,
        },
    );
    r.receive_data_frame(
        PEER.to_vec(),
        Body::DataAck(pb::DataAck {
            message_id: key.1.clone(),
            stage: 3,
        }),
    );
    assert!(
        matches!(events.try_recv().unwrap().body,Some(Event::DataStatus(s)) if matches!(&s.result,Some(pb::data_status::Result::Error(e)) if e.code == pb::ErrorCode::DeadlineExceeded as i32))
    );
    r.receive_data(PEER.to_vec(), message(2, pb::AckStage::Processed));
    r.receiving
        .get_mut(&(PEER.to_vec(), vec![2; 16]))
        .unwrap()
        .deadline = tokio::time::Instant::now() - Duration::from_secs(1);
    let late = complete(&mut r, 2, pb::complete_data::Result::Stage(3))
        .await
        .unwrap_err();
    assert_eq!(late.code, pb::ErrorCode::DeadlineExceeded as i32);
    assert_eq!(
        r.receiving[&(PEER.to_vec(), vec![2; 16])]
            .terminal_error
            .as_ref()
            .unwrap()
            .code,
        pb::ErrorCode::DeadlineExceeded as i32
    );
    r.pending.insert(
        (PEER.to_vec(), vec![3; 16]),
        PendingData {
            owner: r.peers[PEER.as_slice()].clone(),
            deadline: tokio::time::Instant::now() + Duration::from_secs(90),
            stage: 0,
            requested: 3,
        },
    );
    r.peers.clear();
    r.dispatch_data(pb::sdk_command::Body::CancelData(pb::CancelData {
        peer_device_id: PEER.to_vec(),
        message_id: vec![3; 16],
    }))
    .await
    .unwrap();
    assert!(r.pending.is_empty());
}
#[tokio::test]
async fn shared_reservation_failure_and_long_timeout() {
    let (mut r, _events, _out) = runtime();
    owner(&mut r);
    let held = r.reassembly_budget.reserve(32 * MIB).unwrap();
    r.receive_data(PEER.to_vec(), message(1, pb::AckStage::Processed));
    assert!(r.receiving.is_empty());
    drop(held);
    r.receive_data(PEER.to_vec(), message(2, pb::AckStage::Processed));
    assert!(
        r.receiving[&(PEER.to_vec(), vec![2; 16])].deadline
            > tokio::time::Instant::now() + Duration::from_secs(80)
    );
    assert!(!r.closed);
}

#[tokio::test]
async fn send_charges_submission_queue_time_and_allows_explicit_terminal_retry() {
    let (mut r, mut events, mut out) = runtime();
    r.submitted = tokio::time::Instant::now() - Duration::from_secs(45);
    let m = message(1, pb::AckStage::Accepted);
    r.dispatch_data(pb::sdk_command::Body::Send(pb::Send {
        peer_device_id: PEER.to_vec(),
        message: Some(m.clone()),
    }))
    .await
    .unwrap();
    let queued = out.try_recv().unwrap();
    let Body::Data(sent) = queued else {
        panic!("expected Data")
    };
    let remaining = sent.timeout.unwrap();
    assert!((40..=45).contains(&remaining.seconds));
    r.receive_data_frame(
        PEER.to_vec(),
        Body::DataAck(pb::DataAck {
            message_id: vec![1; 16],
            stage: 2,
        }),
    );
    assert!(matches!(
        events.try_recv().unwrap().body,
        Some(Event::DataStatus(_))
    ));
    r.dispatch_data(pb::sdk_command::Body::Send(pb::Send {
        peer_device_id: PEER.to_vec(),
        message: Some(m.clone()),
    }))
    .await
    .unwrap();
    assert!(matches!(out.try_recv().unwrap(), Body::Data(_)));
    let active = r
        .dispatch_data(pb::sdk_command::Body::Send(pb::Send {
            peer_device_id: PEER.to_vec(),
            message: Some(m),
        }))
        .await
        .unwrap_err();
    assert_eq!(active.code, pb::ErrorCode::Conflict as i32);
    r.receive_data_frame(
        PEER.to_vec(),
        Body::DataAck(pb::DataAck {
            message_id: vec![1; 16],
            stage: 2,
        }),
    );
    r.submitted = tokio::time::Instant::now() - Duration::from_secs(100);
    let e = r
        .dispatch_data(pb::sdk_command::Body::Send(pb::Send {
            peer_device_id: PEER.to_vec(),
            message: Some(message(2, pb::AckStage::Processed)),
        }))
        .await
        .unwrap_err();
    assert_eq!(e.code, pb::ErrorCode::DeadlineExceeded as i32);
    assert!(r.pending.is_empty());
}

#[tokio::test]
async fn megabyte_reassembly_replay_and_disconnect_keep_one_delivery() {
    let (mut r, mut events, mut out) = runtime();
    owner(&mut r);
    let mut m = message(1, pb::AckStage::Processed);
    // Echo's four-byte tag/length header plus payload is exactly the protocol limit.
    let bytes = crate::example::EchoRequest {
        text: "x".repeat(MIB - 4),
    }
    .encode_to_vec();
    assert_eq!(bytes.len(), MIB);
    let f = m.fragment.as_mut().unwrap();
    f.total_size = MIB as u32;
    f.protobuf_bytes = bytes;
    let parts = session::split_data(&m).unwrap();
    assert_eq!(parts.len(), 64);
    r.receive_data(PEER.to_vec(), parts[0].clone());
    assert_eq!(r.reassembly_budget.used(), MIB);
    for p in &parts[1..] {
        r.receive_data(PEER.to_vec(), p.clone());
    }
    assert_eq!(r.reassembly_budget.used(), 0);
    for p in &parts {
        r.receive_data(PEER.to_vec(), p.clone());
    }
    assert!(matches!(
        events.try_recv().unwrap().body,
        Some(Event::DataReceived(_))
    ));
    assert!(events.try_recv().is_err());
    r.data_drop_peer(
        &PEER,
        error(pb::ErrorCode::UnknownOutcome, "connection lost"),
    );
    for p in &parts {
        r.receive_data(PEER.to_vec(), p.clone());
    }
    assert!(events.try_recv().is_err());
    assert!(output(&mut out).await.iter().any(|b| matches!(b,Body::DataError(e) if e.error.as_ref().unwrap().code == pb::ErrorCode::UnknownOutcome as i32)));
    assert_eq!(r.reassembly_budget.used(), 0);
    // Cache expiry permits delivery again; this protocol does not claim exactly-once.
    r.receiving
        .get_mut(&(PEER.to_vec(), vec![1; 16]))
        .unwrap()
        .deadline = tokio::time::Instant::now() - Duration::from_secs(1);
    r.data_maintenance();
    for p in parts {
        r.receive_data(PEER.to_vec(), p);
    }
    assert!(matches!(
        events.try_recv().unwrap().body,
        Some(Event::DataReceived(_))
    ));
}

#[tokio::test]
async fn explicit_send_retry_verifies_receiver_digest_without_redelivery_or_deadline_extension() {
    let (mut sender, mut statuses, mut wire) = runtime();
    let (mut receiver, mut deliveries, mut acks) = runtime();
    owner(&mut receiver);
    let original = message(9, pb::AckStage::Processed);
    for attempt in 0..3 {
        let mut m = original.clone();
        if attempt == 2 {
            m.fragment.as_mut().unwrap().protobuf_bytes[2] ^= 1;
        }
        sender
            .dispatch_data(pb::sdk_command::Body::Send(pb::Send {
                peer_device_id: PEER.to_vec(),
                message: Some(m),
            }))
            .await
            .unwrap();
        let key = (PEER.to_vec(), vec![9; 16]);
        let previous_deadline = receiver.receiving.get(&key).map(|r| r.deadline);
        for body in output(&mut wire).await {
            receiver.receive_data_frame(PEER.to_vec(), body);
        }
        if let Some(deadline) = previous_deadline {
            assert_eq!(receiver.receiving[&key].deadline, deadline);
        }
        if attempt == 0 {
            assert!(matches!(
                deliveries.try_recv().unwrap().body,
                Some(Event::DataReceived(_))
            ));
            let key = (PEER.to_vec(), vec![9; 16]);
            let deadline = receiver.receiving[&key].deadline;
            // A replay while the application owns the message cannot reset its budget.
            receiver.receive_data(PEER.to_vec(), original.clone());
            assert_eq!(receiver.receiving[&key].deadline, deadline);
            complete(&mut receiver, 9, pb::complete_data::Result::Stage(3))
                .await
                .unwrap();
        }
        let key = (PEER.to_vec(), vec![9; 16]);
        let retention = receiver.receiving[&key].deadline;
        for body in output(&mut acks).await {
            sender.receive_data_frame(PEER.to_vec(), body);
        }
        let mut last = None;
        while let Ok(event) = statuses.try_recv() {
            if let Some(Event::DataStatus(s)) = event.body {
                last = s.result;
            }
        }
        if attempt < 2 {
            assert!(matches!(last, Some(pb::data_status::Result::Stage(3))));
        } else {
            assert!(
                matches!(last, Some(pb::data_status::Result::Error(e)) if e.code == pb::ErrorCode::Conflict as i32)
            );
        }
        assert_eq!(receiver.receiving[&key].deadline, retention);
        assert!(deliveries.try_recv().is_err());
        assert!(sender.pending.is_empty());
        assert!(wire.try_recv().is_err(), "no automatic retry");
    }
}
