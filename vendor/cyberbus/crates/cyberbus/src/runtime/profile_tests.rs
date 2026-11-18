fn profile_command(body: pb::sdk_command::Body) -> pb::SdkCommand {
    pb::SdkCommand {
        command_id: noise::random_bytes::<16>().unwrap().to_vec(),
        body: Some(body),
    }
}

// Uses real Noise, owner installation and the SDK Data/ACK path over duplex IO.
// A delayed peer reproduces a path that the old outer two-second cap rejected.
#[tokio::test(start_paused = true)]
async fn delayed_business_noise_and_expired_owner_up_are_fenced() {
    for (budget, owner_delay, accepted) in [(10, 0, true), (1, 0, false), (4, 2, false)] {
        let (mut runtime, mut events) = runtime();
        let keys = budget_keys(&mut runtime);
        let (a, b) = tokio::io::duplex(128 * 1024);
        let expected = noise::device_id(&noise::static_public_key(&[42; 32]).unwrap()).to_vec();
        let (reply, ready) = tokio::sync::oneshot::channel();
        let stop = runtime.stop.child_token();
        let began = tokio::time::Instant::now();
        let task = tokio::spawn(session::handshake(
            Box::new(a),
            "10.144.0.2".parse().unwrap(),
            true,
            keys,
            runtime.admission.clone(),
            runtime.incoming.clone(),
            stop.clone(),
            1,
            0,
            true,
            Some(session::BusinessReady {
                deadline: began + Duration::from_secs(budget),
                expected: expected.clone(),
                reply,
            }),
        ));
        let remote = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3)).await;
            noise::accept(
                b,
                noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
                |_| Ok(()),
            )
            .await
        });
        if budget == 1 {
            assert!(!task.await.unwrap());
            assert!(ready.await.is_err());
            assert!(
                runtime.inbox.try_recv().is_err(),
                "expired acquisition cannot publish Up or Data"
            );
            assert!(remote.await.unwrap().is_err());
            continue;
        }
        let mut remote = remote.await.unwrap().unwrap();
        assert_eq!(began.elapsed(), Duration::from_secs(3));
        let up = runtime.inbox.recv().await.unwrap();
        if owner_delay > 0 {
            tokio::time::advance(Duration::from_secs(owner_delay)).await;
        }
        runtime.receive(up).await;
        assert_eq!(ready.await.unwrap().is_ok(), accepted);
        if accepted {
            assert!(runtime.peers.contains_key(&expected));
            remote.send(data()).await.unwrap();
            let frame = runtime.inbox.recv().await.unwrap();
            runtime.receive(frame).await;
            assert_eq!(received(&mut events), 1);
            let mut stages = Vec::new();
            while stages.len() < 2 {
                if let Some(Body::DataAck(ack)) = remote.recv().await.unwrap().body {
                    stages.push(ack.stage);
                }
            }
            assert_eq!(
                stages,
                [pb::AckStage::Received as i32, pb::AckStage::Accepted as i32]
            );
        } else {
            assert!(
                !runtime.peers.contains_key(&expected),
                "expired Up cannot install a business session"
            );
            assert!(runtime.pending.is_empty());
        }
        stop.cancel();
        drop(remote);
        task.await.unwrap();
    }
}

fn update_profile(name: &str, expected_revision: u64) -> pb::SdkCommand {
    profile_command(pb::sdk_command::Body::UpdatePublicProfile(
        pb::UpdatePublicProfile {
            profile: Some(pb::PublicProfile {
                device_name: name.into(),
                config_semantic_version: "1.0.0".into(),
                ..Default::default()
            }),
            expected_revision,
            update_mask: Some(prost_types::FieldMask {
                paths: vec!["device_name".into(), "config_semantic_version".into()],
            }),
        },
    ))
}

#[tokio::test(start_paused = true)]
async fn inbound_noise_accepts_a_peer_delayed_beyond_old_two_second_cap() {
    let (mut runtime, _events) = runtime();
    let keys = budget_keys(&mut runtime);
    let (a, b) = tokio::io::duplex(128 * 1024);
    let stop = runtime.stop.child_token();
    let began = tokio::time::Instant::now();
    let task = tokio::spawn(session::handshake(
        Box::new(a),
        "10.144.0.2".parse().unwrap(),
        false,
        keys,
        runtime.admission.clone(),
        runtime.incoming.clone(),
        stop.clone(),
        1,
        0,
        false,
        None,
    ));
    let remote = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        noise::connect(
            b,
            noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
            |_| Ok(()),
        )
        .await
        .unwrap()
    })
    .await
    .unwrap();
    let up = runtime.inbox.recv().await.unwrap();
    assert_eq!(began.elapsed(), Duration::from_secs(3));
    assert!(matches!(&up, Incoming::Up { ready: None, .. }));
    runtime.receive(up).await;
    assert_eq!(runtime.probes.len(), 1);
    stop.cancel();
    drop(remote);
    assert!(task.await.unwrap());
}

