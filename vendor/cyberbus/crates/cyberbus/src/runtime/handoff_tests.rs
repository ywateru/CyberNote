// No OAuth/transport/cohort: actual Noise on the acquiring stream; controlled
// older output owner. This is independent of the unexplained live cross3 FAIL.
#[tokio::test]
async fn crossed_incoming_survives_primary_eof_and_completes_over_live_noise() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let (mut runtime, mut events) = runtime();
        let keys = budget_keys(&mut runtime);
        let (old_remote, primary, primary_task, id) =
            budget_noise(&mut runtime, keys.clone(), true).await;
        let (mut new_remote, crossed, crossed_task, new_id) =
            budget_noise(&mut runtime, keys, false).await;
        assert_eq!(id, new_id);
        assert!(runtime.peers[&id].session.same_instance(&primary));
        assert!(matches!(new_remote.recv().await.unwrap().body, Some(Body::Metadata(_))));

        // Real inbound Data promotes the crossed receiver while the old output
        // is still live. The application has not completed it when EOF arrives.
        new_remote.send(data()).await.unwrap();
        budget_frame(&mut runtime, &crossed).await;
        assert!(primary.live() && crossed.live());
        assert!(crossed.business.load(Ordering::Acquire));
        assert!(runtime.probes.contains_key(&crossed.id));
        let deliveries: Vec<_> = std::iter::from_fn(|| events.try_recv().ok())
            .filter_map(|event| match event.body {
                Some(Event::DataReceived(data)) => Some(data),
                _ => None,
            }).collect();
        assert_eq!(deliveries.len(), 1);
        assert_eq!(deliveries[0].peer_device_id, id);
        assert_eq!(deliveries[0].message.as_ref().unwrap().message_id, vec![9; 16]);

        // Close only the primary remote IO, with no security cancellation,
        // policy change, new boot/generation or virtual-time advancement.
        drop(old_remote);
        loop {
            let notification = runtime.inbox.recv().await.unwrap();
            let primary_down = matches!(&notification, Incoming::Down { session, .. }
                if session.same_instance(&primary));
            runtime.receive(notification).await;
            if primary_down { break; }
        }
        let retained = crossed.live();
        let completion = runtime.dispatch_data(pb::sdk_command::Body::CompleteData(pb::CompleteData {
            peer_device_id: id.clone(), message_id: vec![9; 16],
            result: Some(pb::complete_data::Result::Stage(pb::AckStage::Processed as i32)),
        })).await;
        let delivered_ack = if retained && completion.is_ok() {
            let mut stages = Vec::new();
            for _ in 0..3 {
                match new_remote.recv().await.unwrap().body {
                    Some(Body::DataAck(ack)) if ack.message_id == vec![9; 16] => stages.push(ack.stage),
                    other => panic!("unexpected crossed reply: {other:?}"),
                }
            }
            stages == vec![1, 2, 3]
        } else { false };
        runtime.stop.cancel();
        assert!(primary_task.await.unwrap());
        assert!(crossed_task.await.unwrap());
        assert!(retained, "normal primary EOF revoked the healthy crossed Data receiver; CompleteData={completion:?}");
        assert!(completion.is_ok(), "delivered inbound Data must remain completable: {completion:?}");
        assert!(delivered_ack, "terminal ACK must traverse the surviving real Noise stream");
        assert_eq!(received(&mut events), 0, "handoff cannot redeliver Data");
    }).await.expect("bounded primary EOF/crossed incoming Noise fixture");
}

