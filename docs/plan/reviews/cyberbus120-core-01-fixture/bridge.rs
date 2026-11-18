// Included only into the committed snapshot's existing bridge test module.
// Synthetic authenticated state and the existing test wire; no real account/network.
#[tokio::test]
async fn review_bootstrap_context_can_be_claimed_without_reading_ingress_socket() {
    let (a, b) = pair().await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    b.register_endpoint(Service::Bootstrap, listener.local_addr().unwrap()).await.unwrap();
    let stream = [71; 16];
    let generation = [72; 16];
    let context = BootstrapContext {
        peer: [1; 32], stream_id: stream, generation,
        account_generation: b.snapshot().generation,
    };
    let frame = make_frame(stream, &generation, Service::Bootstrap, 0, FrameKind::Open, vec![], CloseCode::Unspecified);
    let bytes = frame.encode_to_vec();
    // These values are entirely selected by the authenticated remote Open sender.
    b.receive_data(&pb::DataReceived {
        subscription_id: b.inner.subscription_id.to_vec(), peer_device_id: vec![1; 32],
        message: Some(pb::DataMessage {
            message_id: vec![73; 16], requested_ack: pb::AckStage::Processed as i32,
            fragment: Some(pb::PayloadFragment {
                application_type_url: TYPE_URL.into(), encoding: pb::PayloadEncoding::ProtobufMessage as i32,
                total_size: bytes.len() as u32, offset: 0, protobuf_bytes: bytes,
            }), ..Default::default()
        }),
    });
    let (_genuine_socket, _) = tokio::time::timeout(Duration::from_secs(1), listener.accept()).await.unwrap().unwrap();
    // A different local connection may submit the same remote-known fields first.
    // No core-generated capability or binding to the genuine socket is required.
    let accepted_without_read = b.claim_bootstrap_context(&context).is_ok();
    let genuine_claim_afterwards = b.claim_bootstrap_context(&context).is_ok();
    a.close().await.unwrap(); b.close().await.unwrap();
    assert!(!accepted_without_read, "local prelude assembled from remote-known fields was accepted without reading core ingress");
    assert!(genuine_claim_afterwards, "forged claim consumed legitimate connection's authorization");
}

#[tokio::test]
async fn review_bootstrap_claim_replays_after_stream_slot_recreated() {
    let (a, b) = pair().await;
    let context = BootstrapContext {peer:[1;32], stream_id:[81;16], generation:[82;16], account_generation:b.snapshot().generation};
    let key = (context.peer, context.stream_id);
    let (_rx, _) = b.inner.bridge.allocate(key, context.generation.to_vec(), Service::Bootstrap, false, context.account_generation).unwrap();
    b.claim_bootstrap_context(&context).unwrap();
    b.inner.bridge.entries.lock().unwrap().remove(&key); // finish_stream performs this removal.
    let (_rx, _) = b.inner.bridge.allocate(key, context.generation.to_vec(), Service::Bootstrap, false, context.account_generation).unwrap();
    let replayed = b.claim_bootstrap_context(&context).is_ok();
    a.close().await.unwrap(); b.close().await.unwrap();
    assert!(!replayed, "replayed Open can recreate a slot accepting the already consumed Bootstrap context");
}

#[tokio::test]
async fn review_stream_deadline_requires_host_setup_budget() {
    let (a, b) = pair().await;
    // Recreate the bus with a small absolute lifetime while retaining a longer open timeout.
    a.close().await.unwrap(); b.close().await.unwrap();
    let mut limits = Limits::default();
    limits.stream_timeout = Duration::from_millis(25);
    limits.open_timeout = Duration::from_millis(250);
    let bus = Bus::with_limits(config(), Box::<cyberbus_auth::MemoryStore>::default(), StoreMode::CreateNew, limits).await.unwrap();
    let mut updates = bus.watch();
    while !updates.borrow_and_update().directory_valid { updates.changed().await.unwrap(); }
    online(&bus, [2;32]);
    let lease = bus.map([2;32], Service::Sync).await.unwrap();
    tokio::time::sleep(Duration::from_millis(90)).await;
    let finished_at_absolute_deadline = lease.result().is_some();
    let _ = lease.close().await; bus.close().await.unwrap();
    assert!(!finished_at_absolute_deadline, "contract changed: update host/setup deadline review");
}

#[tokio::test]
async fn review_full_stream_slots_pending_ack_cancel_is_bounded() {
    tokio::time::timeout(Duration::from_secs(3),async {
        let mut limits=Limits::default(); limits.max_inflight=1;
        limits.command_timeout=Duration::from_millis(100);
        limits.ack_timeout=Duration::from_millis(500);
        let bus=Bus::with_limits(config(),Box::<cyberbus_auth::MemoryStore>::default(),StoreMode::CreateNew,limits).await.unwrap();
        let mut updates=bus.watch();
        while !updates.borrow_and_update().directory_valid {updates.changed().await.unwrap();}
        online(&bus,[2;32]);
        // Keep one SDK Send accepted by the bounded test wire but never emit terminal ACK.
        let (tx,mut wire)=mpsc::channel(32); *bus.inner.test_wire.lock().unwrap()=Some(tx);
        let mut leases=Vec::new(); let mut sockets=Vec::new();
        for _ in 0..4 {
            let lease=bus.map([2;32],Service::Sync).await.unwrap();
            sockets.push(TcpStream::connect(lease.local_addr()).await.unwrap()); leases.push(lease);
        }
        assert!(matches!(bus.map([2;32],Service::Sync).await,Err(Error::Capacity)));
        assert!(matches!(wire.recv().await,Some(C::Send(_))));
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(bus.inner.bridge.entries.lock().unwrap().len(),4);
        assert_eq!(bus.inner.bridge.pending.lock().unwrap().len(),1);
        // Saturate local completion queue; owner never waits on CompleteData or ACK.
        for _ in 0..200 {let _=bus.inner.bridge.completions.try_send(C::CancelData(pb::CancelData {
            peer_device_id:vec![2;32],message_id:vec![8;16]
        }));}
        let outcome=bus.close().await;
        assert!(matches!(outcome,Ok(())|Err(Error::Timeout)));
        tokio::time::timeout(Duration::from_millis(500),bus.inner.tasks.wait()).await.unwrap();
        for lease in leases {assert!(lease.close().await.is_err());}
        assert!(bus.inner.tasks.is_empty());
        assert!(bus.inner.bridge.entries.lock().unwrap().is_empty());
        assert!(bus.inner.bridge.pending.lock().unwrap().is_empty());
        drop(sockets); drop(wire);
    }).await.expect("cancel/join stalled with pending ACK, full slots or completion queue");
}