#[tokio::test(start_paused = true)]
async fn profile_unpromoted_probe_still_expires_at_original_deadline() {
    let (runtime, _events) = runtime();
    let keys = Arc::new(Keys {
        private: Zeroizing::new(runtime.auth.identity().with_private_key(|k| *k)),
        psk: Zeroizing::new([9; 32]),
        binding: [8; 32],
        boot: *runtime.auth.identity().boot_id(),
    });
    let (a, b) = tokio::io::duplex(128 * 1024);
    let mut inbox = runtime.inbox;
    let handshake = tokio::spawn(session::handshake(
        Box::new(a),
        std::net::Ipv4Addr::new(10, 0, 0, 2),
        false,
        keys,
        runtime.admission.clone(),
        runtime.incoming.clone(),
        runtime.stop.clone(),
        1,
        0,
        false,
        None,
    ));
    let _remote = noise::connect(
        b,
        noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
        |_| Ok(()),
    )
    .await
    .unwrap();
    // Keep Up (including its sender) alive so only the probe timer can close it.
    let up = inbox.recv().await.unwrap();
    let Incoming::Up { session, .. } = &up else {
        panic!("expected Up")
    };
    tokio::time::advance(Duration::from_secs(4)).await;
    assert!(!session.cancel.is_cancelled());
    tokio::time::advance(Duration::from_secs(1)).await;
    assert!(handshake.await.unwrap());
    assert!(session.progress.io_ended.is_cancelled());
    assert!(
        !session.cancel.is_cancelled(),
        "normal expiry awaits ordered owner Down"
    );
    assert!(matches!(inbox.recv().await.unwrap(), Incoming::Down { .. }));
}