#[tokio::test]
async fn live_crossed_noise_stream_takes_output_after_old_owner_io_end() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let (mut runtime, mut events) = runtime();
        runtime.dispatch(update_profile("local", 0)).await.unwrap();
        let remote_key = [42; 32];
        let remote_public = noise::static_public_key(&remote_key).unwrap();
        let remote_id = noise::device_id(&remote_public).to_vec();
        let old = session(&runtime, 1);
        let (mut notification, old_output) = up(&old);
        if let Incoming::Up { id, bind, .. } = &mut notification {
            *id = remote_id.clone();
            bind.device_id = remote_id.clone();
            bind.installation_public_key = remote_public.to_vec();
        }
        runtime.receive(notification).await;
        let Body::Data(message) = data() else { unreachable!() };
        runtime.dispatch_data(pb::sdk_command::Body::Send(pb::Send {
            peer_device_id: remote_id.clone(), message: Some(message),
        })).await.unwrap();
        let keys = Arc::new(Keys {
            private: Zeroizing::new(runtime.auth.identity().with_private_key(|k| *k)),
            psk: Zeroizing::new([9; 32]), binding: [8; 32],
            boot: *runtime.auth.identity().boot_id(),
        });
        let (a, b) = tokio::io::duplex(128 * 1024);
        let (ready, installed) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(session::handshake(
            Box::new(a), "10.0.0.2".parse().unwrap(), true, keys,
            runtime.admission.clone(), runtime.incoming.clone(), runtime.stop.clone(),
            1, 0, true, Some(session::BusinessReady { deadline: tokio::time::Instant::now() + Duration::from_secs(2), expected: remote_id.clone(), reply: ready }),
        ));
        let mut remote = noise::accept(b,
            noise::NoiseConfig::new(remote_key, [9; 32], [8; 32], "1", [8; 16]), |_| Ok(())
        ).await.unwrap();
        let up = runtime.inbox.recv().await.unwrap();
        let Incoming::Up { session: crossed, .. } = &up else { panic!("expected actual Noise Up"); };
        let crossed = crossed.clone();
        runtime.receive(up).await;
        installed.await.unwrap().unwrap();
        assert!(matches!(remote.recv().await.unwrap().body, Some(Body::Metadata(_))));
        assert!(crossed.live() && crossed.business.load(Ordering::Acquire));
        assert!(runtime.probes.contains_key(&crossed.id));
        assert!(runtime.peers[&remote_id].session.same_instance(&old));

        // Exactly the normal-IO/owner-Down gap: no stop/cancel/block or new boot.
        old.progress.io_ended.cancel();
        drop(old_output);
        let admission = runtime.ensure_peer(&remote_id).await;
        let selected = runtime.peers[&remote_id].session.same_instance(&crossed);
        // The old queued Down must not revoke the chosen new output owner.
        if selected {
            runtime.receive(Incoming::Down { id: remote_id.clone(), session: old.clone() }).await;
            assert!(crossed.live());
        }
        let output = runtime.send_peer(&remote_id, Body::Ping(pb::Ping { nonce: vec![7; 16] }));
        let delivered = if selected && output.is_ok() {
            matches!(remote.recv().await.unwrap().body, Some(Body::Ping(p)) if p.nonce == vec![7; 16])
        } else { false };
        // Reclaim the real task before asserting the defect, including on old code.
        runtime.stop.cancel();
        assert!(task.await.unwrap());
        admission.unwrap();
        assert!(output.is_ok(), "ensure_peer accepted a healthy crossed stream but retained dead output: {output:?}");
        assert!(selected && delivered, "live acquired stream must become the actual output owner");
        assert!(!runtime.pending.contains_key(&(remote_id, vec![9; 16])));
        let statuses: Vec<_> = std::iter::from_fn(|| events.try_recv().ok()).filter_map(|e| {
            if let Some(Event::DataStatus(status)) = e.body { Some(status) } else { None }
        }).collect();
        assert_eq!(statuses.len(), 1, "old work must have exactly one terminal and no replay");
        assert!(matches!(&statuses[0].result, Some(pb::data_status::Result::Error(e))
            if e.code == pb::ErrorCode::UnknownOutcome as i32));
    }).await.expect("bounded real Noise handoff fixture");
}

