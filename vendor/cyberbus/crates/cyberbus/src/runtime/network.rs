//! Owned start/close futures keep adapter I/O out of the serialized owner.
use super::*;
pub(super) struct Prepared {
    transport: Arc<Transport>,
    listener: cyberbus_transport::Listener,
    keys: Arc<Keys>,
    generation: u64,
    cancel: CancellationToken,
}
pub(super) struct Starting {
    pub task: JoinHandle<PResult<Prepared>>,
    pub cancel: CancellationToken,
    pub reply: Option<auth::Reply>,
}
impl Runtime {
    pub(super) fn begin_start(&mut self) -> PResult<()> {
        if self.transport.is_some() || self.starting.is_some() || !self.closing.is_empty() {
            return Err(error(pb::ErrorCode::Conflict, "network already started"));
        }
        if self.devices[self.local()].profile.is_none() {
            return Err(error(
                pb::ErrorCode::InvalidArgument,
                "set public profile before starting network",
            ));
        }
        let generation = self.auth.start_network().map_err(auth_error)?;
        let private = self.auth.identity().with_private_key(|k| *k);
        let boot = *self.auth.identity().boot_id();
        let local = *self.auth.identity().device_id();
        let (mut config, keys) = self
            .auth
            .with_network_material(|v| {
                (
                    TransportConfig::new(
                        v.network_name.to_owned(),
                        v.network_secret.to_owned(),
                        local,
                    ),
                    Keys {
                        private: Zeroizing::new(private),
                        psk: Zeroizing::new(*v.app_psk),
                        binding: *v.binding_id,
                        boot,
                    },
                )
            })
            .map_err(auth_error)?;
        config.peers = self.config.bootstrap_peers.clone();
        if !self.config.listeners.is_empty() {
            config.listeners = self.config.listeners.clone();
        }
        config.enable_p2p = self.config.enable_p2p;
        config.cloudflare_fallback = self
            .config
            .cloudflare_fallback
            .as_ref()
            .map(|p| p.transport());
        config.preferred_ipv4 = self.auth.address_preference().map_err(auth_error)?;

        let cancel = CancellationToken::new();
        *self.gate_stop.lock().unwrap() = cancel.clone();
        let child = cancel.clone();
        let keys = Arc::new(keys);
        let task = tokio::spawn(async move {
            let t = Arc::new(
                Transport::start(config)
                    .await
                    .map_err(|_| error(pb::ErrorCode::Unavailable, "EasyTier startup failed"))?,
            );
            let result=async {
                t.wait_ready(tokio::time::Instant::now()+Duration::from_secs(20),&child).await.map_err(|_|error(pb::ErrorCode::Conflict,"EasyTier address not ready"))?;
                let listener=tokio::select!{_=child.cancelled()=>return Err(error(pb::ErrorCode::Cancelled,"network start cancelled")),r=t.listen(11000)=>r.map_err(|_|error(pb::ErrorCode::Unavailable,"cannot bind virtual listener"))?};
                Ok(listener)
            }.await;
            match result {
                Ok(listener) if !child.is_cancelled() => Ok(Prepared {
                    transport: t,
                    listener,
                    keys,
                    generation,
                    cancel: child,
                }),
                other => {
                    let _ = tokio::time::timeout(Duration::from_secs(5), t.close()).await;
                    match other {
                        Err(e) => Err(e),
                        Ok(_) => Err(error(pb::ErrorCode::Cancelled, "network start cancelled")),
                    }
                }
            }
        });
        self.starting = Some(Starting {
            task,
            cancel,
            reply: None,
        });
        Ok(())
    }
    pub(super) fn close_transport(&mut self, t: Arc<Transport>) {
        self.closing.push(tokio::spawn(async move {
            match tokio::time::timeout(Duration::from_secs(5), t.close()).await {
                Ok(Ok(())) => Ok(()),
                Ok(Err(_)) => Err(error(
                    pb::ErrorCode::Unavailable,
                    "EasyTier shutdown failed",
                )),
                Err(_) => Err(error(
                    pb::ErrorCode::DeadlineExceeded,
                    "native cleanup exceeded five seconds",
                )),
            }
        }));
    }
    pub(super) fn install_start(&mut self, prepared: Prepared) -> PResult<()> {
        let Prepared {
            transport,
            listener,
            keys,
            generation,
            cancel,
        } = prepared;
        if cancel.is_cancelled() {
            self.close_transport(transport);
            return Err(error(pb::ErrorCode::Cancelled, "network start cancelled"));
        }
        if let Err(e) = self
            .auth
            .check_gate(generation, None)
            .and_then(|_| self.auth.commit_address_preference(transport.status().ipv4))
        {
            self.close_transport(transport);
            return Err(auth_error(e));
        }
        self.admission
            .policy
            .lock()
            .map_err(|_| error(pb::ErrorCode::Internal, "device policy unavailable"))?
            .blocked
            .clear();
        for b in self.auth.blocked_devices().map_err(auth_error)? {
            if b.blocked {
                self.admission
                    .policy
                    .lock()
                    .unwrap()
                    .blocked
                    .insert(b.device_id.to_vec());
            }
        }
        self.generation = Some(generation);
        self.stop = cancel;
        *self.gate_stop.lock().unwrap() = self.stop.clone();
        self.admission.open.store(true, Ordering::Release);
        let ip = transport.status().ipv4;
        let local = self.local().to_vec();
        if let Some(d) = self.devices.get_mut(&local) {
            d.presence = pb::DevicePresence::Online as i32;
            d.boot_id = self.auth.identity().boot_id().to_vec();
            d.virtual_ipv4 = ip.octets().to_vec();
        }
        self.changed(&local, false);
        self.emit(Event::Network(pb::NetworkState {
            running: true,
            reachable: true,
            error: None,
        }));
        let t = transport.clone();
        let k = keys;
        let a = self.admission.clone();
        let tx = self.incoming.clone();
        let stop = self.stop.clone();
        self.keys = Some(k.clone());
        let (discovery, control) = mpsc::channel(64);
        self.discovery = Some(discovery);
        self.transport_generation = Some(transport.status().generation);
        self.network_unready = false;
        self.task = Some(tokio::spawn(crate::discovery::run(
            t,
            listener,
            k,
            a,
            tx,
            stop.clone(),
            generation,
            control,
        )));
        // Lease shutdown remains independent of slow application/OAuth command execution.
        if let Some(deadline) = self.auth.snapshot().lease_deadline {
            *self.lease.lock().unwrap() = deadline;
            let lease = self.lease.clone();
            let clock = self.clock.clone();
            let revoke_callbacks = self.events.as_ref().unwrap().business_revoker();
            let admission = self.admission.clone();
            tokio::spawn(async move {
                loop {
                    tokio::select! {_=stop.cancelled()=>break,_=tokio::time::sleep(Duration::from_millis(100))=>{if clock.elapsed()>=*lease.lock().unwrap(){admission.open.store(false,Ordering::Release);revoke_callbacks();stop.cancel();break;}}}
                }
            });
        }
        self.transport = Some(transport);

        Ok(())
    }
    pub(super) async fn poll_network(&mut self) {
        let mut index = 0;
        while index < self.closing.len() {
            if self.closing[index].is_finished() {
                let task = self.closing.remove(index);
                match task.await {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => self.cleanup_error = Some(e),
                    Err(_) => {
                        self.cleanup_error = Some(error(
                            pb::ErrorCode::Internal,
                            "native cleanup owner failed",
                        ))
                    }
                }
            } else {
                index += 1;
            }
        }
        if self.starting.as_ref().is_some_and(|s| s.task.is_finished()) {
            let starting = self.starting.take().unwrap();
            let result = match starting.task.await {
                Ok(Ok(p)) => self.install_start(p),
                Ok(Err(e)) => Err(e),
                Err(_) => Err(error(pb::ErrorCode::Internal, "network start owner failed")),
            };
            if result.is_err() {
                self.auth.stop_network();
            }
            if let Some(reply) = starting.reply {
                reply.finish(result.map(|_| ResultBody::Ok(())));
            }
        }
        if self.closing.is_empty() {
            for reply in std::mem::take(&mut self.stop_replies) {
                reply.finish(
                    self.cleanup_error
                        .clone()
                        .map_or(Ok(ResultBody::Ok(())), Err),
                );
            }
        }
        if let Some(deadline) = self.close_deadline.filter(|_| !self.closed) {
            if self.closing.is_empty()
                && self.starting.is_none()
                && !self.auth.snapshot().request_in_flight
                || tokio::time::Instant::now() >= deadline
            {
                if !self.closing.is_empty()
                    || self.starting.is_some()
                    || self.auth.snapshot().request_in_flight
                {
                    self.cleanup_error.get_or_insert_with(|| {
                        error(
                            pb::ErrorCode::DeadlineExceeded,
                            "native cleanup exceeded five seconds",
                        )
                    });
                }
                self.drain_auth_ready();
                for (_, reply) in std::mem::take(&mut self.auth_replies) {
                    reply.finish(Err(error(pb::ErrorCode::Cancelled, "SDK closed")));
                }
                let result = pb::SdkClosed {
                    closed: true,
                    cleanup_error: self.cleanup_error.clone(),
                };
                *self.close_result.lock().unwrap() = Some(result.clone());
                for reply in std::mem::take(&mut self.close_replies) {
                    reply.finish(Ok(ResultBody::SdkClosed(result.clone())));
                }
                self.closed = true;
            }
        }
    }
}