// The older output owner is controlled by the fixture. The crossed stream uses
// the real Noise reader/writer, including its initially armed probe deadline.
// After setup, commands and events go through the public Client and its owner.
#[tokio::test(start_paused = true)]
async fn profile_crossed_stream_survives_probe_deadline_and_delivers_public_updates() {
    let (mut runtime, mut events) = runtime();
    runtime.dispatch(update_profile("local", 0)).await.unwrap();
    let remote_id = noise::device_id(&noise::static_public_key(&[42; 32]).unwrap()).to_vec();
    let owner = session(&runtime, 1);
    let (mut notification, mut owner_output) = up(&owner);
    if let Incoming::Up { id, bind, .. } = &mut notification {
        *id = remote_id.clone();
        bind.device_id = remote_id.clone();
        bind.installation_public_key = noise::static_public_key(&[42; 32]).unwrap().to_vec();
    }
    runtime.receive(notification).await;
    owner_output.try_recv().unwrap();
    runtime
        .receive(Incoming::Frame {
            id: remote_id.clone(),
            session: owner.clone(),
            body: metadata("remote"),
        })
        .await;

    let keys = Arc::new(Keys {
        private: Zeroizing::new(runtime.auth.identity().with_private_key(|k| *k)),
        psk: Zeroizing::new([9; 32]),
        binding: [8; 32],
        boot: *runtime.auth.identity().boot_id(),
    });
    let (a, b) = tokio::io::duplex(128 * 1024);
    let handshake = tokio::spawn(session::handshake(
        Box::new(a),
        std::net::Ipv4Addr::new(10, 0, 0, 2),
        false,
        keys,
        runtime.admission.clone(),
        runtime.incoming.clone(),
        runtime.stop.clone(),
        1,
        0,
        false,
        None,
    ));
    let mut remote = noise::connect(
        b,
        noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
        |_| Ok(()),
    )
    .await
    .unwrap();
    let notification = runtime.inbox.recv().await.unwrap();
    let Incoming::Up {
        session: crossed, ..
    } = &notification
    else {
        panic!("expected Up")
    };
    let crossed = crossed.clone();
    runtime.receive(notification).await;
    assert!(matches!(
        remote.recv().await.unwrap().body,
        Some(Body::Metadata(_))
    ));
    // Let the writer wait with the transient timer armed, then promote through
    // actual incoming Data. Drain its ingress-owned ACKs, then leave the writer
    // idle to exercise the armed transient timer after business promotion.
    tokio::task::yield_now().await;
    remote.send(data()).await.unwrap();
    let notification = runtime.inbox.recv().await.unwrap();
    runtime.receive(notification).await;
    assert!(crossed.business.load(Ordering::Acquire));
    assert!(runtime.peers[&remote_id].session.same_instance(&owner));
    for stage in [1, 2] {
        assert!(matches!(remote.recv().await.unwrap().body,
            Some(Body::DataAck(a)) if a.stage == stage));
    }
    assert!(owner_output.try_recv().is_err());
    assert_eq!(received(&mut events), 1);

    let stop = runtime.stop.clone();
    let closure = runtime.close_result.clone();
    let (commands, rx) = mpsc::channel(64);
    let client = crate::Client {
        inner: Arc::new(crate::Inner {
            closure,
            commands,
            events: tokio::sync::Mutex::new(Some(events)),
        }),
    };
    let owner_task = tokio::spawn(runtime.run(rx));
    let mut events = client.take_event_receiver().await.unwrap();
    let watch = vec![5; 16];
    let result = client
        .execute(profile_command(pb::sdk_command::Body::WatchDevices(
            pb::WatchDevices {
                watch_id: watch.clone(),
            },
        )))
        .await;
    assert!(matches!(result.body, Some(ResultBody::Ok(_))));
    let initial = events.recv().await.unwrap();
    codec::encode(&initial).unwrap();
    let Some(Event::Devices(initial)) = initial.body else {
        panic!("expected snapshot")
    };
    assert!(matches!(
        initial.body,
        Some(pb::devices_event::Body::Snapshot(_))
    ));

    tokio::time::advance(Duration::from_secs(6)).await;
    tokio::task::yield_now().await;
    assert!(
        !crossed.cancel.is_cancelled(),
        "business promotion must supersede the armed probe timer"
    );

    let result = client.execute(update_profile("local-updated", 1)).await;
    codec::encode(&result).unwrap();
    assert!(
        matches!(result.body, Some(ResultBody::PublicProfile(ref p)) if p.config_revision == 2),
        "{result:?}"
    );
    let sent = remote.recv().await.unwrap();
    assert!(
        matches!(sent.body, Some(Body::Metadata(ref m)) if m.profile.as_ref().is_some_and(|p| p.device_name == "local-updated" && p.config_revision == 2))
    );
    let Body::Metadata(mut changed) = metadata("remote-updated") else {
        unreachable!()
    };
    changed.profile.as_mut().unwrap().config_revision = 2;
    remote.send(Body::Metadata(changed)).await.unwrap();
    let mut previous = initial.revision;
    // The local update precedes the remote update, with no reset or revision gap.
    for expected_name in ["local-updated", "remote-updated"] {
        let event = tokio::time::timeout(Duration::from_secs(1), events.recv())
            .await
            .unwrap()
            .unwrap();
        codec::encode(&event).unwrap();
        let Some(Event::Devices(d)) = event.body else {
            panic!("expected directory update")
        };
        assert_eq!(d.watch_id, watch);
        assert_eq!(d.previous_revision, previous);
        assert_eq!(d.revision, previous + 1);
        previous = d.revision;
        let Some(pb::devices_event::Body::Updated(u)) = d.body else {
            panic!("expected updated, not reset")
        };
        let device = u.device.unwrap();
        let profile = device.profile.unwrap();
        assert_eq!(profile.device_name, expected_name);
        assert_eq!(profile.config_revision, 2);
        if expected_name == "remote-updated" {
            assert_eq!(device.device_id, remote_id);
        }
        let fields = u.changed_fields.unwrap().paths;
        assert!(fields.contains(&"profile.device_name".into()));
        assert!(fields.contains(&"profile.config_revision".into()));
    }
    let stale = client.execute(update_profile("stale", 1)).await;
    assert!(
        matches!(stale.body, Some(ResultBody::Error(e)) if e.code == pb::ErrorCode::StaleRevision as i32)
    );
    let query_id = vec![6; 16];
    let result = client
        .execute(profile_command(pb::sdk_command::Body::GetDevices(
            pb::GetDevices {
                query_id: query_id.clone(),
            },
        )))
        .await;
    assert!(matches!(result.body, Some(ResultBody::Ok(_))));
    let snapshot = events.recv().await.unwrap();
    codec::encode(&snapshot).unwrap();
    let Some(Event::DevicesQuery(query)) = snapshot.body else {
        panic!("expected query terminal")
    };
    assert_eq!(query.query_id, query_id);
    let Some(pb::devices_query_result::Result::Snapshot(snapshot)) = query.result else {
        panic!("expected snapshot")
    };
    assert_eq!(snapshot.revision, previous);
    let remote = snapshot
        .devices
        .iter()
        .find(|d| d.device_id == remote_id)
        .unwrap();
    assert_eq!(
        remote.profile.as_ref().unwrap().device_name,
        "remote-updated"
    );
    assert_eq!(remote.profile.as_ref().unwrap().config_revision, 2);
    stop.cancel();
    drop(client);
    owner_task.await.unwrap();
    handshake.await.unwrap();
}