#[tokio::test]
async fn crossed_handoff_keeps_existing_business_budget_and_revocation_fences() {
    {
        let (mut runtime, _) = runtime();
        let old = session(&runtime, 1);
        let (notification, _output) = up(&old);
        runtime.receive(notification).await;
        let crossed = session(&runtime, 2);
        let (notification, _crossed_output) = up(&crossed);
        runtime.receive(notification).await;
        let mut held_outputs = Vec::new();
        let mut others = Vec::new();
        for n in 3..=16 {
            let other = session(&runtime, n);
            let (mut notification, output) = up(&other);
            if let Incoming::Up { id, bind, .. } = &mut notification {
                *id = vec![n; 32];
                bind.device_id = id.clone();
            }
            runtime.receive(notification).await;
            held_outputs.push(output);
            others.push(other);
        }
        assert_eq!(runtime.business_streams(), 16);
        runtime.promote(&PEER, &crossed).unwrap();
        assert_eq!(runtime.business_streams(), 16);
        assert!(
            others.iter().all(Session::live),
            "already admitted crossed IO needs no extra permit/eviction"
        );
        old.progress.io_ended.cancel();
        runtime.ensure_peer(&PEER).await.unwrap();
        assert!(runtime.peers[PEER.as_slice()]
            .session
            .same_instance(&crossed));
        assert_eq!(runtime.business_streams(), 15);
        assert!(others.iter().all(Session::live));
    }

    for fence in ["cancel", "stop", "block", "capacity", "quarantine"] {
        let (mut runtime, _) = runtime();
        let old = session(&runtime, 1);
        let (notification, _old_output) = up(&old);
        runtime.receive(notification).await;
        let crossed = session(&runtime, 2);
        let (notification, _crossed_output) = up(&crossed);
        runtime.receive(notification).await;
        old.progress.io_ended.cancel();
        match fence {
            "cancel" => crossed.cancel.cancel(),
            "stop" => runtime.stop.cancel(),
            "block" => runtime.admission.policy.lock().unwrap().deny(PEER.to_vec()),
            "capacity" => runtime.capacity_excluded = true,
            "quarantine" => {
                runtime.evidence.quarantined.insert(PEER.to_vec());
            }
            _ => unreachable!(),
        }
        assert!(runtime.ensure_peer(&PEER).await.is_err(), "fence={fence}");
        assert!(!runtime.peers[PEER.as_slice()]
            .session
            .same_instance(&crossed));
    }
}

async fn handoff_notification(runtime: &mut Runtime, current: &Session, down: bool) {
    loop {
        let notification = runtime.inbox.recv().await.unwrap();
        let done = match &notification {
            Incoming::Down { session, .. } => down && session.same_instance(current),
            Incoming::Frame { session, .. } => !down && session.same_instance(current),
            _ => false,
        };
        runtime.receive(notification).await;
        if done {
            return;
        }
    }
}
async fn handoff_complete(runtime: &mut Runtime, id: &[u8], message: u8) -> PResult<ResultBody> {
    runtime
        .dispatch_data(pb::sdk_command::Body::CompleteData(pb::CompleteData {
            peer_device_id: id.to_vec(),
            message_id: vec![message; 16],
            result: Some(pb::complete_data::Result::Stage(3)),
        }))
        .await
}

