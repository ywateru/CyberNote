use super::*;
impl Runtime {
    pub(super) fn finish_profile_queries(&mut self, peer: &[u8], failure: pb::ProtocolError) {
        let ids: Vec<_> = self
            .profile_queries
            .iter()
            .filter(|(_, q)| q.peer == peer)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            let q = self.profile_queries.remove(&id).unwrap();
            self.profile_result(id, q.peer, q.conditional, false, Some(failure.clone()));
        }
    }
    pub(super) fn profile_result(
        &mut self,
        query_id: Vec<u8>,
        peer_device_id: Vec<u8>,
        conditional: Option<u64>,
        from_cache: bool,
        failure: Option<pb::ProtocolError>,
    ) {
        let d = self.devices.get(&peer_device_id);
        let result = if let Some(e) = failure {
            pb::device_descriptor_result::Result::Error(e)
        } else {
            match d.and_then(|d| d.profile.clone()) {
                Some(p) if Some(p.config_revision) == conditional => {
                    pb::device_descriptor_result::Result::Unchanged(p.config_revision)
                }
                Some(p) => pb::device_descriptor_result::Result::Profile(p),
                None => pb::device_descriptor_result::Result::Error(error(
                    pb::ErrorCode::NotFound,
                    "authenticated descriptor unavailable",
                )),
            }
        };
        self.emit(Event::DeviceDescriptor(pb::DeviceDescriptorResult {
            query_id,
            peer_device_id: peer_device_id.clone(),
            from_cache,
            authenticated_at: if peer_device_id == self.local() {
                None
            } else {
                d.and_then(|d| d.last_authenticated_at)
            },
            result: Some(result),
        }));
    }
    pub(super) fn push_profile(&mut self, profile: pb::PublicProfile) {
        for p in self.peers.values_mut().chain(self.probes.values_mut()) {
            if p.send
                .try_send(Body::Metadata(pb::PeerMetadata {
                    profile: Some(profile.clone()),
                }))
                .is_err()
            {
                p.pending_profile = Some(profile.clone());
            }
        }
    }
    pub(super) fn connection(&self, id: &[u8], session: &Session) -> Option<&Peer> {
        self.peers
            .get(id)
            .filter(|p| p.session.same_instance(session))
            .or_else(|| {
                self.probes
                    .get(&session.id)
                    .filter(|p| p.bind.device_id == id && p.session.same_instance(session))
            })
    }
    pub(super) fn active_peer(&self, id: &[u8]) -> bool {
        self.data_has_peer(id)
            || self.descriptors.keys().any(|(p, _)| p == id)
            || self.calls.has_peer(id)
    }
    pub(super) fn business_streams(&self) -> usize {
        self.peers
            .values()
            .chain(self.probes.values())
            .filter(|p| p.session.business.load(Ordering::Acquire) && p.session.live())
            .count()
    }
    fn business_output_idle(&self, id: &[u8]) -> bool {
        self.peers.get(id).is_none_or(|p| p.send.is_idle())
            && self
                .probes
                .values()
                .filter(|p| p.bind.device_id == id && p.session.business.load(Ordering::Acquire))
                .all(|p| p.send.is_idle())
    }
    fn reserve_business_stream(&mut self, id: &[u8]) -> PResult<()> {
        if self.business_streams() < 16 {
            return Ok(());
        }
        // Every output reservation (control, business and selected writer frame)
        // must be drained on the owner and all retained streams before eviction.
        let victim = self
            .peers
            .iter()
            .filter(|(peer, _)| {
                peer.as_slice() != id && !self.active_peer(peer) && self.business_output_idle(peer)
            })
            .min_by_key(|(_, p)| p.used)
            .map(|(id, _)| id.clone());
        let Some(victim) = victim else {
            return Err(error(
                pb::ErrorCode::QueueFull,
                "business stream budget is full",
            ));
        };
        self.drop_business(&victim, session::unavailable());
        Ok(())
    }
    pub(super) fn promote(&mut self, id: &[u8], session: &Session) -> PResult<()> {
        if !session.live()
            || !self
                .connection(id, session)
                .is_some_and(|p| self.owner_current(id, p))
        {
            return Err(session::unavailable());
        }
        if self.capacity_excluded || self.evidence.quarantined.contains(id) {
            return Err(error(
                pb::ErrorCode::CapacityExceeded,
                "peer application gate closed",
            ));
        }
        if self
            .peers
            .get(id)
            .is_some_and(|p| p.session.same_instance(session))
        {
            return Ok(());
        }
        let Some(candidate) = self.probes.get(&session.id).filter(|p| {
            p.bind.device_id == id && p.session.same_instance(session) && p.session.live()
        }) else {
            return Err(session::unavailable());
        };
        // A promoted crossed receiver is business, but may not own output.
        // If the old output ended, it still needs installation in peers.
        let already_business = candidate.session.business.load(Ordering::Acquire);
        if let Some(old) = self.peers.get(id) {
            // Both devices may send on independently established streams before
            // either sees the other's first frame. Keep the existing output owner
            // and read the crossed stream: replacing or rejecting either stream
            // here can discard already accepted data and its terminal ACK.
            if old.session.live()
                && self
                    .probes
                    .get(&session.id)
                    .is_some_and(|p| p.bind.boot_id == old.bind.boot_id)
            {
                if !already_business {
                    self.reserve_business_stream(id)?;
                }
                session.business.store(true, Ordering::Release);
                return Ok(());
            }
            if old.session.live() && self.active_peer(id) {
                return Err(error(
                    pb::ErrorCode::QueueFull,
                    "peer has an active business session",
                ));
            }
        }
        if !already_business {
            self.reserve_business_stream(id)?;
        }
        let Some(mut p) = self.probes.remove(&session.id) else {
            return Err(session::unavailable());
        };
        if self.peers.contains_key(id) {
            // Take the selected live receiver out first: retiring the old owner
            // must settle its work without revoking this chosen replacement.
            let old = self.peers[id].clone();
            if old.bind.boot_id == p.bind.boot_id
                && !old.session.cancel.is_cancelled()
                && self.owner_current(id, &p)
            {
                self.retire_output(id, &old.session);
            } else {
                self.drop_business(
                    id,
                    error(
                        pb::ErrorCode::UnknownOutcome,
                        "authenticated output replaced",
                    ),
                );
            }
        }
        p.session.business.store(true, Ordering::Release);
        p.used = tokio::time::Instant::now();
        self.peers.insert(id.to_vec(), p);
        Ok(())
    }
    pub(super) async fn ensure_peer(&mut self, id: &[u8]) -> PResult<()> {
        if !self.admission.allows(id)
            || self.capacity_excluded
            || self.evidence.quarantined.contains(id)
        {
            return Err(error(
                pb::ErrorCode::PermissionDenied,
                "peer application gate closed",
            ));
        }
        if self.peers.get(id).is_some_and(|p| p.session.live()) {
            return Ok(());
        }
        if let Some(p) = self
            .probes
            .values()
            .find(|p| p.bind.device_id == id && p.session.live())
            .cloned()
        {
            return self.promote(id, &p.session);
        }
        // Acquisition belongs to queue_connection. This helper is deliberately local:
        // dispatch must never await Noise or Transport on the serialized owner.
        Err(session::unavailable())
    }

    pub(super) fn remove_device(&mut self, id: &[u8], reason: Option<pb::ProtocolError>) {
        self.published.remove(id);
        self.evidence.health.remove(id);
        self.profile_fetched.remove(id);
        if self.devices.remove(id).is_some() {
            let previous = self.revision;
            self.revision += 1;
            self.directory(
                pb::devices_event::Body::Removed(pb::DeviceRemoved {
                    device_id: id.to_vec(),
                    error: reason,
                }),
                previous,
            );
        }
    }
    pub(super) fn drop_business(&mut self, id: &[u8], reason: pb::ProtocolError) {
        self.probes.retain(|_, p| {
            if p.bind.device_id == id && p.session.business.load(Ordering::Acquire) {
                p.session.cancel.cancel();
                false
            } else {
                true
            }
        });
        if let Some(events) = &self.events {
            events.revoke_peer(id);
        }
        if let Some(p) = self.peers.remove(id) {
            p.session.cancel.cancel();
        }
        self.rpc_peers.remove(id);
        self.rpc_owners.retain(|(peer, _), _| peer != id);
        for call_id in self.calls.remove_peer(id) {
            self.emit(Event::Rpc(pb::RpcEvent {
                handler_id: self.calls.handler_id(id, &call_id),
                peer_device_id: id.to_vec(),
                body: Some(pb::rpc_event::Body::Cancel(pb::RpcCancel {
                    call_id,
                    error: Some(reason.clone()),
                })),
            }));
        }
        self.data_drop_peer(id, reason.clone());
        let pulls: Vec<_> = self
            .descriptors
            .keys()
            .filter(|(p, _)| p == id)
            .cloned()
            .collect();
        for key in pulls {
            if let Some(p) = self.descriptors.remove(&key) {
                self.emit(Event::Descriptor(pb::DescriptorResult {
                    query_id: key.1,
                    digest: p.digest,
                    result: Some(pb::descriptor_result::Result::Error(reason.clone())),
                }));
            }
        }
    }
    // Normal output retirement is not peer revocation. Inbound work on a live
    // sibling keeps its original reply stream; no calls or frames are migrated.
    pub(super) fn retire_output(&mut self, id: &[u8], session: &Session) {
        if self
            .peers
            .get(id)
            .is_some_and(|p| p.session.same_instance(session))
        {
            self.peers.remove(id);
        }
        session.cancel.cancel();
        self.retire_session_work(id, session);
    }
    pub(super) fn retire_session_work(&mut self, id: &[u8], session: &Session) {
        let reason = error(pb::ErrorCode::UnknownOutcome, "authenticated stream ended");
        self.data_retire_session(id, session, reason.clone());
        let calls: Vec<_> = self
            .rpc_owners
            .iter()
            .filter(|((peer, call), owner)| {
                peer == id && owner.session.same_instance(session) && self.calls.active(peer, call)
            })
            .map(|((_, call), _)| call.clone())
            .collect();
        for call in calls {
            self.rpc_failure(id, call, reason.clone());
        }
        self.rpc_owners
            .retain(|(peer, _), owner| peer != id || !owner.session.same_instance(session));
        let pulls: Vec<_> = self
            .descriptors
            .iter()
            .filter(|((peer, _), p)| peer == id && p.owner.session.same_instance(session))
            .map(|(key, _)| key.clone())
            .collect();
        for key in pulls {
            let p = self.descriptors.remove(&key).unwrap();
            self.emit(Event::Descriptor(pb::DescriptorResult {
                query_id: key.1,
                digest: p.digest,
                result: Some(pb::descriptor_result::Result::Error(reason.clone())),
            }));
        }
    }
    pub(super) fn capacity(&mut self) -> BTreeSet<Vec<u8>> {
        let admitted = self.evidence.admitted(
            self.local(),
            self.devices
                .values()
                .filter(|d| d.presence == pb::DevicePresence::Online as i32)
                .map(|d| d.device_id.clone()),
        );
        let excluded = !admitted.contains(self.local());
        if excluded != self.capacity_excluded {
            self.capacity_excluded = excluded;
            if let Some(discovery) = &self.discovery {
                let _ = discovery.try_send(crate::discovery::Control::Capacity(excluded));
            }
            let local = self.local().to_vec();
            if excluded {
                self.cancel_connections();
                for p in self.probes.values() {
                    p.session.cancel.cancel();
                }
                self.probes.clear();
                self.clones.clear();
                if let Some(events) = &self.events {
                    events.revoke_business();
                }
                let peers: Vec<_> = self.peers.keys().cloned().collect();
                for peer in peers {
                    self.drop_business(
                        &peer,
                        error(
                            pb::ErrorCode::CapacityExceeded,
                            "local device exceeds stable capacity",
                        ),
                    );
                }
                self.devices.retain(|id, _| *id == local);
            }
            if let Some(d) = self.devices.get_mut(&local) {
                d.presence = if excluded {
                    pb::DevicePresence::Offline
                } else {
                    pb::DevicePresence::Online
                } as i32;
            }
            let previous = self.revision;
            self.revision += 1;
            self.directory(
                pb::devices_event::Body::Reset(pb::DevicesReset {
                    snapshot: Some(self.snapshot()),
                    reason: pb::ResetReason::Resync as i32,
                }),
                previous,
            );
            self.emit(Event::Network(pb::NetworkState {
                running: true,
                reachable: !excluded,
                error: excluded.then(|| {
                    error(
                        pb::ErrorCode::CapacityExceeded,
                        "local device exceeds stable capacity",
                    )
                }),
            }));
        }
        let rejected: Vec<_> = self
            .devices
            .values()
            .filter(|d| {
                !d.is_local
                    && d.presence == pb::DevicePresence::Online as i32
                    && !admitted.contains(&d.device_id)
            })
            .map(|d| d.device_id.clone())
            .collect();
        for id in rejected {
            self.drop_business(
                &id,
                error(
                    pb::ErrorCode::CapacityExceeded,
                    "device exceeds stable capacity",
                ),
            );
            self.remove_device(
                &id,
                Some(error(
                    pb::ErrorCode::CapacityExceeded,
                    "device exceeds stable capacity",
                )),
            );
        }
        admitted
    }
    pub(super) fn receive_up(&mut self, mut up: Incoming) {
        let Incoming::Up {
            id, session, ready, ..
        } = &mut up
        else {
            return;
        };
        let (id, session, ready) = (id.clone(), session.clone(), ready.take());
        if ready
            .as_ref()
            .is_some_and(|r| tokio::time::Instant::now() >= r.deadline)
        {
            session.cancel.cancel();
            let _ = ready.unwrap().reply.send(Err(error(
                pb::ErrorCode::DeadlineExceeded,
                "connection acquisition deadline elapsed",
            )));
            return;
        }
        if ready.as_ref().is_some_and(|r| r.expected != id) {
            session.cancel.cancel();
            let _ = ready.unwrap().reply.send(Err(error(
                pb::ErrorCode::Conflict,
                "address authenticates a different device",
            )));
            return;
        }
        self.install_up(up);
        if let Some(ready) = ready {
            let result = if session.live() && self.connection(&id, &session).is_some() {
                Ok(())
            } else {
                Err(session::unavailable())
            };
            let _ = ready.reply.send(result);
        }
    }
    fn install_up(&mut self, up: Incoming) {
        let Incoming::Up {
            id,
            bind,
            ip,
            send,
            session,
            ..
        } = up
        else {
            return;
        };
        if self
            .transport
            .as_ref()
            .is_some_and(|t| !session.address_current(&t.status()))
        {
            session.cancel.cancel();
            return;
        }
        if self.transport.is_some() && self.auth.check_gate(session.generation, None).is_err() {
            session.cancel.cancel();
            return;
        }
        if self.generation != Some(session.generation)
            || self.stop.is_cancelled()
            || session.cancel.is_cancelled()
            || self.admission.epoch(&id) != Some(session.policy_epoch)
            || self.evidence.quarantined.contains(&id)
            || (!session.business.load(Ordering::Acquire)
                && self
                    .probes
                    .values()
                    .filter(|p| {
                        !p.session.business.load(Ordering::Acquire)
                            && !p.session.cancel.is_cancelled()
                    })
                    .count()
                    >= 48)
        {
            session.cancel.cancel();
            return;
        }
        if self
            .evidence
            .candidate(&id, tokio::time::Instant::now())
            .is_err()
        {
            session.cancel.cancel();
            self.emit(Event::Network(pb::NetworkState {
                running: true,
                reachable: !self.capacity_excluded,
                error: Some(error(
                    pb::ErrorCode::ResourceExhausted,
                    "authenticated candidate view is full",
                )),
            }));
            return;
        }
        let admitted = self.capacity();
        if self.capacity_excluded || !admitted.contains(&id) {
            session.cancel.cancel();
            return;
        }
        // Keep two different boots only long enough to challenge both sessions. Cached boot
        // differences alone never prove a clone, and cancelled old sessions cannot answer.
        let old = self
            .peers
            .get(&id)
            .or_else(|| self.probes.values().find(|p| p.bind.device_id == id))
            .filter(|p| p.bind.boot_id != bind.boot_id && !p.session.cancel.is_cancelled())
            .cloned();
        if let Some(old) = old {
            if !self.clones.contains_key(&id) {
                let first = noise::random_bytes::<16>().unwrap_or([1; 16]).to_vec();
                let second = noise::random_bytes::<16>().unwrap_or([2; 16]).to_vec();
                let _ = old.send.try_send(Body::Ping(pb::Ping {
                    nonce: first.clone(),
                }));
                let _ = send.try_send(Body::Ping(pb::Ping {
                    nonce: second.clone(),
                }));
                self.clones.insert(
                    id.clone(),
                    CloneChallenge {
                        deadline: tokio::time::Instant::now() + Duration::from_secs(10),
                        sessions: [old.session.id, session.id],
                        nonces: [first, second],
                        answered: [false, false],
                    },
                );
            } else {
                session.cancel.cancel();
                return;
            }
        }
        let _ = send.try_send(Body::Metadata(pb::PeerMetadata {
            profile: self.devices[self.local()].profile.clone(),
        }));
        // Outbound handshakes request business admission; only promotion grants
        // the persistent lifetime and its separate global stream budget.
        let business = session.business.swap(false, Ordering::AcqRel);
        self.probes.insert(
            session.id,
            Peer {
                send,
                session: session.clone(),
                bind,
                ip,
                used: tokio::time::Instant::now(),
                ping: None,
                pending_profile: None,
            },
        );
        if business && session.live() && self.promote(&id, &session).is_err() {
            session.cancel.cancel();
            self.probes.remove(&session.id);
        }
    }

    pub(super) async fn directory_maintenance(&mut self) {
        let now = tokio::time::Instant::now();
        let ready = self
            .transport
            .as_ref()
            .is_some_and(|t| t.status().phase == cyberbus_transport::AddressPhase::Ready);
        if let Some(t) = self.transport.clone() {
            let status = t.status();
            if self.transport_generation != Some(status.generation) || self.network_unready == ready
            {
                self.network_unready = !ready;
                self.transport_generation = Some(status.generation);
                let peers: Vec<_> = self.peers.keys().cloned().collect();
                for id in peers {
                    self.drop_business(
                        &id,
                        error(
                            pb::ErrorCode::UnknownOutcome,
                            "overlay address generation changed",
                        ),
                    );
                }
                for p in self.probes.values() {
                    p.session.cancel.cancel();
                }
                self.probes.clear();
                self.clones.clear();
                if status.phase == cyberbus_transport::AddressPhase::Ready {
                    let local = self.local().to_vec();
                    if let Some(d) = self.devices.get_mut(&local) {
                        d.virtual_ipv4 = status.ipv4.octets().to_vec();
                    }
                    self.changed(&local, false);
                    let _ = self.auth.commit_address_preference(status.ipv4);
                }
                self.emit(Event::Network(pb::NetworkState {
                    running: true,
                    reachable: ready,
                    error: (!ready)
                        .then(|| error(pb::ErrorCode::Conflict, "overlay address is changing")),
                }));
            }
        }
        self.evidence
            .candidates
            .retain(|_, t| now.duration_since(*t) < Duration::from_secs(30));
        if ready && self.generation.is_some() {
            let offline: Vec<_> = self
                .evidence
                .health
                .iter()
                .filter(|(id, h)| id.as_slice() != self.local() && h.should_offline(now))
                .map(|(id, _)| id.clone())
                .collect();
            for id in offline {
                if let Some(h) = self.evidence.health.get_mut(&id) {
                    h.offline = Some(now);
                }
                self.evidence.candidates.remove(&id);
                if let Some(d) = self.devices.get_mut(&id) {
                    d.presence = pb::DevicePresence::Offline as i32;
                    let d = d.clone();
                    let previous = self.revision;
                    self.revision += 1;
                    self.directory(
                        pb::devices_event::Body::Offline(pb::DeviceOffline { device: Some(d) }),
                        previous,
                    );
                }
                self.drop_business(
                    &id,
                    error(
                        pb::ErrorCode::DeviceUnreachable,
                        "device failed authentication probes across rounds",
                    ),
                );
            }
        }
        let expired: Vec<_> = self
            .evidence
            .health
            .iter()
            .filter(|(_, h)| {
                h.offline
                    .is_some_and(|t| now.duration_since(t) >= Duration::from_secs(600))
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            self.evidence.health.remove(&id);
            self.remove_device(&id, None);
        }
        self.capacity();
        let expired: Vec<_> = self
            .profile_queries
            .iter()
            .filter(|(_, q)| q.deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            let q = self.profile_queries.remove(&id).unwrap();
            self.profile_result(
                id,
                q.peer,
                q.conditional,
                false,
                Some(error(
                    pb::ErrorCode::DeadlineExceeded,
                    "descriptor authentication deadline",
                )),
            );
        }
        let expired: Vec<_> = self
            .clones
            .iter()
            .filter(|(_, c)| c.deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            let c = self.clones.remove(&id).unwrap();
            // One or no surviving boots is a normal replacement, not a clone. A failed
            // challenge never promotes either stale declaration into a new generation.
            for i in 0..2 {
                if !c.answered[i] {
                    if let Some(p) = self.probes.remove(&c.sessions[i]) {
                        p.session.cancel.cancel();
                    }
                    if self
                        .peers
                        .get(&id)
                        .is_some_and(|p| p.session.id == c.sessions[i])
                    {
                        self.drop_business(
                            &id,
                            error(
                                pb::ErrorCode::UnknownOutcome,
                                "old boot did not answer a fresh challenge",
                            ),
                        );
                    }
                }
            }
        }
        self.rpc_peers.retain(|_, deadline| *deadline > now);
        let ids: Vec<_> = self.peers.keys().cloned().collect();
        for id in ids {
            let busy = self.active_peer(&id);
            let output_idle = self.business_output_idle(&id);
            let mut dead = false;
            if let Some(p) = self.peers.get_mut(&id) {
                if let Some(profile) = p.pending_profile.take() {
                    if let Err(e) = p.send.try_send(Body::Metadata(pb::PeerMetadata {
                        profile: Some(profile),
                    })) {
                        if let Body::Metadata(m) = e.into_inner() {
                            p.pending_profile = m.profile;
                        }
                    }
                }
                if p.session.cancel.is_cancelled() {
                    dead = true;
                } else if p
                    .ping
                    .as_ref()
                    .is_some_and(|(_, sent)| now.duration_since(*sent) > Duration::from_secs(10))
                {
                    dead = true;
                } else if !busy
                    && now.duration_since(p.used) > Duration::from_secs(60)
                    && output_idle
                    && p.send.is_idle()
                {
                    dead = true;
                } else if p.ping.is_none()
                    && now.duration_since(p.used)
                        >= Duration::from_secs(24 + u64::from(p.session.id[0]) % 13)
                {
                    if let Ok(nonce) = noise::random_bytes::<16>() {
                        let nonce = nonce.to_vec();
                        if p.send
                            .try_send(Body::Ping(pb::Ping {
                                nonce: nonce.clone(),
                            }))
                            .is_ok()
                        {
                            p.ping = Some((nonce, now));
                        }
                    }
                }
            }
            if dead {
                self.drop_business(
                    &id,
                    error(
                        pb::ErrorCode::UnknownOutcome,
                        "business stream liveness expired",
                    ),
                );
            }
        }
        let idle: Vec<_> = self
            .probes
            .iter()
            .filter(|(_, p)| {
                p.session.business.load(Ordering::Acquire)
                    && !self.active_peer(&p.bind.device_id)
                    && now.duration_since(p.used) > Duration::from_secs(60)
                    && p.send.is_idle()
            })
            .map(|(key, _)| *key)
            .collect();
        for key in idle {
            if let Some(p) = self.probes.remove(&key) {
                p.session.cancel.cancel();
            }
        }
        self.probes.retain(|_, p| !p.session.cancel.is_cancelled());
    }
}