// Authenticated Metadata queued before normal Down remains admissible even if
// the owner runs after EOF or the unchanged probe deadline. Explicit revocation
// is covered separately and must still fence every queued frame.
#[tokio::test(start_paused = true)]
async fn probe_metadata_prefix_survives_eof_and_original_deadline() {
    for outbound in [false, true] {
        for ending in ["dispatch_first", "remote_eof", "probe_deadline"] {
            let (mut runtime, _events) = runtime();
            let keys = budget_keys(&mut runtime);
            let (a, b) = tokio::io::duplex(128 * 1024);
            let task = tokio::spawn(session::handshake_tracked(
                Box::new(a),
                std::net::Ipv4Addr::new(10, 0, 0, 2),
                outbound,
                keys,
                runtime.admission.clone(),
                runtime.incoming.clone(),
                runtime.stop.clone(),
                1,
                0,
                session::BusinessFlag::default(),
                None,
                Arc::default(),
            ));
            let config = noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]);
            let mut remote = if outbound {
                noise::accept(b, config, |_| Ok(())).await.unwrap()
            } else {
                noise::connect(b, config, |_| Ok(())).await.unwrap()
            };
            let up = runtime.inbox.recv().await.unwrap();
            let Incoming::Up { id, session, .. } = &up else {
                panic!("expected authenticated Up")
            };
            let (id, current) = (id.clone(), session.clone());
            runtime.receive(up).await;
            assert!(runtime.connection(&id, &current).is_some());
            assert!(matches!(
                remote.recv().await.unwrap().body,
                Some(Body::Metadata(_))
            ));
            let body = metadata("authenticated-remote");
            if let Body::Metadata(m) = &body {
                codec::encode(m).unwrap();
            }
            remote.send(body).await.unwrap();
            let frame = runtime.inbox.recv().await.unwrap();
            assert!(matches!(
                &frame,
                Incoming::Frame {
                    body: Body::Metadata(_),
                    ..
                }
            ));
            assert!(!current.cancel.is_cancelled());
            assert!(!runtime.devices.contains_key(&id));
            let decoded_at = tokio::time::Instant::now();
            if ending == "dispatch_first" {
                runtime.receive(frame).await;
                assert_eq!(
                    runtime.devices[&id].profile.as_ref().unwrap().device_name,
                    "authenticated-remote"
                );
                drop(remote);
                assert!(task.await.unwrap());
            } else {
                if ending == "remote_eof" {
                    drop(remote);
                } else {
                    // No CPU burn or real sleep: represent the owner not running
                    // until the unchanged five-second probe budget has expired.
                    tokio::time::advance(Duration::from_secs(5)).await;
                }
                assert!(
                    task.await.unwrap(),
                    "Noise succeeds despite lost declaration"
                );
                assert!(current.progress.io_ended.is_cancelled());
                assert!(!current.cancel.is_cancelled());
                runtime.receive(frame).await;
                assert!(
                    runtime.devices.contains_key(&id),
                    "valid Metadata precedes normal Down"
                );
            }
            let down = runtime.inbox.recv().await.unwrap();
            assert!(
                matches!(down, Incoming::Down { .. }),
                "Metadata preceded Down in the FIFO"
            );
            runtime.receive(down).await;
            assert!(runtime.probes.is_empty());
            assert!(runtime.peers.is_empty());
            eprintln!("metadata diagnosis: outbound={outbound} ending={ending} noise_verified=true directory_present={} decoded_to_dispatch_ms={}",
                      runtime.devices.contains_key(&id), decoded_at.elapsed().as_millis());
        }
    }
}