#[tokio::test]
async fn crossed_noise_eof_keeps_only_its_own_queued_delivery_and_terminal_ack() {
    tokio::time::timeout(Duration::from_secs(5), async {
        for complete_before_eof in [false, true] {
            let (mut runtime, mut events) = runtime();
            let keys = budget_keys(&mut runtime);
            let (mut old_remote, primary, primary_task, id) =
                budget_noise(&mut runtime, keys.clone(), true).await;
            let (mut cross_remote, crossed, crossed_task, _) =
                budget_noise(&mut runtime, keys, false).await;
            assert!(matches!(
                cross_remote.recv().await.unwrap().body,
                Some(Body::Metadata(_))
            ));
            let Body::Data(mut old_data) = data() else {
                unreachable!()
            };
            old_data.message_id = vec![10; 16];
            old_remote.send(Body::Data(old_data)).await.unwrap();
            budget_frame(&mut runtime, &primary).await;
            cross_remote.send(data()).await.unwrap();
            budget_frame(&mut runtime, &crossed).await;
            let Body::Data(mut outgoing) = data() else {
                unreachable!()
            };
            outgoing.message_id = vec![11; 16];
            runtime
                .dispatch_data(pb::sdk_command::Body::Send(pb::Send {
                    peer_device_id: id.clone(),
                    message: Some(outgoing),
                }))
                .await
                .unwrap();
            if complete_before_eof {
                handoff_complete(&mut runtime, &id, 9).await.unwrap();
                assert!(
                    !runtime.probes[&crossed.id].send.is_idle(),
                    "ACK still owns its queue reservation"
                );
            }
            drop(old_remote);
            handoff_notification(&mut runtime, &primary, true).await;
            // Delayed duplicate Down cannot retire newly selected work twice.
            runtime
                .receive(Incoming::Down {
                    id: id.clone(),
                    session: primary.clone(),
                })
                .await;
            assert!(crossed.live());
            assert_eq!(
                handoff_complete(&mut runtime, &id, 10)
                    .await
                    .unwrap_err()
                    .code,
                pb::ErrorCode::UnknownOutcome as i32,
                "old-primary Data cannot migrate"
            );
            handoff_complete(&mut runtime, &id, 9).await.unwrap();
            for stage in [1, 2, 3] {
                assert!(matches!(cross_remote.recv().await.unwrap().body,
                    Some(Body::DataAck(a)) if a.message_id == vec![9; 16] && a.stage == stage));
            }
            let observed: Vec<_> = std::iter::from_fn(|| events.try_recv().ok()).collect();
            let deliveries: Vec<_> = observed
                .iter()
                .filter_map(|e| match &e.body {
                    Some(Event::DataReceived(d)) => {
                        Some(d.message.as_ref().unwrap().message_id.clone())
                    }
                    _ => None,
                })
                .collect();
            assert_eq!(
                deliveries,
                vec![vec![9; 16]],
                "only old-stream queued callback is revoked"
            );
            let statuses: Vec<_> = observed
                .iter()
                .filter_map(|e| match &e.body {
                    Some(Event::DataStatus(s)) => Some(s),
                    _ => None,
                })
                .collect();
            assert_eq!(statuses.len(), 1);
            assert_eq!(statuses[0].message_id, vec![11; 16]);
            assert!(
                matches!(&statuses[0].result, Some(pb::data_status::Result::Error(e))
                if e.code == pb::ErrorCode::UnknownOutcome as i32)
            );
            assert!(!runtime.pending.contains_key(&(id.clone(), vec![11; 16])));
            // Both IO tasks remain owned and must terminate without a Down waiter.
            runtime.stop.cancel();
            assert!(primary_task.await.unwrap());
            assert!(crossed_task.await.unwrap());
        }
    })
    .await
    .expect("bounded queued delivery / terminal ACK real Noise fixture");
}

