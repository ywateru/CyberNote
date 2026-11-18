fn budget_keys(runtime: &mut Runtime) -> Arc<Keys> {
    let Body::Metadata(m) = metadata("local") else {
        unreachable!()
    };
    let local = runtime.local().to_vec();
    runtime.devices.get_mut(&local).unwrap().profile = m.profile;
    Arc::new(Keys {
        private: Zeroizing::new(runtime.auth.identity().with_private_key(|k| *k)),
        psk: Zeroizing::new([9; 32]),
        binding: [8; 32],
        boot: *runtime.auth.identity().boot_id(),
    })
}

// Real Noise/session owners at both original limits. Promotion must release
// probe admission without detaching task ownership or bypassing business16.
#[tokio::test]
async fn probe_promotion_releases_gate_keeps_owners_and_enforces_business_limit() {
    for (outbound, limit) in [(false, 32), (true, 16)] {
        let (mut runtime, _events) = runtime();
        let keys = budget_keys(&mut runtime);
        let mut owners = tokio::task::JoinSet::new();
        let mut gate = crate::discovery::probe_gate::ProbeGate::new(limit);
        let mut streams: Vec<(
            noise::SecureStream<tokio::io::DuplexStream>,
            Vec<u8>,
            Session,
        )> = Vec::new();
        for index in 0..=limit {
            if index == limit {
                assert_eq!(owners.len(), limit);
                assert!(!gate.available());
                for (_, id, current) in streams.iter().take(16) {
                    runtime.promote(id, current).unwrap();
                }
                assert_eq!(runtime.business_streams(), 16);
                assert_eq!(gate.used(), limit - 16);
                assert!(gate.available());
                assert_eq!(gate.promoted().len(), 16);
                assert!(gate.promoted().is_empty());
                assert!(owners.try_join_next().is_none());
                assert_eq!(owners.len(), limit, "legacy gate would still be full");
            }
            let (a, b) = tokio::io::duplex(128 * 1024);
            let flag = session::BusinessFlag::default();
            let progress = Arc::<session::Progress>::default();
            let stop = runtime.stop.clone();
            let incoming = runtime.incoming.clone();
            let handshake = session::handshake_tracked(
                Box::new(a),
                std::net::Ipv4Addr::new(10, 0, 0, 2),
                outbound,
                keys.clone(),
                runtime.admission.clone(),
                runtime.incoming.clone(),
                runtime.stop.clone(),
                runtime.generation.unwrap(),
                0,
                flag.clone(),
                None,
                progress.clone(),
            );
            let task = owners.spawn(async move {
                let noise = handshake.await;
                if outbound {
                    // Exercise the production Down handoff wait. At shutdown
                    // below the owner joins these tasks without polling Down.
                    let _ = crate::discovery::complete_probe(noise, progress, stop, incoming).await;
                }
                noise
            });
            gate.insert(&task, flag, ());
            let config = noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]);
            let remote = if outbound {
                noise::accept(b, config, |_| Ok(())).await.unwrap()
            } else {
                noise::connect(b, config, |_| Ok(())).await.unwrap()
            };
            let (id, current) = loop {
                let notification =
                    tokio::time::timeout(Duration::from_secs(2), runtime.inbox.recv())
                        .await
                        .unwrap()
                        .unwrap();
                let current = match &notification {
                    Incoming::Up { id, session, .. } => Some((id.clone(), session.clone())),
                    _ => None,
                };
                runtime.receive(notification).await;
                if let Some(current) = current {
                    break current;
                }
            };
            assert!(!current.business.load(Ordering::Acquire));
            streams.push((remote, id, current));
        }
        assert_eq!(owners.len(), limit + 1);
        assert_eq!(gate.used(), limit - 15);
        let (_, id, extra) = streams.last().unwrap();
        let rejected = runtime.promote(id, extra).unwrap_err();
        assert_eq!(rejected.code, pb::ErrorCode::QueueFull as i32);
        assert!(!extra.business.load(Ordering::Acquire));
        assert_eq!(
            gate.used(),
            limit - 15,
            "failed promotion must retain its probe charge"
        );
        assert_eq!(runtime.business_streams(), 16);
        eprintln!(
            "promotion fixture: outbound={outbound} owners={} probe_used={} business=16",
            owners.len(),
            gate.used()
        );

        // The promoted task must keep its stream alive, rather than return just
        // to make the probe count look correct. Verify real encrypted output.
        let (remote, id, current) = &mut streams[0];
        runtime.peers[id.as_slice()]
            .send
            .try_send(Body::Ping(pb::Ping { nonce: vec![9; 16] }))
            .unwrap();
        loop {
            let frame = tokio::time::timeout(Duration::from_secs(2), remote.recv())
                .await
                .unwrap()
                .unwrap();
            if matches!(frame.body, Some(Body::Ping(p)) if p.nonce == vec![9; 16]) {
                break;
            }
        }
        assert!(!current.cancel.is_cancelled());
        runtime.stop.cancel();
        let ended = tokio::time::timeout(Duration::from_secs(2), async {
            let mut ended = 0;
            while let Some(result) = owners.join_next_with_id().await {
                let (id, success) = result.unwrap();
                assert!(success);
                gate.finished(id);
                ended += 1;
            }
            ended
        })
        .await
        .unwrap();
        assert_eq!(ended, limit + 1);
        assert!(owners.is_empty());
        assert_eq!(gate.used(), 0);
    }
}