#[tokio::test(start_paused = true)]
async fn probe_noise_success_without_metadata_remains_incomplete() {
    for outbound in [false, true] {
        let (mut runtime, _events) = runtime();
        let keys = budget_keys(&mut runtime);
        let (a, b) = tokio::io::duplex(128 * 1024);
        let task = tokio::spawn(session::handshake_tracked(
            Box::new(a),
            std::net::Ipv4Addr::new(10, 0, 0, 2),
            outbound,
            keys,
            runtime.admission.clone(),
            runtime.incoming.clone(),
            runtime.stop.clone(),
            1,
            0,
            session::BusinessFlag::default(),
            None,
            Arc::default(),
        ));
        let config = noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]);
        let mut remote = if outbound {
            noise::accept(b, config, |_| Ok(())).await.unwrap()
        } else {
            noise::connect(b, config, |_| Ok(())).await.unwrap()
        };
        let up = runtime.inbox.recv().await.unwrap();
        let Incoming::Up { id, session, .. } = &up else {
            panic!("expected Up")
        };
        let (id, current) = (id.clone(), session.clone());
        runtime.receive(up).await;
        assert!(matches!(
            remote.recv().await.unwrap().body,
            Some(Body::Metadata(_))
        ));
        tokio::time::advance(Duration::from_secs(4)).await;
        assert!(!current.cancel.is_cancelled());
        tokio::time::advance(Duration::from_secs(1)).await;
        assert!(task.await.unwrap());
        assert!(current.progress.io_ended.is_cancelled());
        assert!(!current.cancel.is_cancelled());
        let down = runtime.inbox.recv().await.unwrap();
        let completion = tokio::spawn(crate::discovery::complete_probe(
            true,
            current.progress.clone(),
            runtime.stop.clone(),
            runtime.incoming.clone(),
        ));
        tokio::task::yield_now().await;
        assert!(!completion.is_finished());
        runtime.receive(down).await;
        assert_eq!(completion.await.unwrap(), (false, false));
        assert!(!runtime.devices.contains_key(&id));
        assert!(!runtime.evidence.health.contains_key(&id));
        assert!(current.cancel.is_cancelled());
        assert!(current.progress.owner_done.is_cancelled());
        assert!(!current.progress.metadata.load(Ordering::Acquire));
        eprintln!("metadata diagnosis: outbound={outbound} no_metadata=true probe_expired_ms=5000 noise_verified=true directory_present=false");
    }
}

// Explicitly opt-in and small. Measures this dev/test opt-level=0 protocol path,
// not host capacity, EasyTier, OAuth, or a release-build prediction.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "bounded diagnostic microbench; run explicitly with --ignored --nocapture"]
async fn diagnosis_noise_debug_cost_sample() {
    async fn sample() -> (u128, u128) {
        let began = std::time::Instant::now();
        let (a, b) = tokio::io::duplex(128 * 1024);
        let (left, right) = tokio::join!(
            noise::connect(
                a,
                noise::NoiseConfig::new([10; 32], [9; 32], [8; 32], "1", [7; 16]),
                |_| Ok(())
            ),
            noise::accept(
                b,
                noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
                |_| Ok(())
            ),
        );
        let (mut left, mut right) = (left.unwrap(), right.unwrap());
        let handshake_us = began.elapsed().as_micros();
        left.send(metadata("left")).await.unwrap();
        assert!(matches!(
            right.recv().await.unwrap().body,
            Some(Body::Metadata(_))
        ));
        right.send(metadata("right")).await.unwrap();
        assert!(matches!(
            left.recv().await.unwrap().body,
            Some(Body::Metadata(_))
        ));
        (handshake_us, began.elapsed().as_micros())
    }
    for concurrency in [1, 16] {
        let began = std::time::Instant::now();
        let mut samples = Vec::new();
        // Exactly 32 handshakes per mode; no external traffic or process fan-out.
        for _ in 0..32 / concurrency {
            let mut owners = tokio::task::JoinSet::new();
            for _ in 0..concurrency {
                owners.spawn(sample());
            }
            while let Some(result) = owners.join_next().await {
                samples.push(result.unwrap());
            }
        }
        let wall_ms = began.elapsed().as_millis();
        let mut noise: Vec<_> = samples.iter().map(|s| s.0).collect();
        let mut complete: Vec<_> = samples.iter().map(|s| s.1).collect();
        noise.sort_unstable();
        complete.sort_unstable();
        eprintln!("noise microbench: opt_level=0 workers=2 concurrency={concurrency} samples=32 wall_ms={wall_ms} noise_us_p50={} p95={} max={} metadata_roundtrip_us_p50={} p95={} max={}",
                  noise[15], noise[30], noise[31], complete[15], complete[30], complete[31]);
    }
}