#[tokio::test]
async fn crossed_selected_ack_reservation_and_security_fences() {
    for fence in [
        "normal",
        "cancel",
        "stop",
        "block",
        "epoch",
        "generation",
        "capacity",
        "quarantine",
        "boot",
    ] {
        let (mut runtime, mut events) = runtime();
        let primary = session(&runtime, 1);
        let (notification, mut old_output) = up(&primary);
        runtime.receive(notification).await;
        let crossed = session(&runtime, 2);
        let (notification, mut cross_output) = up(&crossed);
        runtime.receive(notification).await;
        while old_output.try_recv().is_ok() {}
        while cross_output.try_recv().is_ok() {}
        runtime
            .receive(Incoming::Frame {
                id: PEER.to_vec(),
                session: crossed.clone(),
                body: data(),
            })
            .await;
        handoff_complete(&mut runtime, &PEER, 9).await.unwrap();
        while old_output.try_recv().is_ok() {}
        // Select, but do not finish, all three ACK writes. Reservations must
        // remain on the crossed owner even after its queues appear empty.
        let mut selected = Vec::new();
        for _ in 0..3 {
            selected.push(cross_output.recv_queued().await.unwrap());
        }
        let cross_owner = runtime.probes[&crossed.id].clone();
        let sender = cross_owner.send.clone();
        assert!(!sender.is_idle());
        match fence {
            "cancel" => primary.cancel.cancel(),
            "stop" => runtime.stop.cancel(),
            "block" => {
                runtime.admission.policy.lock().unwrap().deny(PEER.to_vec());
            }
            "epoch" => {
                runtime.admission.policy.lock().unwrap().deny(PEER.to_vec());
                runtime
                    .admission
                    .policy
                    .lock()
                    .unwrap()
                    .blocked
                    .remove(PEER.as_slice());
            }
            "generation" => runtime.generation = Some(2),
            "capacity" => runtime.capacity_excluded = true,
            "quarantine" => {
                runtime.evidence.quarantined.insert(PEER.to_vec());
            }
            "boot" => runtime.probes.get_mut(&crossed.id).unwrap().bind.boot_id = vec![3; 16],
            _ => {}
        }
        primary.progress.io_ended.cancel();
        runtime
            .receive(Incoming::Down {
                id: PEER.to_vec(),
                session: primary.clone(),
            })
            .await;
        if fence == "normal" {
            assert!(crossed.live());
            assert_eq!(received(&mut events), 1);
            for (index, frame) in selected.iter_mut().enumerate() {
                assert!(!frame.is_revoked());
                assert!(
                    matches!(frame.prepare().unwrap(), Body::DataAck(a) if a.stage == (index + 1) as i32)
                );
            }
            assert!(!sender.is_idle(), "selected writes still own reservations");
            drop(selected);
            assert!(sender.is_idle());
        } else {
            assert!(
                runtime
                    .send_owned(
                        &PEER,
                        &cross_owner,
                        Body::Ping(pb::Ping { nonce: vec![1; 16] })
                    )
                    .is_err(),
                "fence={fence}"
            );
            assert!(runtime.ensure_peer(&PEER).await.is_err(), "fence={fence}");
        }
    }
}