#[tokio::test]
async fn stream_budget_idle_owner_preserves_retained_control_output() {
    let (mut runtime, _events) = runtime();
    let owner = session(&runtime, 1);
    let (notification, mut owner_output) = up(&owner);
    runtime.receive(notification).await;
    let retained = session(&runtime, 2);
    let (notification, mut retained_output) = up(&retained);
    runtime.receive(notification).await;
    while owner_output.try_recv().is_ok() {}
    while retained_output.try_recv().is_ok() {}
    runtime.probes[&retained.id]
        .send
        .try_send(Body::DataAck(pb::DataAck {
            message_id: vec![9; 16],
            stage: pb::AckStage::Processed as i32,
        }))
        .unwrap();
    let aged = tokio::time::Instant::now() - Duration::from_secs(61);
    runtime.peers.get_mut(PEER.as_slice()).unwrap().used = aged;
    runtime.probes.get_mut(&retained.id).unwrap().used = aged;
    runtime.directory_maintenance().await;
    assert!(
        !owner.cancel.is_cancelled() && !retained.cancel.is_cancelled(),
        "owner idle expiry must not cancel a retained stream with pending control output"
    );
    assert!(matches!(
        retained_output.try_recv().unwrap(),
        Body::DataAck(_)
    ));
    while owner_output.try_recv().is_ok() {}
    runtime.directory_maintenance().await;
    assert!(owner.cancel.is_cancelled() && retained.cancel.is_cancelled());
    assert_eq!(runtime.business_streams(), 0);
}

#[tokio::test]
async fn stream_budget_truly_idle_lru_reclaims_owner_and_crossed_streams() {
    let (mut runtime, _events) = runtime();
    let mut sessions = Vec::new();
    let mut outputs = Vec::new();
    for n in 1..=16 {
        let s = session(&runtime, n);
        let (mut notification, out) = up(&s);
        // The LRU device owns two actual streams; the other fourteen own one.
        if n > 2 {
            if let Incoming::Up { id, bind, .. } = &mut notification {
                *id = vec![n; 32];
                bind.device_id = id.clone();
            }
        }
        runtime.receive(notification).await;
        sessions.push(s);
        outputs.push(out);
    }
    for out in &mut outputs {
        while out.try_recv().is_ok() {}
    }
    runtime.peers.get_mut(PEER.as_slice()).unwrap().used =
        tokio::time::Instant::now() - Duration::from_secs(30);
    assert_eq!(runtime.business_streams(), 16);
    let fresh = session(&runtime, 17);
    let (mut notification, _out) = up(&fresh);
    if let Incoming::Up { id, bind, .. } = &mut notification {
        *id = vec![17; 32];
        bind.device_id = id.clone();
    }
    runtime.receive(notification).await;
    assert!(!fresh.cancel.is_cancelled());
    assert!(runtime.peers[vec![17; 32].as_slice()]
        .session
        .same_instance(&fresh));
    assert!(sessions[..2].iter().all(|s| s.cancel.is_cancelled()));
    assert!(sessions[2..].iter().all(|s| !s.cancel.is_cancelled()));
    assert_eq!(runtime.business_streams(), 15);
}

