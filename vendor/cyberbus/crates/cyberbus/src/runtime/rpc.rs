use super::*;
impl Runtime {
    fn emit_rpc(&mut self, peer_device_id: Vec<u8>, body: pb::rpc_event::Body) {
        let call_id = match &body {
            pb::rpc_event::Body::Request(r) => &r.call_id,
            pb::rpc_event::Body::Chunk(c) => &c.call_id,
            pb::rpc_event::Body::End(e) => &e.call_id,
            pb::rpc_event::Body::Cancel(c) => &c.call_id,
            pb::rpc_event::Body::Window(w) => &w.call_id,
        };
        let handler_id = self.calls.handler_id(&peer_device_id, call_id);
        self.emit(Event::Rpc(pb::RpcEvent {
            peer_device_id,
            handler_id,
            body: Some(body),
        }));
    }
    fn rpc_scope(&mut self, id: &[u8]) -> PResult<()> {
        let p = self.peers.get(id).ok_or_else(session::unavailable)?;
        let limits = p
            .bind
            .receive_limits
            .as_ref()
            .ok_or_else(|| error(pb::ErrorCode::ProtocolError, "missing RPC receive limits"))?;
        self.calls
            .configure(id, p.session.generation, &p.bind.boot_id, limits)?;
        Ok(())
    }
    fn rpc_scope_on(&mut self, id: &[u8], owner: &Peer) -> PResult<()> {
        let limits = owner
            .bind
            .receive_limits
            .as_ref()
            .ok_or_else(|| error(pb::ErrorCode::ProtocolError, "missing RPC receive limits"))?;
        self.calls
            .configure(id, owner.session.generation, &owner.bind.boot_id, limits)
    }
    fn rpc_owned_scope(&mut self, id: &[u8], call: &[u8]) -> PResult<()> {
        if let Some(owner) = self.rpc_owners.get(&(id.to_vec(), call.to_vec())).cloned() {
            self.rpc_scope_on(id, &owner)
        } else {
            self.rpc_scope(id)
        }
    }
    fn rpc_call_owner(&self, id: &[u8], call: &[u8]) -> PResult<&Peer> {
        self.rpc_owners
            .get(&(id.to_vec(), call.to_vec()))
            .ok_or_else(|| error(pb::ErrorCode::NotFound, "no RPC stream owner"))
    }
    fn send_rpc_at(&self, id: &[u8], body: Body, deadline: tokio::time::Instant) -> PResult<()> {
        let call = rpc_call_id(&body);
        self.send_owned_at(id, self.rpc_call_owner(id, call)?, body, deadline)
    }
    fn send_rpc(&self, id: &[u8], body: Body) -> PResult<()> {
        let call = rpc_call_id(&body);
        self.send_owned(id, self.rpc_call_owner(id, call)?, body)
    }
    fn validate_rpc_payload(&self, peer: &[u8], id: &[u8], f: &pb::PayloadFragment) -> PResult<()> {
        if let Some(h) = self.calls.handler(peer, id) {
            if !h.descriptor_set.is_empty() {
                let pool = prost_reflect::DescriptorPool::decode(h.descriptor_set.as_slice())
                    .map_err(|_| {
                        error(
                            pb::ErrorCode::TypeMismatch,
                            "retained handler descriptor invalid",
                        )
                    })?;
                let desc = pool
                    .get_message_by_name(f.application_type_url.rsplit('/').next().unwrap_or(""));
                return reassembly::validate_application(
                    &f.application_type_url,
                    pb::PayloadEncoding::try_from(f.encoding)
                        .unwrap_or(pb::PayloadEncoding::Unspecified),
                    &f.protobuf_bytes,
                    desc.as_ref(),
                    false,
                )
                .map_err(|e| e.to_protocol_error());
            }
        }
        self.validate_payload(f)
    }
    pub(super) async fn dispatch_rpc(
        &mut self,
        body: pb::sdk_command::Body,
    ) -> PResult<ResultBody> {
        use pb::sdk_command::Body as C;
        match body {
            C::RegisterHandler(mut c) => {
                if let Some(cap) = c.capability.as_mut() {
                    if cap.descriptor_digest.is_empty() {
                        cap.descriptor_digest = Sha256::digest(if c.descriptor_set.is_empty() {
                            cyberbus_protocol::FILE_DESCRIPTOR_SET
                        } else {
                            &c.descriptor_set
                        })
                        .to_vec();
                    }
                }
                crate::rpc::validate_handler(&c)?;
                let method = &c.capability.as_ref().unwrap().method_id;
                let replaced = self
                    .handlers
                    .iter()
                    .find(|(_, h)| {
                        h.capability
                            .as_ref()
                            .is_some_and(|v| &v.method_id == method)
                    })
                    .map(|(id, _)| id.clone());
                if self.handlers.contains_key(&c.handler_id)
                    && replaced.as_ref() != Some(&c.handler_id)
                {
                    return Err(error(
                        pb::ErrorCode::Conflict,
                        "handler ID belongs to another method",
                    ));
                }
                if self.handlers.len() >= 64 && replaced.is_none() {
                    return Err(error(
                        pb::ErrorCode::ResourceExhausted,
                        "handler capacity 64",
                    ));
                }
                let old = self.handlers.clone();
                if let Some(id) = replaced {
                    self.handlers.remove(&id);
                }
                self.handlers.insert(c.handler_id.clone(), c);
                if let Err(e) = self.publish_handlers() {
                    self.handlers = old;
                    return Err(e);
                }
                return Ok(ResultBody::PublicProfile(
                    self.devices[self.local()].profile.clone().unwrap(),
                ));
            }
            C::UnregisterHandler(c) => {
                if let Some(removed) = self.handlers.remove(&c.handler_id) {
                    if let Err(e) = self.publish_handlers() {
                        self.handlers.insert(c.handler_id, removed);
                        return Err(e);
                    }
                }
                return self.devices[self.local()]
                    .profile
                    .clone()
                    .map(ResultBody::PublicProfile)
                    .ok_or_else(|| error(pb::ErrorCode::NotFound, "no local public profile"));
            }
            C::RpcRequest(c) => {
                let mut r = c
                    .request
                    .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing RPC request"))?;
                let budget = self.remaining_budget(r.timeout.as_ref())?;
                let deadline = tokio::time::Instant::now() + budget;
                // These known enum values are reserved by the protocol. Reject
                // them before comparing against a peer's unary/bidi capability.
                if matches!(
                    pb::RpcStreaming::try_from(r.streaming),
                    Ok(pb::RpcStreaming::ClientStreaming | pb::RpcStreaming::ServerStreaming)
                ) {
                    return Err(error(pb::ErrorCode::Unsupported, "streaming mode reserved"));
                }
                let cap = self
                    .devices
                    .get(&c.peer_device_id)
                    .and_then(|d| d.profile.as_ref())
                    .and_then(|p| {
                        p.capabilities
                            .iter()
                            .find(|cap| cap.method_id == r.method_id)
                    })
                    .ok_or_else(|| {
                        error(
                            pb::ErrorCode::MethodNotExposed,
                            "peer does not expose method",
                        )
                    })?;
                if cap.request_type_url != r.request_type_url
                    || cap.response_type_url != r.response_type_url
                    || cap.streaming != r.streaming
                    || cap.semantic_version != r.semantic_version
                {
                    return Err(error(
                        pb::ErrorCode::TypeMismatch,
                        "RPC capability mismatch",
                    ));
                }
                self.ensure_peer(&c.peer_device_id).await?;
                self.rpc_scope(&c.peer_device_id)?;
                let checkpoint = self.calls.checkpoint(&c.peer_device_id, &r.call_id);
                let remaining = deadline
                    .checked_duration_since(tokio::time::Instant::now())
                    .filter(|d| !d.is_zero())
                    .ok_or_else(|| {
                        error(
                            pb::ErrorCode::DeadlineExceeded,
                            "RPC expired during connection",
                        )
                    })?;
                r.timeout = Some(prost_types::Duration {
                    seconds: remaining.as_secs() as i64,
                    nanos: remaining.subsec_nanos() as i32,
                });
                self.calls
                    .begin_at(&c.peer_device_id, &r, true, tokio::time::Instant::now())?;
                // Preserve a locally registered schema for calls that outlive unregister.
                if let Some(h) = self
                    .handlers
                    .values()
                    .find(|h| {
                        h.capability.as_ref().is_some_and(|cap| {
                            cap.method_id == r.method_id
                                && cap.request_type_url == r.request_type_url
                                && cap.response_type_url == r.response_type_url
                        })
                    })
                    .cloned()
                {
                    self.calls.bind_handler(&c.peer_device_id, &r.call_id, h);
                }
                self.rpc_owners.insert(
                    (c.peer_device_id.clone(), r.call_id.clone()),
                    self.peers[&c.peer_device_id].clone(),
                );
                if let Err(e) =
                    self.send_rpc_at(&c.peer_device_id, Body::RpcRequest(r.clone()), deadline)
                {
                    self.calls.rollback(checkpoint);
                    self.rpc_owners
                        .remove(&(c.peer_device_id.clone(), r.call_id.clone()));
                    return Err(e);
                }
                self.rpc_peers.insert(c.peer_device_id, deadline);
            }
            C::RpcChunk(c) => {
                let chunk = c
                    .chunk
                    .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing RPC chunk"))?;
                self.rpc_owned_scope(&c.peer_device_id, &chunk.call_id)?;
                let checkpoint = self.calls.checkpoint(&c.peer_device_id, &chunk.call_id);
                let result = (|| {
                    if let Some((f, _)) = self.calls.chunk(&c.peer_device_id, &chunk, true)? {
                        self.validate_rpc_payload(&c.peer_device_id, &chunk.call_id, &f)?;
                    }
                    self.send_rpc_at(
                        &c.peer_device_id,
                        Body::RpcChunk(chunk.clone()),
                        self.calls.deadline(&c.peer_device_id, &chunk.call_id)?,
                    )
                })();
                if let Err(e) = result {
                    self.calls.rollback(checkpoint);
                    if e.code == pb::ErrorCode::DeadlineExceeded as i32 {
                        self.rpc_failure(&c.peer_device_id, chunk.call_id, e.clone());
                    }
                    return Err(e);
                }
            }
            C::RpcEnd(c) => {
                let end = c
                    .end
                    .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing RPC end"))?;
                self.rpc_owned_scope(&c.peer_device_id, &end.call_id)?;
                if self.calls.finished(&c.peer_device_id, &end.call_id) {
                    return Ok(ResultBody::Ok(()));
                }
                let deadline = self.calls.deadline(&c.peer_device_id, &end.call_id)?;
                let checkpoint = self.calls.checkpoint(&c.peer_device_id, &end.call_id);
                let result = self
                    .calls
                    .end(&c.peer_device_id, &end, true)
                    .and_then(|()| {
                        self.send_rpc_at(&c.peer_device_id, Body::RpcEnd(end.clone()), deadline)
                    });
                if let Err(e) = result {
                    self.calls.rollback(checkpoint);
                    if e.code == pb::ErrorCode::DeadlineExceeded as i32 {
                        self.rpc_failure(&c.peer_device_id, end.call_id, e.clone());
                    }
                    return Err(e);
                }
                self.calls.claim_terminal(&c.peer_device_id, &end.call_id);
            }
            C::RpcCancel(c) => {
                let cancel = c
                    .cancel
                    .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing RPC cancel"))?;
                self.rpc_owned_scope(&c.peer_device_id, &cancel.call_id)?;
                if !self.calls.active(&c.peer_device_id, &cancel.call_id) {
                    return Ok(ResultBody::Ok(()));
                }
                if let Err(e) = self.calls.remaining(&c.peer_device_id, &cancel.call_id) {
                    self.rpc_failure(&c.peer_device_id, cancel.call_id, e.clone());
                    return Err(e);
                }
                // A locally accepted cancel selects its terminal immediately. Control
                // capacity exhaustion closes the stream rather than undoing cancellation.
                self.calls.cancel(&c.peer_device_id, &cancel.call_id);
                self.calls
                    .claim_terminal(&c.peer_device_id, &cancel.call_id);
                let sent = self.send_rpc(&c.peer_device_id, Body::RpcCancel(cancel.clone()));
                if sent.is_err() {
                    if let Ok(p) = self.rpc_call_owner(&c.peer_device_id, &cancel.call_id) {
                        p.session.cancel.cancel();
                    }
                }
                self.emit_rpc(c.peer_device_id, pb::rpc_event::Body::Cancel(cancel));
                sent?;
            }
            C::RpcWindow(c) => {
                let w = c
                    .window
                    .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing RPC window"))?;
                self.rpc_owned_scope(&c.peer_device_id, &w.call_id)?;
                if self.calls.finished(&c.peer_device_id, &w.call_id) {
                    return Ok(ResultBody::Ok(()));
                }
                let checkpoint = self.calls.checkpoint(&c.peer_device_id, &w.call_id);
                let result = self
                    .calls
                    .window(&c.peer_device_id, &w, true)
                    .and_then(|()| {
                        self.send_rpc_at(
                            &c.peer_device_id,
                            Body::RpcWindow(w.clone()),
                            self.calls.deadline(&c.peer_device_id, &w.call_id)?,
                        )
                    });
                if let Err(e) = result {
                    self.calls.rollback(checkpoint);
                    if e.code == pb::ErrorCode::DeadlineExceeded as i32 {
                        self.rpc_failure(&c.peer_device_id, w.call_id, e.clone());
                    }
                    return Err(e);
                }
            }
            _ => unreachable!("runtime routes only RPC commands"),
        }
        Ok(ResultBody::Ok(()))
    }
    #[cfg(test)]
    pub(super) fn receive_rpc_frame(&mut self, id: Vec<u8>, body: Body) {
        let owner = self.peers[&id].clone();
        self.receive_rpc_on(id, body, owner);
    }
    pub(super) fn receive_rpc_on(&mut self, id: Vec<u8>, body: Body, owner: Peer) {
        let key = (id.clone(), rpc_call_id(&body).to_vec());
        if self
            .rpc_owners
            .get(&key)
            .is_some_and(|p| !p.session.same_instance(&owner.session))
        {
            // Same device/boot is not permission to move a call across streams.
            return;
        }
        if !matches!(&body, Body::RpcRequest(_)) && !self.rpc_owners.contains_key(&key) {
            // Retired calls cannot resume on a sibling; retain late-frame abuse
            // accounting on the actual offending stream without rebinding it.
            if self.calls.finished(&id, &key.1)
                && matches!(&body, Body::RpcChunk(_) | Body::RpcWindow(_))
                && self.calls.late_frame(&id, &key.1)
            {
                owner.session.cancel.cancel();
            }
            return;
        }
        if self.rpc_scope_on(&id, &owner).is_err() {
            return;
        }
        match body {
            Body::RpcRequest(r) => {
                let duplicate = self.calls.active(&id, &r.call_id);
                if let Err(e) = self.calls.begin(&id, &r, false) {
                    // A conflicting duplicate cannot change the original call's terminal.
                    let _ = self.send_owned(
                        &id,
                        &owner,
                        Body::RpcCancel(pb::RpcCancel {
                            call_id: r.call_id,
                            error: Some(e),
                        }),
                    );
                    return;
                }
                if duplicate {
                    return;
                }
                self.rpc_owners.insert(key, owner.clone());
                let handler = self
                    .handlers
                    .values()
                    .find(|h| {
                        h.capability.as_ref().is_some_and(|c| {
                            c.method_id == r.method_id
                                && c.request_type_url == r.request_type_url
                                && c.response_type_url == r.response_type_url
                                && c.streaming == r.streaming
                                && c.semantic_version == r.semantic_version
                        })
                    })
                    .cloned();
                let Some(handler) = handler else {
                    self.rpc_failure(
                        &id,
                        r.call_id,
                        error(
                            pb::ErrorCode::MethodNotExposed,
                            "no registered handler for method and types",
                        ),
                    );
                    return;
                };
                self.calls.bind_handler(&id, &r.call_id, handler);
                self.emit_rpc(id, pb::rpc_event::Body::Request(r));
            }
            Body::RpcChunk(c) => {
                if self.calls.finished(&id, &c.call_id) {
                    if self.calls.late_frame(&id, &c.call_id) {
                        if let Some(p) = self.rpc_owners.get(&(id.clone(), c.call_id.clone())) {
                            p.session.cancel.cancel();
                        }
                    }
                    return;
                }
                match self.calls.chunk(&id, &c, false) {
                    Ok(complete) => {
                        let w = pb::RpcWindow {
                            call_id: c.call_id.clone(),
                            direction: c.direction,
                            byte_credit: c
                                .fragment
                                .as_ref()
                                .map_or(0, |f| f.protobuf_bytes.len() as u32),
                            item_credit: 0,
                        };
                        if w.byte_credit > 0 {
                            let checkpoint = self.calls.checkpoint(&id, &c.call_id);
                            if let Err(e) = self.calls.window(&id, &w, true).and_then(|()| {
                                self.send_rpc_at(
                                    &id,
                                    Body::RpcWindow(w),
                                    self.calls.deadline(&id, &c.call_id)?,
                                )
                            }) {
                                self.calls.rollback(checkpoint);
                                self.rpc_failure(&id, c.call_id, e);
                                return;
                            }
                        }
                        if let Some((f, chunks)) = complete {
                            if let Err(e) = self.validate_rpc_payload(&id, &c.call_id, &f) {
                                self.rpc_failure(&id, c.call_id, e);
                                return;
                            }
                            for chunk in chunks {
                                self.emit_rpc(id.clone(), pb::rpc_event::Body::Chunk(chunk));
                            }
                        }
                    }
                    Err(e) => self.rpc_failure(&id, c.call_id, e),
                }
            }
            Body::RpcEnd(e) => {
                if self.calls.finished(&id, &e.call_id) {
                    return;
                }
                match self.calls.end(&id, &e, false) {
                    Ok(()) => {
                        self.calls.claim_terminal(&id, &e.call_id);
                        if e.direction == pb::RpcDirection::Response as i32 {
                            if let Some(p) = self.rpc_owners.get(&(id.clone(), e.call_id.clone())) {
                                p.send.fence_rpc(&e.call_id);
                            }
                        }
                        self.emit_rpc(id, pb::rpc_event::Body::End(e));
                    }
                    Err(err) => self.rpc_failure(&id, e.call_id, err),
                }
            }
            Body::RpcCancel(c) => {
                if !self.calls.active(&id, &c.call_id) {
                    return;
                }
                if let Err(e) = self.calls.remaining(&id, &c.call_id) {
                    self.rpc_failure(&id, c.call_id, e);
                    return;
                }
                if self.calls.cancel(&id, &c.call_id) {
                    if let Some(p) = self.rpc_owners.get(&(id.clone(), c.call_id.clone())) {
                        p.send.fence_rpc(&c.call_id);
                    }
                    self.calls.claim_terminal(&id, &c.call_id);
                    self.emit_rpc(id, pb::rpc_event::Body::Cancel(c));
                }
            }
            Body::RpcWindow(w) => {
                if self.calls.finished(&id, &w.call_id) {
                    if self.calls.late_frame(&id, &w.call_id) {
                        if let Some(p) = self.rpc_owners.get(&(id.clone(), w.call_id.clone())) {
                            p.session.cancel.cancel();
                        }
                    }
                    return;
                }
                match self.calls.window(&id, &w, false) {
                    Ok(()) => self.emit_rpc(id, pb::rpc_event::Body::Window(w)),
                    Err(e) => self.rpc_failure(&id, w.call_id, e),
                }
            }
            _ => unreachable!("runtime routes only RPC frames"),
        }
    }
    pub(super) fn rpc_failure(&mut self, id: &[u8], call_id: Vec<u8>, e: pb::ProtocolError) {
        let known = self.calls.active(id, &call_id) || self.calls.finished(id, &call_id);
        self.calls.cancel(id, &call_id);
        if known && !self.calls.claim_terminal(id, &call_id) {
            return;
        }
        let owner = self
            .rpc_owners
            .get(&(id.to_vec(), call_id.clone()))
            .cloned();
        if let Some(p) = &owner {
            p.send.fence_rpc(&call_id);
        }
        let info = self.calls.terminal_info(id, &call_id);
        let body = if info.is_some_and(|(outbound, _)| !outbound) {
            pb::rpc_event::Body::End(pb::RpcEnd {
                call_id,
                direction: pb::RpcDirection::Response as i32,
                item_count: info.unwrap().1,
                error: Some(e),
            })
        } else {
            pb::rpc_event::Body::Cancel(pb::RpcCancel {
                call_id,
                error: Some(e),
            })
        };
        let wire = match &body {
            pb::rpc_event::Body::End(e) => Body::RpcEnd(e.clone()),
            pb::rpc_event::Body::Cancel(c) => Body::RpcCancel(c.clone()),
            _ => unreachable!(),
        };
        if self.send_rpc(id, wire).is_err() {
            if let Some(p) = &owner {
                p.session.cancel.cancel();
            }
        }
        self.emit_rpc(id.to_vec(), body);
    }
    pub(super) fn publish_handlers(&mut self) -> PResult<()> {
        let local = self.local().to_vec();
        let mut p = self.devices[&local].profile.clone().ok_or_else(|| {
            error(
                pb::ErrorCode::InvalidArgument,
                "set profile before registering handlers",
            )
        })?;
        let current = p.config_revision;
        p.config_revision = p.config_revision.checked_add(1).ok_or_else(|| {
            error(
                pb::ErrorCode::ResourceExhausted,
                "profile revision exhausted",
            )
        })?;
        p.capabilities = self
            .handlers
            .values()
            .filter_map(|h| h.capability.clone())
            .collect();
        let bytes = codec::encode(&p).map_err(|e| e.to_protocol_error())?;
        self.auth
            .commit_local_profile(current, &bytes)
            .map_err(auth_error)?;
        self.devices.get_mut(&local).unwrap().profile = Some(p.clone());
        self.changed(&local, false);
        self.push_profile(p);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const PEER: [u8; 32] = [42; 32];
    pub(super) fn fixture() -> (Runtime, session::PeerOutput, crate::EventReceiver) {
        let config=ClientConfig::from_json(r#"{"issuer":"https://auth.example.com/oidc","client_id":"native","resource":"https://cyberbus.example/api","product_id":"cyberbus","native_clients":{"native":"cyberbus"},"redirect_uri":"http://127.0.0.1:18765/callback"}"#).unwrap();
        let clock = Arc::new(cyberbus_auth::SystemClock::new().unwrap());
        let auth = AuthManager::new(
            config.auth(),
            Box::new(cyberbus_auth::MemoryStore::default()),
            crate::StoreMode::CreateNew,
            clock.clone(),
        )
        .unwrap();
        let (tx, rx) = crate::events::channel();
        let mut runtime =
            Runtime::new(config, auth, tx, clock, Arc::new(Mutex::new(None))).unwrap();
        runtime.generation = Some(1);
        runtime.admission.open.store(true, Ordering::Release);
        let (send, output) = session::test_channel();
        let session = Session {
            generation: 1,
            address_generation: 0,
            business: Arc::new(AtomicBool::new(true)),
            outbound: true,
            id: [1; 32],
            policy_epoch: 0,
            cancel: CancellationToken::new(),
            progress: Arc::default(),
        };
        runtime.peers.insert(
            PEER.to_vec(),
            Peer {
                send,
                session,
                bind: pb::SessionBind {
                    boot_id: vec![8; 16],
                    receive_limits: Some(pb::ReceiveLimits {
                        max_message_bytes: 1048576,
                        max_fragment_bytes: 16384,
                        max_data_in_flight: 8,
                        max_rpc_in_flight: 16,
                        rpc_byte_window: 65536,
                        rpc_item_window: 4,
                        max_descriptor_bytes: 262144,
                    }),
                    ..Default::default()
                },
                ip: std::net::Ipv4Addr::LOCALHOST,
                used: tokio::time::Instant::now(),
                ping: None,
                pending_profile: None,
            },
        );
        (runtime, output, rx)
    }
    fn request() -> pb::RpcRequest {
        pb::RpcRequest {
            call_id: vec![2; 16],
            method_id: "cyberbus.example.v1.Echo/Chat".into(),
            request_type_url: "type.googleapis.com/cyberbus.example.v1.EchoRequest".into(),
            response_type_url: "type.googleapis.com/cyberbus.example.v1.EchoReply".into(),
            streaming: 2,
            semantic_version: "1.0.0".into(),
            timeout: Some(prost_types::Duration {
                seconds: 30,
                nanos: 0,
            }),
        }
    }
    fn chunk(r: &pb::RpcRequest) -> pb::RpcChunk {
        pb::RpcChunk {
            call_id: r.call_id.clone(),
            direction: 1,
            item_sequence: 0,
            fragment: Some(pb::PayloadFragment {
                application_type_url: r.request_type_url.clone(),
                encoding: 1,
                total_size: 2,
                offset: 0,
                protobuf_bytes: vec![10, 0],
            }),
        }
    }
    fn handler(r: &pb::RpcRequest, n: u8) -> pb::RegisterHandler {
        pb::RegisterHandler {
            handler_id: vec![n; 16],
            capability: Some(pb::Capability {
                method_id: r.method_id.clone(),
                request_type_url: r.request_type_url.clone(),
                response_type_url: r.response_type_url.clone(),
                streaming: r.streaming,
                semantic_version: r.semantic_version.clone(),
                descriptor_digest: Sha256::digest(cyberbus_protocol::FILE_DESCRIPTOR_SET).to_vec(),
            }),
            descriptor_set: cyberbus_protocol::FILE_DESCRIPTOR_SET.to_vec(),
        }
    }
    #[tokio::test]
    async fn invoke_reserved_streaming_precedes_advertised_kind_mismatch() {
        for advertised in [pb::RpcStreaming::Unary, pb::RpcStreaming::Bidi] {
            for reserved in [
                pb::RpcStreaming::ClientStreaming,
                pb::RpcStreaming::ServerStreaming,
            ] {
                let (mut rt, mut output, mut events) = fixture();
                let mut r = request();
                r.method_id = if advertised == pb::RpcStreaming::Unary {
                    "cyberbus.example.v1.Echo/Unary"
                } else {
                    "cyberbus.example.v1.Echo/Chat"
                }
                .into();
                r.streaming = advertised as i32;
                let cap = handler(&r, 1).capability.unwrap();
                rt.devices.insert(
                    PEER.to_vec(),
                    pb::DeviceSnapshot {
                        device_id: PEER.to_vec(),
                        profile: Some(pb::PublicProfile {
                            capabilities: vec![cap],
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                );
                r.streaming = reserved as i32;
                let command = pb::SdkCommand {
                    command_id: vec![9; 16],
                    body: Some(pb::sdk_command::Body::RpcRequest(pb::InvokeRpc {
                        peer_device_id: PEER.to_vec(),
                        request: Some(r.clone()),
                    })),
                };
                // Reserved kinds must survive public command validation and reach
                // the same InvokeRpc dispatch branch used by live controllers.
                let bytes = codec::encode(&command).unwrap();
                let decoded = codec::decode_command(&bytes).unwrap();
                let e = rt.dispatch_rpc(decoded.body.unwrap()).await.unwrap_err();
                assert_eq!(
                    e.code,
                    pb::ErrorCode::Unsupported as i32,
                    "{advertised:?} / {reserved:?}"
                );
                assert!(!rt.calls.active(&PEER, &r.call_id));
                assert!(rt.rpc_peers.is_empty());
                assert!(output.try_recv().is_err());
                assert!(events.try_recv().is_err());
            }
        }
    }
    #[tokio::test]
    async fn invoke_supported_kinds_preserve_metadata_and_missing_method_errors() {
        let (mut rt, _output, _events) = fixture();
        let mut original = request();
        original.method_id = "cyberbus.example.v1.Echo/Unary".into();
        original.streaming = pb::RpcStreaming::Unary as i32;
        let cap = handler(&original, 1).capability.unwrap();
        rt.devices.insert(
            PEER.to_vec(),
            pb::DeviceSnapshot {
                device_id: PEER.to_vec(),
                profile: Some(pb::PublicProfile {
                    capabilities: vec![cap],
                    ..Default::default()
                }),
                ..Default::default()
            },
        );
        for field in ["streaming", "request", "response", "version", "method"] {
            let mut r = original.clone();
            match field {
                "streaming" => r.streaming = pb::RpcStreaming::Bidi as i32,
                "request" => r.request_type_url = "type.googleapis.com/example.OtherRequest".into(),
                "response" => r.response_type_url = "type.googleapis.com/example.OtherReply".into(),
                "version" => r.semantic_version = "2.0.0".into(),
                "method" => r.method_id = "cyberbus.example.v1.Echo/Missing".into(),
                _ => unreachable!(),
            }
            let e = rt
                .dispatch_rpc(pb::sdk_command::Body::RpcRequest(pb::InvokeRpc {
                    peer_device_id: PEER.to_vec(),
                    request: Some(r),
                }))
                .await
                .unwrap_err();
            let expected = if field == "method" {
                pb::ErrorCode::MethodNotExposed
            } else {
                pb::ErrorCode::TypeMismatch
            };
            assert_eq!(e.code, expected as i32, "{field}");
        }
    }
    #[tokio::test]
    async fn actual_dispatch_queue_full_rolls_back_chunk_end_and_window() {
        let (mut rt, mut output, _events) = fixture();
        let r = request();
        rt.rpc_scope(&PEER).unwrap();
        rt.calls.begin(&PEER, &r, true).unwrap();
        rt.rpc_owners.insert(
            (PEER.to_vec(), r.call_id.clone()),
            rt.peers[PEER.as_slice()].clone(),
        );
        for _ in 0..128 {
            rt.peers[PEER.as_slice()]
                .send
                .try_send(Body::Metadata(pb::PeerMetadata::default()))
                .unwrap();
        }
        let command = pb::sdk_command::Body::RpcChunk(pb::SendRpcChunk {
            peer_device_id: PEER.to_vec(),
            chunk: Some(chunk(&r)),
        });
        assert_eq!(
            rt.dispatch_rpc(command.clone()).await.unwrap_err().code,
            pb::ErrorCode::QueueFull as i32
        );
        output.try_recv().unwrap();
        rt.dispatch_rpc(command).await.unwrap();
        let end = pb::sdk_command::Body::RpcEnd(pb::EndRpc {
            peer_device_id: PEER.to_vec(),
            end: Some(pb::RpcEnd {
                call_id: r.call_id.clone(),
                direction: 1,
                item_count: 1,
                error: None,
            }),
        });
        assert_eq!(
            rt.dispatch_rpc(end.clone()).await.unwrap_err().code,
            pb::ErrorCode::QueueFull as i32
        );
        output.try_recv().unwrap();
        rt.dispatch_rpc(end).await.unwrap();
        // Credit is committed only if its independent control queue accepts the grant.
        let mut inbound = r.clone();
        inbound.call_id = vec![3; 16];
        rt.calls.begin(&PEER, &inbound, false).unwrap();
        rt.rpc_owners.insert(
            (PEER.to_vec(), inbound.call_id.clone()),
            rt.peers[PEER.as_slice()].clone(),
        );
        rt.calls.chunk(&PEER, &chunk(&inbound), false).unwrap();
        for _ in 0..128 {
            rt.peers[PEER.as_slice()]
                .send
                .try_send(Body::Pong(pb::Pong { nonce: vec![1; 16] }))
                .unwrap();
        }
        let grant = pb::sdk_command::Body::RpcWindow(pb::GrantRpcWindow {
            peer_device_id: PEER.to_vec(),
            window: Some(pb::RpcWindow {
                call_id: inbound.call_id,
                direction: 1,
                byte_credit: 2,
                item_credit: 1,
            }),
        });
        assert_eq!(
            rt.dispatch_rpc(grant.clone()).await.unwrap_err().code,
            pb::ErrorCode::QueueFull as i32
        );
        output.try_recv().unwrap();
        rt.dispatch_rpc(grant).await.unwrap();
    }
    #[tokio::test]
    async fn callee_failure_revokes_queued_events_once_and_preserves_handler() {
        for consume_request in [false, true] {
            let (mut rt, mut output, mut events) = fixture();
            let r = request();
            rt.handlers.insert(vec![1; 16], handler(&r, 1));
            rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(r.clone()));
            rt.receive_rpc_frame(PEER.to_vec(), Body::RpcChunk(chunk(&r)));
            if consume_request {
                assert!(matches!(
                    events.try_recv().unwrap().body,
                    Some(Event::Rpc(pb::RpcEvent {
                        body: Some(pb::rpc_event::Body::Request(_)),
                        ..
                    }))
                ));
            }
            // Replacing a registration must not change this call's terminal recipient.
            rt.handlers.clear();
            rt.handlers.insert(vec![2; 16], handler(&r, 2));
            while output.try_recv().is_ok() {}
            for _ in 0..2 {
                rt.rpc_failure(
                    &PEER,
                    r.call_id.clone(),
                    error(pb::ErrorCode::DeadlineExceeded, "application stalled"),
                );
            }
            let Some(Event::Rpc(terminal)) = events.try_recv().unwrap().body else {
                panic!("expected RPC terminal");
            };
            assert_eq!(terminal.handler_id, vec![1; 16]);
            let Some(pb::rpc_event::Body::End(end)) = terminal.body else {
                panic!("expected error end");
            };
            assert_eq!(end.call_id, r.call_id);
            assert_eq!(end.direction, pb::RpcDirection::Response as i32);
            assert_eq!(
                end.error.unwrap().code,
                pb::ErrorCode::DeadlineExceeded as i32
            );
            assert!(events.try_recv().is_err());
            assert!(matches!(output.try_recv().unwrap(), Body::RpcEnd(_)));
            assert!(output.try_recv().is_err());
        }
    }
    #[tokio::test]
    async fn callee_expiry_revokes_only_the_expired_call() {
        let (mut rt, _output, mut events) = fixture();
        let mut expired = request();
        expired.timeout = Some(prost_types::Duration {
            seconds: 1,
            nanos: 0,
        });
        let mut other = request();
        other.call_id = vec![3; 16];
        rt.handlers.insert(vec![1; 16], handler(&expired, 1));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(expired.clone()));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcChunk(chunk(&expired)));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(other.clone()));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcChunk(chunk(&other)));
        tokio::time::sleep(Duration::from_millis(1001)).await;
        let expired_calls = rt.calls.expired();
        assert_eq!(
            expired_calls,
            vec![(PEER.to_vec(), expired.call_id.clone())]
        );
        for (peer, call_id) in expired_calls {
            rt.rpc_failure(
                &peer,
                call_id,
                error(pb::ErrorCode::DeadlineExceeded, "RPC deadline exceeded"),
            );
        }
        for expected in [
            pb::rpc_event::Body::Request(other.clone()),
            pb::rpc_event::Body::Chunk(chunk(&other)),
        ] {
            assert!(matches!(
                events.try_recv().unwrap().body,
                Some(Event::Rpc(e)) if e.body == Some(expected)
            ));
        }
        assert!(matches!(
            events.try_recv().unwrap().body,
            Some(Event::Rpc(pb::RpcEvent {
                body: Some(pb::rpc_event::Body::End(e)),
                ..
            })) if e.call_id == expired.call_id && e.error.is_some()
        ));
        assert!(events.try_recv().is_err());
        assert!(rt.calls.active(&PEER, &other.call_id));
    }
    #[tokio::test]
    async fn runtime_duplicate_and_late_terminal_do_not_redispatch_or_cancel_again() {
        let (mut rt, mut output, mut events) = fixture();
        let r = request();
        rt.handlers.insert(vec![1; 16], handler(&r, 1));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(r.clone()));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(r.clone()));
        assert!(matches!(
            events.try_recv().unwrap().body,
            Some(Event::Rpc(pb::RpcEvent {
                body: Some(pb::rpc_event::Body::Request(_)),
                ..
            }))
        ));
        assert!(events.try_recv().is_err());
        let cancel = pb::RpcCancel {
            call_id: r.call_id.clone(),
            error: Some(error(pb::ErrorCode::Cancelled, "remote cancellation")),
        };
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcCancel(cancel.clone()));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcCancel(cancel));
        rt.receive_rpc_frame(
            PEER.to_vec(),
            Body::RpcEnd(pb::RpcEnd {
                call_id: r.call_id.clone(),
                direction: 1,
                item_count: 0,
                error: None,
            }),
        );
        assert!(events.try_recv().is_ok());
        assert!(events.try_recv().is_err());
        assert!(output.try_recv().is_err());
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(r));
        assert!(
            matches!(output.try_recv().unwrap(),Body::RpcCancel(c) if c.error.as_ref().unwrap().code==pb::ErrorCode::Conflict as i32)
        );
        assert!(events.try_recv().is_err());
    }
    #[tokio::test]
    async fn register_replace_unregister_return_profile_and_pin_old_registration() {
        let (mut rt, _output, mut events) = fixture();
        let r = request();
        let local = rt.local().to_vec();
        rt.devices.get_mut(&local).unwrap().profile = Some(pb::PublicProfile {
            device_name: "test".into(),
            config_revision: 0,
            config_semantic_version: "1.0.0".into(),
            ..Default::default()
        });
        let first = rt
            .dispatch_rpc(pb::sdk_command::Body::RegisterHandler(handler(&r, 1)))
            .await
            .unwrap();
        assert!(matches!(first, ResultBody::PublicProfile(_)));
        rt.receive_rpc_frame(PEER.to_vec(), Body::RpcRequest(r.clone()));
        assert_eq!(rt.calls.handler_id(&PEER, &r.call_id), vec![1; 16]);
        rt.dispatch_rpc(pb::sdk_command::Body::RegisterHandler(handler(&r, 2)))
            .await
            .unwrap();
        assert_eq!(rt.handlers.len(), 1);
        assert_eq!(
            rt.calls.handler(&PEER, &r.call_id).unwrap().handler_id,
            vec![1; 16]
        );
        let result = rt
            .dispatch_rpc(pb::sdk_command::Body::UnregisterHandler(
                pb::UnregisterHandler {
                    handler_id: vec![2; 16],
                },
            ))
            .await
            .unwrap();
        assert!(matches!(result,ResultBody::PublicProfile(p) if p.capabilities.is_empty()));
        assert!(rt.handlers.is_empty());
        rt.validate_rpc_payload(&PEER, &r.call_id, chunk(&r).fragment.as_ref().unwrap())
            .unwrap();
        let request_event = events.try_recv().unwrap();
        assert!(
            matches!(request_event.body,Some(Event::Rpc(pb::RpcEvent{handler_id,..})) if handler_id==vec![1;16])
        );
        rt.receive_rpc_frame(
            PEER.to_vec(),
            Body::RpcCancel(pb::RpcCancel {
                call_id: r.call_id.clone(),
                error: None,
            }),
        );
        let terminal = events.try_recv().unwrap();
        assert!(
            matches!(terminal.body,Some(Event::Rpc(pb::RpcEvent{handler_id,..})) if handler_id==vec![1;16])
        );
        assert_eq!(rt.calls.handler_id(&PEER, &r.call_id), vec![1; 16]);
    }
}