// Both endpoints follow production behavior: the outbound owner cancels its
// transient stream after consuming the peer's Metadata. The other owner has
// already received/decrypted its Metadata but has not dispatched it yet.
#[tokio::test(start_paused = true)]
async fn two_runtime_normal_probe_close_commits_both_metadata_prefixes() {
    let (mut left, _left_events) = runtime();
    let (mut right, _right_events) = runtime();
    let left_keys = budget_keys(&mut left);
    let right_keys = budget_keys(&mut right);
    let (a, b) = tokio::io::duplex(128 * 1024);
    let left_task = tokio::spawn(session::handshake_tracked(
        Box::new(a),
        std::net::Ipv4Addr::new(10, 0, 0, 2),
        true,
        left_keys,
        left.admission.clone(),
        left.incoming.clone(),
        left.stop.clone(),
        1,
        0,
        session::BusinessFlag::default(),
        None,
        Arc::default(),
    ));
    let right_task = tokio::spawn(session::handshake_tracked(
        Box::new(b),
        std::net::Ipv4Addr::new(10, 0, 0, 1),
        false,
        right_keys,
        right.admission.clone(),
        right.incoming.clone(),
        right.stop.clone(),
        1,
        0,
        session::BusinessFlag::default(),
        None,
        Arc::default(),
    ));
    let left_up = left.inbox.recv().await.unwrap();
    let right_up = right.inbox.recv().await.unwrap();
    let Incoming::Up {
        id: right_id,
        session: left_session,
        ..
    } = &left_up
    else {
        panic!("left Up")
    };
    let Incoming::Up {
        id: left_id,
        session: right_session,
        ..
    } = &right_up
    else {
        panic!("right Up")
    };
    let (right_id, left_id) = (right_id.clone(), left_id.clone());
    let (left_session, right_session) = (left_session.clone(), right_session.clone());
    left.receive(left_up).await;
    right.receive(right_up).await;
    let left_frame = left.inbox.recv().await.unwrap();
    let right_frame = right.inbox.recv().await.unwrap();
    assert!(matches!(
        &left_frame,
        Incoming::Frame {
            body: Body::Metadata(_),
            ..
        }
    ));
    assert!(matches!(
        &right_frame,
        Incoming::Frame {
            body: Body::Metadata(_),
            ..
        }
    ));
    assert!(!left_session.cancel.is_cancelled());
    assert!(!right_session.cancel.is_cancelled());
    let before_dispatch = tokio::time::Instant::now();
    left.receive(left_frame).await;
    assert!(left.devices.contains_key(&right_id));
    assert!(
        left_session.progress.io_ended.is_cancelled(),
        "normal outbound Metadata handling ends IO, not owner authority"
    );
    assert!(left_task.await.unwrap());
    assert!(right_task.await.unwrap());
    assert_eq!(
        before_dispatch.elapsed(),
        Duration::ZERO,
        "no timer expiry or artificial delay needed"
    );
    assert!(right_session.progress.io_ended.is_cancelled());
    assert!(!right_session.cancel.is_cancelled());
    right.receive(right_frame).await;
    assert!(
        right.devices.contains_key(&left_id),
        "normal peer close preserves the authenticated FIFO prefix"
    );
    let left_down = left.inbox.recv().await.unwrap();
    let right_down = right.inbox.recv().await.unwrap();
    assert!(matches!(left_down, Incoming::Down { .. }));
    assert!(matches!(right_down, Incoming::Down { .. }));
    left.receive(left_down).await;
    right.receive(right_down).await;
    assert!(left.probes.is_empty() && right.probes.is_empty());
    eprintln!("metadata diagnosis: two_production_endpoints=true valid_metadata_queued_both=true elapsed_ms=0 outbound_directory=true inbound_directory=true noise_verified_both=true");
}

struct EndedProbePrefix {
    runtime: Runtime,
    up: Incoming,
    metadata: Incoming,
    down: Incoming,
    current: Session,
    id: Vec<u8>,
    ready: Option<tokio::sync::oneshot::Receiver<PResult<()>>>,
}

// All three notifications are produced by the real Noise/session task, with IO
// already ended before the owner dispatches even Up. No security fence is relaxed.
async fn ended_probe_prefix(business: bool) -> EndedProbePrefix {
    let (mut runtime, _events) = runtime();
    let keys = budget_keys(&mut runtime);
    let (a, b) = tokio::io::duplex(128 * 1024);
    let expected = noise::device_id(&noise::static_public_key(&[42; 32]).unwrap()).to_vec();
    let (reply, ready) = tokio::sync::oneshot::channel();
    let ready_reply = business.then_some(session::BusinessReady {
        deadline: tokio::time::Instant::now() + Duration::from_secs(2),
        expected,
        reply,
    });
    let flag = session::BusinessFlag::default();
    flag.store(business, Ordering::Release);
    let task = tokio::spawn(session::handshake_tracked(
        Box::new(a),
        std::net::Ipv4Addr::new(10, 0, 0, 2),
        false,
        keys,
        runtime.admission.clone(),
        runtime.incoming.clone(),
        runtime.stop.clone(),
        1,
        0,
        flag,
        ready_reply,
        Arc::default(),
    ));
    let mut remote = noise::connect(
        b,
        noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
        |_| Ok(()),
    )
    .await
    .unwrap();
    let up = runtime.inbox.recv().await.unwrap();
    let Incoming::Up { id, session, .. } = &up else {
        panic!("Up")
    };
    let (id, current) = (id.clone(), session.clone());
    remote.send(metadata("prefix-before-close")).await.unwrap();
    let metadata = runtime.inbox.recv().await.unwrap();
    assert!(matches!(
        &metadata,
        Incoming::Frame {
            body: Body::Metadata(_),
            ..
        }
    ));
    drop(remote);
    assert!(task.await.unwrap());
    let down = runtime.inbox.recv().await.unwrap();
    assert!(matches!(down, Incoming::Down { .. }));
    assert!(current.progress.io_ended.is_cancelled());
    assert!(!current.cancel.is_cancelled());
    EndedProbePrefix {
        runtime,
        up,
        metadata,
        down,
        current,
        id,
        ready: business.then_some(ready),
    }
}