fn handoff_request(n: u8) -> pb::RpcRequest {
    pb::RpcRequest {
        call_id: vec![n; 16],
        method_id: "cyberbus.example.v1.Echo/Chat".into(),
        request_type_url: "type.googleapis.com/cyberbus.example.v1.EchoRequest".into(),
        response_type_url: "type.googleapis.com/cyberbus.example.v1.EchoReply".into(),
        streaming: pb::RpcStreaming::Bidi as i32,
        semantic_version: "1.0.0".into(),
        timeout: Some(prost_types::Duration {
            seconds: 30,
            nanos: 0,
        }),
    }
}
#[tokio::test]
async fn crossed_real_noise_rpc_never_migrates_old_calls_and_replies_on_its_owner() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let (mut runtime, mut events) = runtime();
        let keys = budget_keys(&mut runtime);
        let request = handoff_request(12);
        let handler = pb::RegisterHandler {
            handler_id: vec![1; 16], capability: Some(pb::Capability {
                method_id: request.method_id.clone(), request_type_url: request.request_type_url.clone(),
                response_type_url: request.response_type_url.clone(), streaming: request.streaming,
                semantic_version: request.semantic_version.clone(),
                descriptor_digest: Sha256::digest(cyberbus_protocol::FILE_DESCRIPTOR_SET).to_vec(),
            }), descriptor_set: cyberbus_protocol::FILE_DESCRIPTOR_SET.to_vec(),
        };
        crate::rpc::validate_handler(&handler).unwrap();
        runtime.handlers.insert(handler.handler_id.clone(), handler);
        let (mut old_remote, primary, primary_task, id) = budget_noise(&mut runtime, keys.clone(), true).await;
        let (mut cross_remote, crossed, crossed_task, _) = budget_noise(&mut runtime, keys, false).await;
        assert!(matches!(cross_remote.recv().await.unwrap().body, Some(Body::Metadata(_))));
        old_remote.send(Body::RpcRequest(request.clone())).await.unwrap();
        handoff_notification(&mut runtime, &primary, false).await;
        let cross_call = handoff_request(13);
        cross_remote.send(Body::RpcRequest(cross_call.clone())).await.unwrap();
        handoff_notification(&mut runtime, &crossed, false).await;
        assert!(runtime.calls.active(&id, &request.call_id));
        assert!(runtime.calls.active(&id, &cross_call.call_id));
        drop(old_remote);
        handoff_notification(&mut runtime, &primary, true).await;
        runtime.receive(Incoming::Down { id: id.clone(), session: primary.clone() }).await;
        assert!(crossed.live());
        assert!(!runtime.calls.active(&id, &request.call_id));
        assert!(runtime.calls.active(&id, &cross_call.call_id));
        // A late old-call chunk on the healthy sibling cannot resume/migrate it.
        let mut late = pb::RpcChunk { call_id: request.call_id.clone(), direction: 1,
            item_sequence: 0, fragment: Some(pb::PayloadFragment {
                application_type_url: request.request_type_url.clone(), encoding: 1,
                protobuf_bytes: vec![10, 0], total_size: 2, offset: 0,
            }) };
        cross_remote.send(Body::RpcChunk(late.clone())).await.unwrap();
        handoff_notification(&mut runtime, &crossed, false).await;
        assert!(!runtime.calls.active(&id, &request.call_id));
        assert!(!runtime.rpc_owners.contains_key(&(id.clone(), request.call_id.clone())));
        late.call_id = cross_call.call_id.clone();
        cross_remote.send(Body::RpcChunk(late)).await.unwrap();
        handoff_notification(&mut runtime, &crossed, false).await;
        // Return response chunk + End through public runtime dispatch: neither
        // may depend on the old primary's sender or move old call state here.
        runtime.dispatch_rpc(pb::sdk_command::Body::RpcChunk(pb::SendRpcChunk {
            peer_device_id: id.clone(), chunk: Some(pb::RpcChunk {
                call_id: cross_call.call_id.clone(), direction: 2, item_sequence: 0,
                fragment: Some(pb::PayloadFragment {
                    application_type_url: cross_call.response_type_url.clone(), encoding: 1,
                    protobuf_bytes: vec![10, 0], total_size: 2, offset: 0,
                }),
            }),
        })).await.unwrap();
        runtime.dispatch_rpc(pb::sdk_command::Body::RpcEnd(pb::EndRpc {
            peer_device_id: id.clone(), end: Some(pb::RpcEnd {
                call_id: cross_call.call_id.clone(), direction: 2, item_count: 1, error: None,
            }),
        })).await.unwrap();
        let mut kinds = BTreeSet::new();
        while kinds.len() < 3 {
            match cross_remote.recv().await.unwrap().body.unwrap() {
                Body::RpcWindow(w) => { assert_eq!(w.call_id, cross_call.call_id); kinds.insert(1); }
                Body::RpcChunk(c) => { assert_eq!(c.call_id, cross_call.call_id); kinds.insert(2); }
                Body::RpcEnd(e) => { assert_eq!(e.call_id, cross_call.call_id); assert!(e.error.is_none()); kinds.insert(3); }
                other => panic!("unexpected crossed RPC reply: {other:?}"),
            }
        }
        let observed: Vec<_> = std::iter::from_fn(|| events.try_recv().ok()).filter_map(|e| match e.body {
            Some(Event::Rpc(r)) => r.body, _ => None,
        }).collect();
        assert_eq!(observed.iter().filter(|e| matches!(e, pb::rpc_event::Body::End(e)
            if e.call_id == request.call_id && e.error.as_ref().is_some_and(|e| e.code == pb::ErrorCode::UnknownOutcome as i32))).count(), 1);
        assert!(!observed.iter().any(|e| matches!(e, pb::rpc_event::Body::Request(r) if r.call_id == request.call_id)));
        assert!(observed.iter().any(|e| matches!(e, pb::rpc_event::Body::Request(r) if r.call_id == cross_call.call_id)));
        runtime.stop.cancel();
        assert!(primary_task.await.unwrap());
        assert!(crossed_task.await.unwrap());
    }).await.expect("bounded real Noise per-call stream ownership fixture");
}