#[cfg(test)]
mod capacity_tests {
    use super::*;
    #[tokio::test]
    async fn sixty_four_real_descriptor_methods_and_atomic_replacement() {
        let (mut rt, _output, _events) = super::tests::fixture();
        let local = rt.local().to_vec();
        rt.devices.get_mut(&local).unwrap().profile = Some(pb::PublicProfile {
            device_name: "capacity".into(),
            config_revision: 0,
            config_semantic_version: "1.0.0".into(),
            ..Default::default()
        });
        let file = prost_types::FileDescriptorProto {
            name: Some("handlers.proto".into()),
            package: Some("example.handlers".into()),
            syntax: Some("proto3".into()),
            message_type: vec![
                prost_types::DescriptorProto {
                    name: Some("Request".into()),
                    ..Default::default()
                },
                prost_types::DescriptorProto {
                    name: Some("Response".into()),
                    ..Default::default()
                },
            ],
            service: vec![prost_types::ServiceDescriptorProto {
                name: Some("Service".into()),
                method: (0..65)
                    .map(|n| prost_types::MethodDescriptorProto {
                        name: Some(format!("Method{n}")),
                        input_type: Some(".example.handlers.Request".into()),
                        output_type: Some(".example.handlers.Response".into()),
                        ..Default::default()
                    })
                    .collect(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let raw = prost_types::FileDescriptorSet { file: vec![file] }.encode_to_vec();
        let registration = |method: u8, id: u8| pb::RegisterHandler {
            handler_id: vec![id; 16],
            capability: Some(pb::Capability {
                method_id: format!("example.handlers.Service/Method{method}"),
                request_type_url: "type.googleapis.com/example.handlers.Request".into(),
                response_type_url: "type.googleapis.com/example.handlers.Response".into(),
                streaming: 1,
                semantic_version: "1.0.0".into(),
                descriptor_digest: vec![],
            }),
            descriptor_set: raw.clone(),
        };
        for n in 0..64 {
            let result = rt
                .dispatch_rpc(pb::sdk_command::Body::RegisterHandler(registration(n, n)))
                .await
                .unwrap();
            assert!(
                matches!(result,ResultBody::PublicProfile(p) if p.capabilities.len()==n as usize+1 && p.capabilities.last().unwrap().descriptor_digest.len()==32)
            );
        }
        let rejected = rt
            .dispatch_rpc(pb::sdk_command::Body::RegisterHandler(registration(64, 64)))
            .await
            .unwrap_err();
        assert_eq!(rejected.code, pb::ErrorCode::ResourceExhausted as i32);
        assert_eq!(rt.handlers.len(), 64);
        rt.dispatch_rpc(pb::sdk_command::Body::RegisterHandler(registration(0, 65)))
            .await
            .unwrap();
        assert_eq!(rt.handlers.len(), 64);
        assert!(!rt.handlers.contains_key(&vec![0; 16]));
        assert!(rt.handlers.contains_key(&vec![65; 16]));
    }
}

fn rpc_call_id(body: &Body) -> &[u8] {
    match body {
        Body::RpcRequest(r) => &r.call_id,
        Body::RpcChunk(r) => &r.call_id,
        Body::RpcEnd(r) => &r.call_id,
        Body::RpcCancel(r) => &r.call_id,
        Body::RpcWindow(r) => &r.call_id,
        _ => unreachable!("RPC output only"),
    }
}