#[tokio::test(start_paused = true)]
async fn ended_probe_prefix_preserves_security_revocation_before_up_or_metadata() {
    for installed in [false, true] {
        for fence in [
            "none",
            "explicit_cancel",
            "stop",
            "new_generation",
            "block_unblock",
        ] {
            let EndedProbePrefix {
                mut runtime,
                up,
                metadata,
                down,
                current,
                id,
                ..
            } = ended_probe_prefix(false).await;
            let mut up = Some(up);
            if installed {
                runtime.receive(up.take().unwrap()).await;
            }
            match fence {
                "none" => {}
                "explicit_cancel" => current.cancel.cancel(),
                "stop" => runtime.stop.cancel(),
                "new_generation" => reopen(&mut runtime, 2),
                "block_unblock" => {
                    // Exercise block's native deny/cancel boundary and successful
                    // unblock, without injecting the OAuth needed for persistence.
                    runtime.admission.policy.lock().unwrap().deny(id.clone());
                    if installed {
                        runtime
                            .probes
                            .remove(&current.id)
                            .unwrap()
                            .session
                            .cancel
                            .cancel();
                    }
                    runtime.admission.policy.lock().unwrap().blocked.remove(&id);
                }
                _ => unreachable!(),
            }
            if let Some(up) = up {
                runtime.receive(up).await;
            }
            // Maintenance must not erase a normally ended but not yet revoked
            // probe, nor reopen one rejected by any security boundary.
            runtime.directory_maintenance().await;
            runtime.receive(metadata).await;
            assert_eq!(
                runtime.devices.contains_key(&id),
                fence == "none",
                "installed={installed} fence={fence}"
            );
            assert_eq!(
                current.progress.metadata.load(Ordering::Acquire),
                fence == "none"
            );
            assert!(runtime.ensure_peer(&id).await.is_err());
            assert!(runtime.promote(&id, &current).is_err());
            runtime.receive(down).await;
            assert!(current.cancel.is_cancelled());
            assert!(current.progress.owner_done.is_cancelled());
            assert!(runtime.probes.is_empty() && runtime.peers.is_empty());
        }
    }
}

#[tokio::test(start_paused = true)]
async fn dead_io_rejects_business_ready_but_commits_valid_metadata_before_down() {
    let EndedProbePrefix {
        mut runtime,
        up,
        metadata,
        down,
        current,
        id,
        ready,
    } = ended_probe_prefix(true).await;
    let completion = tokio::spawn(crate::discovery::complete_probe(
        true,
        current.progress.clone(),
        runtime.stop.clone(),
        runtime.incoming.clone(),
    ));
    tokio::task::yield_now().await;
    assert!(
        !completion.is_finished(),
        "discovery waits for the serialized owner"
    );
    runtime.receive(up).await;
    let failure = ready.unwrap().await.unwrap().unwrap_err();
    assert_eq!(failure.code, pb::ErrorCode::DeviceUnreachable as i32);
    assert!(runtime.ensure_peer(&id).await.is_err());
    assert!(runtime.promote(&id, &current).is_err());
    runtime.receive(metadata).await;
    assert!(runtime.devices.contains_key(&id));
    assert!(
        !completion.is_finished(),
        "Metadata does not end owner task accounting"
    );
    runtime.receive(down).await;
    assert_eq!(completion.await.unwrap(), (true, false));
    assert_eq!(runtime.business_streams(), 0);
}