#[tokio::test]
async fn stream_budget_full_preserves_queued_terminal_ack() {
    let (mut runtime, _events) = runtime();
    let old = session(&runtime, 1);
    let (notification, mut output) = up(&old);
    runtime.receive(notification).await;
    while output.try_recv().is_ok() {}
    runtime
        .receive(Incoming::Frame {
            id: PEER.to_vec(),
            session: old.clone(),
            body: data(),
        })
        .await;
    runtime
        .dispatch_data(pb::sdk_command::Body::CompleteData(pb::CompleteData {
            peer_device_id: PEER.to_vec(),
            message_id: vec![9; 16],
            result: Some(pb::complete_data::Result::Stage(
                pb::AckStage::Processed as i32,
            )),
        }))
        .await
        .unwrap();
    assert!(!runtime.active_peer(&PEER));
    assert_eq!(runtime.peers[PEER.as_slice()].send.capacity(), 128);
    runtime.peers.get_mut(PEER.as_slice()).unwrap().used =
        tokio::time::Instant::now() - Duration::from_secs(61);
    runtime.directory_maintenance().await;
    assert!(
        !old.cancel.is_cancelled(),
        "idle maintenance must preserve queued ACKs"
    );
    let mut outputs = Vec::new();
    for n in 2..=17 {
        let s = session(&runtime, n);
        let (mut notification, out) = up(&s);
        if let Incoming::Up { id, bind, .. } = &mut notification {
            *id = vec![n; 32];
            bind.device_id = id.clone();
        }
        runtime.receive(notification).await;
        if n == 17 {
            assert!(
                s.cancel.is_cancelled(),
                "full budget must reject the newcomer"
            );
        }
        outputs.push(out);
    }
    assert!(
        !old.cancel.is_cancelled(),
        "admission must preserve the queued terminal ACK owner"
    );
    assert_eq!(runtime.business_streams(), 16);
    assert!(std::iter::from_fn(|| output.try_recv().ok())
        .any(|b| matches!(b, Body::DataAck(a) if a.stage == pb::AckStage::Processed as i32)));
}

async fn budget_noise(
    runtime: &mut Runtime,
    keys: Arc<Keys>,
    outbound: bool,
) -> (
    noise::SecureStream<tokio::io::DuplexStream>,
    Session,
    JoinHandle<bool>,
    Vec<u8>,
) {
    let (a, b) = tokio::io::duplex(128 * 1024);
    let task = tokio::spawn(session::handshake(
        Box::new(a),
        std::net::Ipv4Addr::new(10, 0, 0, 2),
        outbound,
        keys,
        runtime.admission.clone(),
        runtime.incoming.clone(),
        runtime.stop.clone(),
        runtime.generation.unwrap(),
        0,
        outbound,
        None,
    ));
    let config = noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]);
    let remote = if outbound {
        noise::accept(b, config, |_| Ok(())).await.unwrap()
    } else {
        noise::connect(b, config, |_| Ok(())).await.unwrap()
    };
    loop {
        let notification = tokio::time::timeout(Duration::from_secs(2), runtime.inbox.recv())
            .await
            .unwrap()
            .unwrap();
        let current = match &notification {
            Incoming::Up { id, session, .. } => Some((id.clone(), session.clone())),
            _ => None,
        };
        runtime.receive(notification).await;
        if let Some((id, session)) = current {
            return (remote, session, task, id);
        }
    }
}