pub(super) struct QueuedCommand {
    command: pb::SdkCommand,
    submitted: tokio::time::Instant,
    reply: auth::Reply,
}
pub(super) struct Connecting {
    task: JoinHandle<PResult<()>>,
    cancel: CancellationToken,
    commands: Vec<QueuedCommand>,
}
impl Runtime {
    pub(super) async fn queue_connection(
        &mut self,
        command: pb::SdkCommand,
        submitted: tokio::time::Instant,
        sender: tokio::sync::oneshot::Sender<pb::SdkResult>,
    ) {
        use pb::sdk_command::Body as C;
        let peer = match command.body.as_ref() {
            Some(C::Send(c)) => Some(c.peer_device_id.clone()),
            Some(C::RpcRequest(c)) => Some(c.peer_device_id.clone()),
            Some(C::PullDescriptor(c)) => Some(c.peer_device_id.clone()),
            _ => None,
        };
        let reply = auth::Reply {
            id: command.command_id.clone(),
            sender,
        };
        if let Some(id) = peer {
            // Connection acquisition is real remote work too: reject before any probe
            // promotion or socket operation when the monotonic auth lease is closed.
            let gate = self
                .generation
                .ok_or_else(|| error(pb::ErrorCode::NetworkNotReady, "network is stopped"))
                .and_then(|g| self.auth.check_gate(g, None).map_err(auth_error));
            if let Err(e) =
                gate.and_then(|_| Self::connection_deadline(&command, submitted).map(|_| ()))
            {
                self.reject_queued(command, reply, e);
                return;
            }
            if self.generation.is_some()
                && self.admission.allows(&id)
                && !self.capacity_excluded
                && !self.evidence.quarantined.contains(&id)
                && !self.peers.get(&id).is_some_and(|p| p.session.live())
            {
                if let Some(p) = self
                    .probes
                    .values()
                    .find(|p| p.bind.device_id == id && p.session.live())
                    .cloned()
                {
                    let _ = self.promote(&id, &p.session);
                }
                if self.peers.get(&id).is_some_and(|p| !p.session.live()) {
                    self.drop_business(&id, session::unavailable());
                }
                if !self.peers.contains_key(&id) {
                    if let Some(ip) = self
                        .devices
                        .get(&id)
                        .filter(|d| d.presence == pb::DevicePresence::Online as i32)
                        .and_then(|d| <[u8; 4]>::try_from(d.virtual_ipv4.as_slice()).ok())
                        .map(std::net::Ipv4Addr::from)
                    {
                        if self.connections.len() >= 16 && !self.connections.contains_key(&id) {
                            self.reject_queued(
                                command,
                                reply,
                                error(
                                    pb::ErrorCode::QueueFull,
                                    "on-demand connection budget is full",
                                ),
                            );
                            return;
                        }
                        if let Some(connection) = self.connections.get_mut(&id) {
                            if connection.commands.len() >= 8 {
                                if let (Some(id), Some(events)) =
                                    (crate::queries::command_id(&command), self.events.as_ref())
                                {
                                    events.release_query(id);
                                }
                                reply.finish(Err(error(
                                    pb::ErrorCode::QueueFull,
                                    "peer connection wait queue is full",
                                )));
                            } else {
                                connection.commands.push(QueuedCommand {
                                    command,
                                    submitted,
                                    reply,
                                });
                            }
                            return;
                        }
                        if let (Some(t), Some(keys), Some(generation)) =
                            (self.transport.clone(), self.keys.clone(), self.generation)
                        {
                            let cancel = self.stop.child_token();
                            let task = tokio::spawn(session::connect_business(
                                t,
                                ip,
                                id.clone(),
                                keys,
                                self.admission.clone(),
                                self.incoming.clone(),
                                cancel.clone(),
                                generation,
                                (submitted + Self::command_timeout(&command))
                                    .min(tokio::time::Instant::now() + Duration::from_secs(10)),
                            ));
                            self.connections.insert(
                                id,
                                Connecting {
                                    task,
                                    cancel,
                                    commands: vec![QueuedCommand {
                                        command,
                                        submitted,
                                        reply,
                                    }],
                                },
                            );
                            return;
                        }
                    }
                }
            }
        }
        self.submitted = submitted;
        let result = self.dispatch(command).await;
        reply.finish(result);
    }
    fn connection_deadline(
        command: &pb::SdkCommand,
        submitted: tokio::time::Instant,
    ) -> PResult<tokio::time::Instant> {
        let deadline = submitted + Self::command_timeout(command);
        if deadline <= tokio::time::Instant::now() {
            Err(error(
                pb::ErrorCode::DeadlineExceeded,
                "command expired waiting for connection",
            ))
        } else {
            Ok(deadline)
        }
    }
    fn command_timeout(command: &pb::SdkCommand) -> Duration {
        use pb::sdk_command::Body as C;
        let value = match command.body.as_ref() {
            Some(C::Send(c)) => c.message.as_ref().and_then(|m| m.timeout.as_ref()),
            Some(C::RpcRequest(c)) => c.request.as_ref().and_then(|r| r.timeout.as_ref()),
            Some(C::PullDescriptor(c)) => c.timeout.as_ref(),
            _ => None,
        };
        timeout(value)
    }
    fn reject_queued(&self, command: pb::SdkCommand, reply: auth::Reply, e: pb::ProtocolError) {
        if let (Some(id), Some(events)) =
            (crate::queries::command_id(&command), self.events.as_ref())
        {
            events.release_query(id);
        }
        reply.finish(Err(e));
    }
    pub(super) async fn poll_connections(&mut self) {
        for connection in self.connections.values_mut() {
            let mut index = 0;
            while index < connection.commands.len() {
                if Self::connection_deadline(
                    &connection.commands[index].command,
                    connection.commands[index].submitted,
                )
                .is_err()
                {
                    let queued = connection.commands.remove(index);
                    if let (Some(id), Some(events)) = (
                        crate::queries::command_id(&queued.command),
                        self.events.as_ref(),
                    ) {
                        events.release_query(id);
                    }
                    queued.reply.finish(Err(error(
                        pb::ErrorCode::DeadlineExceeded,
                        "command expired waiting for connection",
                    )));
                } else {
                    index += 1;
                }
            }
            if connection.commands.is_empty() {
                connection.cancel.cancel();
            }
        }
        let ready: Vec<_> = self
            .connections
            .iter()
            .filter(|(_, c)| c.task.is_finished())
            .map(|(id, _)| id.clone())
            .collect();
        for id in ready {
            let connection = self.connections.remove(&id).unwrap();
            let result = match connection.task.await {
                Ok(Ok(())) => {
                    // The output used when Up replied can end before this
                    // settlement. Prefer a still-live crossed receiver locally;
                    // no business command has been admitted or replayed yet.
                    if self.ensure_peer(&id).await.is_ok() {
                        Ok(())
                    } else {
                        session::acquire::report(
                            session::acquire::Stage::PostReady,
                            session::acquire::Class::Missing,
                            Duration::ZERO,
                            1,
                        );
                        Err(session::unavailable())
                    }
                }
                Ok(Err(e)) => Err(e),
                Err(_) => Err(error(pb::ErrorCode::Unavailable, "connection owner failed")),
            };
            for queued in connection.commands {
                self.submitted = queued.submitted;
                let r = match &result {
                    Ok(()) => self.dispatch(queued.command).await,
                    Err(e) => {
                        if let (Some(id), Some(events)) = (
                            crate::queries::command_id(&queued.command),
                            self.events.as_ref(),
                        ) {
                            events.release_query(id);
                        }
                        Err(e.clone())
                    }
                };
                queued.reply.finish(r);
            }
        }
    }
    pub(super) fn cancel_connections(&mut self) {
        for (_, connection) in std::mem::take(&mut self.connections) {
            connection.cancel.cancel();
            for queued in connection.commands {
                if let (Some(id), Some(events)) = (
                    crate::queries::command_id(&queued.command),
                    self.events.as_ref(),
                ) {
                    events.release_query(id);
                }
                queued.reply.finish(Err(error(
                    pb::ErrorCode::Cancelled,
                    "network stopped before business admission",
                )));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn connection_wait_uses_api_submission_deadline() {
        let submitted = tokio::time::Instant::now() - Duration::from_secs(2);
        let command = pb::SdkCommand {
            body: Some(pb::sdk_command::Body::PullDescriptor(pb::PullDescriptor {
                timeout: Some(prost_types::Duration {
                    seconds: 1,
                    nanos: 0,
                }),
                ..Default::default()
            })),
            ..Default::default()
        };
        let e = Runtime::connection_deadline(&command, submitted).unwrap_err();
        assert_eq!(e.code, pb::ErrorCode::DeadlineExceeded as i32);
        assert!(Runtime::connection_deadline(&command, tokio::time::Instant::now()).is_ok());
    }
}