#[tokio::test(start_paused = true)]
async fn noise_session_address_fence_rejects_old_generation_and_nonready_status() {
    let EndedProbePrefix { current, .. } = ended_probe_prefix(false).await;
    let mut status = cyberbus_transport::TransportStatus {
        ipv4: std::net::Ipv4Addr::new(10, 0, 0, 1),
        peer_id: 1,
        generation: current.address_generation,
        phase: cyberbus_transport::AddressPhase::Ready,
    };
    assert!(current.address_current(&status));
    status.generation += 1;
    assert!(!current.address_current(&status));
    status.generation = current.address_generation;
    for phase in [
        cyberbus_transport::AddressPhase::Changing,
        cyberbus_transport::AddressPhase::Closed,
        cyberbus_transport::AddressPhase::Tentative,
        cyberbus_transport::AddressPhase::Conflict,
    ] {
        status.phase = phase;
        assert!(!current.address_current(&status));
    }
}

#[tokio::test(start_paused = true)]
async fn down_handoff_without_owner_poll_is_interrupted_by_every_close_boundary() {
    for boundary in ["network_stop", "epoch", "explicit_cancel", "owner_gone"] {
        let EndedProbePrefix {
            mut runtime,
            up,
            metadata,
            down,
            current,
            ..
        } = ended_probe_prefix(false).await;
        let stop = runtime.stop.child_token();
        let mut owners = tokio::task::JoinSet::new();
        owners.spawn(crate::discovery::complete_probe(
            true,
            current.progress.clone(),
            stop.clone(),
            runtime.incoming.clone(),
        ));
        tokio::task::yield_now().await;
        assert!(
            owners.try_join_next().is_none(),
            "negative control: with owner alive, Down really blocks completion"
        );
        assert!(!current.progress.owner_done.is_cancelled());
        let began = tokio::time::Instant::now();
        match boundary {
            "network_stop" => runtime.stop_network().await,
            "epoch" => stop.cancel(),
            "explicit_cancel" => current.cancel.cancel(),
            "owner_gone" => drop(runtime),
            _ => unreachable!(),
        }
        assert_eq!(owners.join_next().await.unwrap().unwrap(), (false, false));
        assert!(owners.is_empty());
        assert_eq!(
            began.elapsed(),
            Duration::ZERO,
            "{boundary} must not wait for a new timeout"
        );
        assert!(
            !current.progress.owner_done.is_cancelled(),
            "fixture never consumed Down"
        );
        // Up/Metadata/Down remained unpolled throughout the join. Drop them only
        // afterward; their eventual destruction is not what wakes the waiter.
        drop((up, metadata, down));
    }
}

#[tokio::test(start_paused = true)]
async fn full_owner_inbox_cannot_deadlock_normal_down_publication_on_shutdown() {
    for boundary in ["network_stop", "epoch", "explicit_cancel", "owner_gone"] {
        let (mut runtime, _events) = runtime();
        let keys = budget_keys(&mut runtime);
        let epoch = runtime.stop.child_token();
        let owner = runtime.incoming.clone();
        let progress = Arc::<session::Progress>::default();
        let (a, b) = tokio::io::duplex(128 * 1024);
        let task = tokio::spawn(session::handshake_tracked(
            Box::new(a),
            std::net::Ipv4Addr::new(10, 0, 0, 2),
            false,
            keys,
            runtime.admission.clone(),
            owner.clone(),
            epoch.clone(),
            1,
            0,
            session::BusinessFlag::default(),
            None,
            progress.clone(),
        ));
        let mut remote = noise::connect(
            b,
            noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
            |_| Ok(()),
        )
        .await
        .unwrap();
        // Fill the actual unchanged128 inbox with its real Up plus127 encrypted
        // Metadata frames. The owner never polls any of this authenticated prefix.
        for _ in 0..127 {
            remote.send(metadata("pending-owner")).await.unwrap();
        }
        for _ in 0..256 {
            if runtime.inbox.len() == 128 {
                break;
            }
            tokio::task::yield_now().await;
        }
        assert_eq!(runtime.inbox.len(), 128);
        drop(remote);
        for _ in 0..32 {
            if progress.io_ended.is_cancelled() {
                break;
            }
            tokio::task::yield_now().await;
        }
        assert!(progress.io_ended.is_cancelled());
        assert!(
            !task.is_finished(),
            "negative control: full inbox blocks normal Down publication"
        );
        let began = tokio::time::Instant::now();
        match boundary {
            "network_stop" => runtime.stop.cancel(),
            "epoch" => epoch.cancel(),
            "explicit_cancel" => progress.revocation.get().unwrap().cancel(),
            "owner_gone" => drop(runtime),
            _ => unreachable!(),
        }
        let noise = task.await.unwrap();
        assert!(noise);
        assert_eq!(
            crate::discovery::complete_probe(noise, progress.clone(), epoch, owner).await,
            (false, false)
        );
        assert_eq!(began.elapsed(), Duration::ZERO);
        assert!(!progress.owner_done.is_cancelled());
    }
}