async fn budget_frame(runtime: &mut Runtime, current: &Session) {
    loop {
        let notification = tokio::time::timeout(Duration::from_secs(2), runtime.inbox.recv())
            .await
            .unwrap()
            .unwrap();
        let done = matches!(&notification, Incoming::Frame { session, body: Body::Data(_), .. }
            if session.same_instance(current));
        runtime.receive(notification).await;
        if done {
            break;
        }
    }
}

#[tokio::test]
async fn stream_budget_real_noise_twenty_crossed_with_pinned_business() {
    let (mut runtime, mut events) = runtime();
    let keys = budget_keys(&mut runtime);
    let mut clients = Vec::new();
    let mut sessions = Vec::new();
    let mut tasks = Vec::new();
    let mut peer = Vec::new();
    for _ in 0..20 {
        let (mut client, session, task, id) = budget_noise(&mut runtime, keys.clone(), false).await;
        client.send(data()).await.unwrap();
        budget_frame(&mut runtime, &session).await;
        peer = id;
        clients.push(client);
        sessions.push(session);
        tasks.push(task);
    }
    // A requested Processed ACK pins the accepted incoming business until the app replies.
    assert!(runtime.active_peer(&peer));
    assert_eq!(received(&mut events), 1);
    let aged = tokio::time::Instant::now() - Duration::from_secs(61);
    for p in runtime
        .peers
        .values_mut()
        .chain(runtime.probes.values_mut())
    {
        p.used = aged;
    }
    runtime.directory_maintenance().await;
    let live = sessions.iter().filter(|s| !s.cancel.is_cancelled()).count();
    println!(
        "Noise same-boot: owners={} retained={} live_business={} rejected={}",
        runtime.peers.len(),
        runtime.probes.len(),
        live,
        sessions.len() - live
    );
    assert_eq!(
        live, 16,
        "actual persistent streams must respect the global budget"
    );
    assert!(
        sessions[..16].iter().all(|s| !s.cancel.is_cancelled()),
        "new streams must not evict the pinned peer's old streams"
    );
    assert!(sessions[16..].iter().all(|s| s.cancel.is_cancelled()));
    assert_eq!(runtime.business_streams(), 16);
    assert!(runtime.receiving.contains_key(&(peer.clone(), vec![9; 16])));
    // A wire Close of the owner retires every retained receiver, even before Down.
    runtime
        .receive(Incoming::Frame {
            id: peer,
            session: sessions[0].clone(),
            body: Body::Close(Default::default()),
        })
        .await;
    assert!(sessions.iter().all(|s| s.cancel.is_cancelled()));
    assert!(runtime.peers.is_empty() && runtime.probes.is_empty());
    for task in tasks {
        tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap();
    }
    println!("Noise owner Close: all 20 receiver tasks joined; streams=0");
    drop(clients);
}

#[tokio::test]
async fn stream_budget_real_noise_two_crossed_first_flights_and_stop() {
    let (mut runtime, mut events) = runtime();
    let keys = budget_keys(&mut runtime);
    let (mut outbound, first, task1, peer) = budget_noise(&mut runtime, keys.clone(), true).await;
    let (mut inbound, second, task2, _) = budget_noise(&mut runtime, keys, false).await;
    outbound.send(data()).await.unwrap();
    let Body::Data(mut other) = data() else {
        unreachable!()
    };
    other.message_id = vec![10; 16];
    inbound.send(Body::Data(other)).await.unwrap();
    // Both real encrypted first frames are queued behind their own Up installation.
    let mut frames = 0;
    while frames < 2 {
        let next = tokio::time::timeout(Duration::from_secs(2), runtime.inbox.recv())
            .await
            .unwrap()
            .unwrap();
        if matches!(
            &next,
            Incoming::Frame {
                body: Body::Data(_),
                ..
            }
        ) {
            frames += 1;
        }
        runtime.receive(next).await;
    }
    assert_eq!(received(&mut events), 2);
    assert_eq!(runtime.business_streams(), 2);
    assert!(!first.cancel.is_cancelled() && !second.cancel.is_cancelled());
    // Each ACK is bound to its original receiving stream, never the peer's
    // arbitrary current output owner (both first flights are independently live).
    for (remote, message_id) in [(&mut outbound, 9), (&mut inbound, 10)] {
        let mut acks = BTreeSet::new();
        while acks.len() < 2 {
            let frame = tokio::time::timeout(Duration::from_secs(2), remote.recv())
                .await
                .unwrap()
                .unwrap();
            if let Some(Body::DataAck(a)) = frame.body {
                assert_eq!(a.message_id, vec![message_id; 16]);
                acks.insert(a.stage);
            }
        }
        assert_eq!(acks, BTreeSet::from([1, 2]));
    }
    runtime.stop_network().await;
    assert!(first.cancel.is_cancelled() && second.cancel.is_cancelled());
    assert!(runtime.peers.is_empty() && runtime.probes.is_empty());
    for task in [task1, task2] {
        tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap();
    }
    reopen(&mut runtime, 2);
    let stale = Session {
        cancel: CancellationToken::new(),
        ..first
    };
    runtime
        .receive(Incoming::Frame {
            id: peer,
            session: stale.clone(),
            body: data(),
        })
        .await;
    assert_eq!(received(&mut events), 0);
    assert_eq!(runtime.business_streams(), 0);
    let (notification, _out) = up(&stale);
    runtime.receive(notification).await;
    assert!(stale.cancel.is_cancelled());
}

#[tokio::test]
async fn stream_budget_probes_have_separate_bounded_capacity() {
    let (mut runtime, _) = runtime();
    let mut outputs = Vec::new();
    for n in 1..=16 {
        let s = session(&runtime, n);
        let (notification, out) = up(&s);
        runtime.receive(notification).await;
        assert!(!s.cancel.is_cancelled());
        outputs.push(out);
    }
    assert_eq!(runtime.business_streams(), 16);
    for n in 17..=65 {
        let s = session(&runtime, n);
        s.business.store(false, Ordering::Release);
        let (notification, out) = up(&s);
        runtime.receive(notification).await;
        assert_eq!(s.cancel.is_cancelled(), n == 65);
        outputs.push(out);
    }
    assert_eq!(runtime.probes.len(), 15 + 48);
    let before: Vec<_> = runtime
        .peers
        .values()
        .chain(runtime.probes.values())
        .map(|p| p.session.clone())
        .collect();
    runtime.stop_network().await;
    assert!(before.iter().all(|s| s.cancel.is_cancelled()));
    assert!(runtime.probes.is_empty() && runtime.peers.is_empty());
}

#[tokio::test]
async fn stream_budget_replacing_cancelled_owner_retires_old_boot_aliases() {
    let (mut runtime, _) = runtime();
    let old = session(&runtime, 1);
    let (notification, _out1) = up(&old);
    runtime.receive(notification).await;
    let alias = session(&runtime, 2);
    let (notification, _out2) = up(&alias);
    runtime.receive(notification).await;
    old.cancel.cancel();
    let fresh = session(&runtime, 3);
    let (mut notification, _out3) = up(&fresh);
    if let Incoming::Up { bind, .. } = &mut notification {
        bind.boot_id = vec![9; 16];
    }
    runtime.receive(notification).await;
    assert!(alias.cancel.is_cancelled());
    runtime
        .receive(Incoming::Down {
            id: PEER.to_vec(),
            session: old,
        })
        .await;
    assert!(!fresh.cancel.is_cancelled());
    assert!(runtime.peers[PEER.as_slice()].session.same_instance(&fresh));
    assert_eq!(runtime.business_streams(), 1);
}
