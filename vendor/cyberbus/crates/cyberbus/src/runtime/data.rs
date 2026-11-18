//! Data delivery has one application owner and one winning terminal outcome.
use super::*;
const TTL: Duration = Duration::from_secs(600);
const MIB: usize = 1024 * 1024;
pub(super) struct PendingData {
    pub(super) owner: Peer,
    pub(super) deadline: tokio::time::Instant,
    pub(super) stage: i32,
    pub(super) requested: i32,
}
pub(super) struct Replay {
    owner: Peer,
    pub(super) message: reassembly::DataAssembler,
    pub(super) deadline: tokio::time::Instant,
    _reservation: crate::rpc::ReassemblyReservation,
}
pub(super) struct Receiving {
    owner: Peer,
    pub(super) message: Option<reassembly::DataAssembler>,
    pub(super) deadline: tokio::time::Instant,
    pub(super) stage: i32,
    pub(super) digest: Option<[u8; 32]>,
    pub(super) terminal_error: Option<pb::ProtocolError>,
    pub(super) size: usize,
    requested: i32,
    terminal: bool,
    subscription: Option<Vec<u8>>,
    reservation: Option<crate::rpc::ReassemblyReservation>,
}
impl Runtime {
    pub(super) async fn dispatch_data(
        &mut self,
        body: pb::sdk_command::Body,
    ) -> PResult<ResultBody> {
        use pb::sdk_command::Body as C;
        match body {
            C::SubscribeData(c) => {
                if self.subscriptions.contains_key(&c.subscription_id)
                    || self.subscriptions.values().any(|types| {
                        types.is_empty()
                            || c.type_urls.is_empty()
                            || c.type_urls.iter().any(|ty| types.contains(ty))
                    })
                {
                    return Err(error(
                        pb::ErrorCode::Conflict,
                        "data subscription overlaps an existing owner",
                    ));
                }
                if self.subscriptions.len() >= 16 || c.type_urls.len() > 64 {
                    return Err(error(
                        pb::ErrorCode::ResourceExhausted,
                        "subscription limit",
                    ));
                }
                for ty in &c.type_urls {
                    self.validate_type(ty)?;
                }
                self.subscriptions.insert(c.subscription_id, c.type_urls);
            }
            C::UnsubscribeData(c) => {
                self.subscriptions.remove(&c.subscription_id);
                if let Some(events) = &self.events {
                    events.cancel_subscription(&c.subscription_id);
                }
                let keys: Vec<_> = self
                    .receiving
                    .iter()
                    .filter(|(_, r)| {
                        !r.terminal && r.subscription.as_ref() == Some(&c.subscription_id)
                    })
                    .map(|(k, _)| k.clone())
                    .collect();
                for key in keys {
                    self.data_fail(
                        &key,
                        error(pb::ErrorCode::Cancelled, "data subscription removed"),
                    );
                }
            }
            C::Send(c) => {
                let mut message = c
                    .message
                    .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing data message"))?;
                let budget = self.remaining_budget(message.timeout.as_ref())?;
                let deadline = tokio::time::Instant::now() + budget;
                self.validate_payload(message.fragment.as_ref().ok_or_else(|| {
                    error(pb::ErrorCode::InvalidArgument, "missing data payload")
                })?)?;
                let key = (c.peer_device_id.clone(), message.message_id.clone());
                // Completed IDs may be explicitly retried by the application. The receiver
                // verifies the digest and returns its known outcome without redelivery.
                if self.pending.contains_key(&key) {
                    return Err(error(pb::ErrorCode::Conflict, "duplicate message ID"));
                }
                if self.pending.len() >= 128
                    || self
                        .pending
                        .keys()
                        .filter(|(id, _)| *id == c.peer_device_id)
                        .count()
                        >= 8
                {
                    return Err(error(
                        pb::ErrorCode::ResourceExhausted,
                        "data in-flight limit",
                    ));
                }
                self.ensure_peer(&c.peer_device_id).await?;
                let remaining = deadline
                    .checked_duration_since(tokio::time::Instant::now())
                    .filter(|d| !d.is_zero())
                    .ok_or_else(|| {
                        error(
                            pb::ErrorCode::DeadlineExceeded,
                            "data expired during connection",
                        )
                    })?;
                message.timeout =
                    Some(prost_types::Duration::try_from(remaining).map_err(|_| {
                        error(pb::ErrorCode::InvalidArgument, "invalid data timeout")
                    })?);
                let fragments = session::split_data(&message)?;
                let peer = self
                    .peers
                    .get(&c.peer_device_id)
                    .ok_or_else(session::unavailable)?
                    .clone();
                if peer.send.capacity() < fragments.len() {
                    return Err(error(
                        pb::ErrorCode::ResourceExhausted,
                        "fragment output queue full",
                    ));
                }
                for f in fragments {
                    if let Err(e) = self.send_peer_at(&c.peer_device_id, Body::Data(f), deadline) {
                        // A later fragment may fail a shared byte reservation. Revoke the
                        // already queued prefix instead of leaving an orphaned reassembly.
                        let _ = self.send_peer(
                            &c.peer_device_id,
                            Body::DataCancel(pb::DataCancel {
                                message_id: message.message_id.clone(),
                            }),
                        );
                        self.remember_sent(key);
                        return Err(e);
                    }
                }
                self.pending.insert(
                    key,
                    PendingData {
                        owner: peer,
                        deadline,
                        stage: 0,
                        requested: message.requested_ack,
                    },
                );
            }
            C::CancelData(c) => {
                let key = (c.peer_device_id.clone(), c.message_id.clone());
                if let Some(pending) = self.pending.remove(&key) {
                    self.remember_sent(key);
                    self.emit(Event::DataStatus(pb::DataStatus {
                        peer_device_id: c.peer_device_id.clone(),
                        message_id: c.message_id.clone(),
                        result: Some(pb::data_status::Result::Error(error(
                            pb::ErrorCode::Cancelled,
                            "local cancellation; remote effects may already exist",
                        ))),
                    }));
                    let _ = self.send_owned(
                        &c.peer_device_id,
                        &pending.owner,
                        Body::DataCancel(pb::DataCancel {
                            message_id: c.message_id,
                        }),
                    );
                }
            }
            C::CompleteData(c) => {
                let key = (c.peer_device_id.clone(), c.message_id.clone());
                self.expire_inbound(&key);
                let r = self
                    .receiving
                    .get(&key)
                    .ok_or_else(|| error(pb::ErrorCode::NotFound, "no pending inbound data"))?;
                if r.terminal {
                    match &c.result {
                        Some(pb::complete_data::Result::Stage(stage))
                            if *stage == pb::AckStage::Accepted as i32
                                || *stage == pb::AckStage::Processed as i32 =>
                        {
                            if let Some(e) = &r.terminal_error {
                                return Err(e.clone());
                            }
                        }
                        Some(pb::complete_data::Result::Error(e)) if e.code != 0 => {
                            if r.terminal_error
                                .as_ref()
                                .is_some_and(|old| old.code == e.code)
                            {
                                return Ok(ResultBody::Ok(()));
                            }
                            return Err(error(pb::ErrorCode::Conflict, "data already completed"));
                        }
                        _ => {}
                    }
                }
                if !r.terminal && (!self.owner_current(&key.0, &r.owner) || !r.owner.session.live())
                {
                    let failure = error(pb::ErrorCode::UnknownOutcome, "receiving stream ended");
                    self.data_fail(&key, failure.clone());
                    return Err(failure);
                }
                if r.message.is_some() || r.stage < pb::AckStage::Accepted as i32 {
                    return Err(error(pb::ErrorCode::Conflict, "data has not been accepted"));
                }
                match c.result {
                    Some(pb::complete_data::Result::Stage(stage))
                        if stage == pb::AckStage::Accepted as i32 => {}
                    Some(pb::complete_data::Result::Stage(stage))
                        if stage == pb::AckStage::Processed as i32 =>
                    {
                        if !r.terminal {
                            let r = self.receiving.get_mut(&key).unwrap();
                            r.stage = stage;
                            r.terminal = true;
                            r.deadline = tokio::time::Instant::now() + TTL;
                            let _ = self.send_data_reply(
                                &key,
                                Body::DataAck(pb::DataAck {
                                    message_id: key.1.clone(),
                                    stage,
                                }),
                            );
                        }
                    }
                    Some(pb::complete_data::Result::Error(e)) => {
                        if e.code == pb::ErrorCode::Unspecified as i32 {
                            return Err(error(
                                pb::ErrorCode::InvalidArgument,
                                "missing completion error code",
                            ));
                        }
                        if !r.terminal {
                            self.data_fail(&key, e);
                        }
                    }
                    _ => {
                        return Err(error(
                            pb::ErrorCode::InvalidArgument,
                            "application completion must be ACCEPTED, PROCESSED or error",
                        ))
                    }
                }
            }
            _ => unreachable!("runtime routes only data commands"),
        }
        Ok(ResultBody::Ok(()))
    }
    fn remember_sent(&mut self, key: (Vec<u8>, Vec<u8>)) {
        self.data_sent
            .insert(key.clone(), tokio::time::Instant::now() + TTL);
        while self.data_sent.len() > 8192
            || self.data_sent.keys().filter(|(p, _)| *p == key.0).count() > 1024
        {
            let peer_full = self.data_sent.keys().filter(|(p, _)| *p == key.0).count() > 1024;
            let oldest = self
                .data_sent
                .iter()
                .filter(|((p, _), _)| !peer_full || *p == key.0)
                .min_by_key(|(_, t)| **t)
                .map(|(k, _)| k.clone())
                .unwrap();
            self.data_sent.remove(&oldest);
        }
    }
    #[cfg(test)]
    pub(super) fn receive_data_frame(&mut self, id: Vec<u8>, body: Body) {
        let owner = self.peers[&id].clone();
        self.receive_data_on(id, body, owner);
    }
    pub(super) fn receive_data_on(&mut self, id: Vec<u8>, body: Body, owner: Peer) {
        match body {
            Body::Data(message) => self.receive_data_from(id, message, owner),
            Body::DataAck(a) => {
                let key = (id.clone(), a.message_id.clone());
                if self
                    .pending
                    .get(&key)
                    .is_some_and(|p| !p.owner.session.same_instance(&owner.session))
                {
                    return;
                }
                if self.expire_outbound(&key) {
                    return;
                }
                let Some(p) = self.pending.get_mut(&key) else {
                    return;
                };
                if a.stage <= p.stage || a.stage > p.requested || !(1..=3).contains(&a.stage) {
                    return;
                }
                p.stage = a.stage;
                let terminal = a.stage == p.requested;
                if terminal {
                    self.pending.remove(&key);
                    self.remember_sent(key);
                }
                self.emit(Event::DataStatus(pb::DataStatus {
                    peer_device_id: id,
                    message_id: a.message_id,
                    result: Some(pb::data_status::Result::Stage(a.stage)),
                }));
            }
            Body::DataError(e) => {
                let key = (id.clone(), e.message_id.clone());
                if self
                    .pending
                    .get(&key)
                    .is_some_and(|p| !p.owner.session.same_instance(&owner.session))
                {
                    return;
                }
                if self.expire_outbound(&key) {
                    return;
                }
                if let Some(failure) = e.error.filter(|e| e.code != 0) {
                    if self.pending.remove(&key).is_some() {
                        self.remember_sent(key);
                        self.emit(Event::DataStatus(pb::DataStatus {
                            peer_device_id: id,
                            message_id: e.message_id,
                            result: Some(pb::data_status::Result::Error(failure)),
                        }));
                    }
                }
            }
            Body::DataCancel(c) => {
                let key = (id.clone(), c.message_id.clone());
                self.expire_inbound(&key);
                let Some(r) = self.receiving.get(&key) else {
                    return;
                };
                if !r.owner.session.same_instance(&owner.session) {
                    return;
                }
                if r.terminal {
                    return;
                }
                let started = r.stage >= pb::AckStage::Accepted as i32
                    && !self
                        .events
                        .as_ref()
                        .is_some_and(|tx| tx.cancel_data(&id, &c.message_id));
                self.data_fail(
                    &key,
                    error(
                        pb::ErrorCode::Cancelled,
                        "peer cancelled data; remote effects may already exist",
                    ),
                );
                if started {
                    self.emit(Event::PeerDataCancel(pb::PeerDataCancel {
                        peer_device_id: id,
                        message_id: c.message_id,
                    }));
                }
            }
            _ => unreachable!("runtime routes only data frames"),
        }
    }
    fn data_fail(&mut self, key: &(Vec<u8>, Vec<u8>), failure: pb::ProtocolError) {
        if let Some(r) = self.receiving.get_mut(key) {
            if r.terminal {
                return;
            }
            r.terminal = true;
            r.terminal_error = Some(failure.clone());
            r.message = None;
            r.reservation = None;
            r.size = 0;
            r.deadline = tokio::time::Instant::now() + TTL;
        }
        if let Some(tx) = &self.events {
            tx.cancel_data(&key.0, &key.1);
        }
        let _ = self.send_data_reply(
            key,
            Body::DataError(pb::DataError {
                message_id: key.1.clone(),
                error: Some(failure),
            }),
        );
    }
    fn expire_outbound(&mut self, key: &(Vec<u8>, Vec<u8>)) -> bool {
        if !self
            .pending
            .get(key)
            .is_some_and(|p| p.deadline <= tokio::time::Instant::now())
        {
            return false;
        }
        let pending = self.pending.remove(key).unwrap();
        self.remember_sent(key.clone());
        let _ = self.send_owned(
            &key.0,
            &pending.owner,
            Body::DataCancel(pb::DataCancel {
                message_id: key.1.clone(),
            }),
        );
        self.emit(Event::DataStatus(pb::DataStatus {
            peer_device_id: key.0.clone(),
            message_id: key.1.clone(),
            result: Some(pb::data_status::Result::Error(error(
                pb::ErrorCode::DeadlineExceeded,
                "data deadline before terminal ACK; remote effects may already exist",
            ))),
        }));
        true
    }
    fn expire_inbound(&mut self, key: &(Vec<u8>, Vec<u8>)) {
        if self
            .receiving
            .get(key)
            .is_some_and(|r| !r.terminal && r.deadline <= tokio::time::Instant::now())
        {
            self.data_fail(
                key,
                error(pb::ErrorCode::DeadlineExceeded, "inbound data deadline"),
            );
        }
    }
    pub(super) fn data_drop_peer(&mut self, peer: &[u8], failure: pb::ProtocolError) {
        if let Some(tx) = &self.events {
            tx.revoke_peer(peer);
        }
        self.replays.retain(|(p, _), _| p != peer);
        let keys: Vec<_> = self
            .pending
            .keys()
            .filter(|(p, _)| p == peer)
            .cloned()
            .collect();
        for key in keys {
            self.pending.remove(&key);
            self.remember_sent(key.clone());
            self.emit(Event::DataStatus(pb::DataStatus {
                peer_device_id: key.0,
                message_id: key.1,
                result: Some(pb::data_status::Result::Error(failure.clone())),
            }));
        }
        let keys: Vec<_> = self
            .receiving
            .iter()
            .filter(|((p, _), r)| p == peer && !r.terminal)
            .map(|(k, _)| k.clone())
            .collect();
        for key in keys {
            self.data_fail(&key, failure.clone());
        }
    }
    fn send_data_reply(&self, key: &(Vec<u8>, Vec<u8>), body: Body) -> PResult<()> {
        let r = self.receiving.get(key).ok_or_else(session::unavailable)?;
        self.send_owned(&key.0, &r.owner, body)
    }
    pub(super) fn data_retire_session(
        &mut self,
        peer: &[u8],
        session: &Session,
        failure: pb::ProtocolError,
    ) {
        self.replays
            .retain(|(p, _), r| p != peer || !r.owner.session.same_instance(session));
        let keys: Vec<_> = self
            .pending
            .iter()
            .filter(|((p, _), r)| p == peer && r.owner.session.same_instance(session))
            .map(|(key, _)| key.clone())
            .collect();
        for key in keys {
            self.pending.remove(&key);
            self.remember_sent(key.clone());
            self.emit(Event::DataStatus(pb::DataStatus {
                peer_device_id: key.0,
                message_id: key.1,
                result: Some(pb::data_status::Result::Error(failure.clone())),
            }));
        }
        let keys: Vec<_> = self
            .receiving
            .iter()
            .filter(|((p, _), r)| {
                p == peer && !r.terminal && r.owner.session.same_instance(session)
            })
            .map(|(key, _)| key.clone())
            .collect();
        for key in keys {
            self.data_fail(&key, failure.clone());
        }
    }
    pub(super) fn data_has_peer(&self, peer: &[u8]) -> bool {
        self.receiving
            .iter()
            .any(|((p, _), r)| p == peer && !r.terminal)
            || self.pending.keys().any(|(p, _)| p == peer)
    }
    pub(super) fn data_maintenance(&mut self) {
        let now = tokio::time::Instant::now();
        self.replays.retain(|_, r| r.deadline > now);
        self.data_sent.retain(|_, t| *t > now);
        let keys: Vec<_> = self.pending.keys().cloned().collect();
        for key in keys {
            self.expire_outbound(&key);
        }
        let keys: Vec<_> = self.receiving.keys().cloned().collect();
        for key in keys {
            self.expire_inbound(&key);
        }
        self.receiving
            .retain(|_, r| !r.terminal || r.deadline > now);
    }
    fn reserve_data_slot(&mut self, peer: &[u8]) -> PResult<()> {
        self.data_maintenance();
        let active = self.receiving.values().filter(|r| !r.terminal).count();
        let peer_active = self
            .receiving
            .iter()
            .filter(|((p, _), r)| p == peer && !r.terminal)
            .count();
        if active >= 128 || peer_active >= 8 {
            return Err(error(
                pb::ErrorCode::ResourceExhausted,
                "inbound data capacity reached",
            ));
        }
        loop {
            let peer_full = self
                .receiving
                .iter()
                .filter(|((p, _), r)| p == peer && r.terminal)
                .count()
                >= 1024;
            if self.receiving.len() < 8192 && !peer_full {
                break;
            }
            let Some(oldest) = self
                .receiving
                .iter()
                .filter(|((p, _), r)| r.terminal && (!peer_full || p == peer))
                .min_by_key(|(_, r)| r.deadline)
                .map(|(k, _)| k.clone())
            else {
                break;
            };
            self.receiving.remove(&oldest);
            self.replays.remove(&oldest);
        }
        Ok(())
    }
    #[cfg(test)]
    pub(super) fn receive_data(&mut self, id: Vec<u8>, message: pb::DataMessage) {
        let owner = self.peers[&id].clone();
        self.receive_data_from(id, message, owner);
    }
    fn receive_data_from(&mut self, id: Vec<u8>, message: pb::DataMessage, owner: Peer) {
        let key = (id.clone(), message.message_id.clone());
        self.expire_inbound(&key);
        if self
            .receiving
            .get(&key)
            .is_some_and(|r| r.message.is_none())
        {
            self.receive_replay(key, message, owner);
            return;
        }
        if self
            .receiving
            .get(&key)
            .is_some_and(|r| !r.owner.session.same_instance(&owner.session))
        {
            let _ = self.send_owned(
                &id,
                &owner,
                Body::DataError(pb::DataError {
                    message_id: key.1,
                    error: Some(error(
                        pb::ErrorCode::Conflict,
                        "data belongs to another stream",
                    )),
                }),
            );
            return;
        }
        if !self.receiving.contains_key(&key) {
            let result = (|| {
                self.reserve_data_slot(&id)?;
                let size = message
                    .fragment
                    .as_ref()
                    .map_or(0, |f| f.total_size as usize);
                let reservation = self.reassembly_budget.reserve(size)?;
                let assembler = reassembly::DataAssembler::new(&message, MIB)
                    .map_err(|e| e.to_protocol_error())?;
                Ok::<_, pb::ProtocolError>((size, reservation, assembler))
            })();
            let (size, reservation, assembler) = match result {
                Ok(parts) => parts,
                Err(e) => {
                    let _ = self.send_owned(
                        &id,
                        &owner,
                        Body::DataError(pb::DataError {
                            message_id: key.1,
                            error: Some(e),
                        }),
                    );
                    return;
                }
            };
            self.receiving.insert(
                key.clone(),
                Receiving {
                    owner,
                    message: Some(assembler),
                    deadline: tokio::time::Instant::now() + timeout(message.timeout.as_ref()),
                    stage: 0,
                    digest: None,
                    terminal_error: None,
                    size,
                    requested: message.requested_ack,
                    terminal: false,
                    subscription: None,
                    reservation: Some(reservation),
                },
            );
        }
        match self
            .receiving
            .get_mut(&key)
            .unwrap()
            .message
            .as_mut()
            .unwrap()
            .push(&message)
        {
            Ok(false) => return,
            Err(e) => {
                self.data_fail(&key, e.to_protocol_error());
                return;
            }
            Ok(true) => {}
        }
        let assembler = self
            .receiving
            .get_mut(&key)
            .unwrap()
            .message
            .take()
            .unwrap();
        let complete = match assembler.finish() {
            Ok(m) => m,
            Err(e) => {
                self.data_fail(&key, e.to_protocol_error());
                return;
            }
        };
        self.receiving.get_mut(&key).unwrap().digest = Some(data_digest(&complete));
        let fragment = complete.fragment.as_ref().unwrap();
        if let Err(e) = self.validate_payload(fragment) {
            self.data_fail(&key, e);
            return;
        }
        self.receiving.get_mut(&key).unwrap().stage = pb::AckStage::Received as i32;
        let _ = self.send_data_reply(
            &key,
            Body::DataAck(pb::DataAck {
                message_id: key.1.clone(),
                stage: pb::AckStage::Received as i32,
            }),
        );
        let owner = self
            .subscriptions
            .iter()
            .find(|(_, types)| types.is_empty() || types.contains(&fragment.application_type_url))
            .map(|(id, _)| id.clone());
        let Some(subscription_id) = owner else {
            self.data_fail(
                &key,
                error(pb::ErrorCode::NotFound, "no data subscription accepts type"),
            );
            return;
        };
        self.sequence += 1;
        let event = pb::SdkEvent {
            event_sequence: self.sequence,
            runtime_id: self.id.clone(),
            body: Some(Event::DataReceived(pb::DataReceived {
                subscription_id: subscription_id.clone(),
                peer_device_id: id.clone(),
                message: Some(complete),
            })),
        };
        let queued = self
            .events
            .as_ref()
            .ok_or_else(|| error(pb::ErrorCode::Cancelled, "event consumer closed"))
            .and_then(|tx| tx.send_data(event));
        if let Err(mut e) = queued {
            if e.code == pb::ErrorCode::QueueFull as i32 {
                e = error(
                    pb::ErrorCode::ResourceExhausted,
                    "data subscription queue budget exhausted",
                );
            }
            self.data_fail(&key, e);
            return;
        }
        let r = self.receiving.get_mut(&key).unwrap();
        r.reservation = None;
        r.size = 0;
        r.subscription = Some(subscription_id);
        r.stage = pb::AckStage::Accepted as i32;
        if r.requested <= r.stage {
            r.terminal = true;
            r.deadline = tokio::time::Instant::now() + TTL;
        }
        if r.requested >= pb::AckStage::Accepted as i32 {
            let _ = self.send_data_reply(
                &key,
                Body::DataAck(pb::DataAck {
                    message_id: key.1.clone(),
                    stage: pb::AckStage::Accepted as i32,
                }),
            );
        }
    }
    fn receive_replay(&mut self, key: (Vec<u8>, Vec<u8>), message: pb::DataMessage, owner: Peer) {
        if self
            .replays
            .get(&key)
            .is_some_and(|r| !r.owner.session.same_instance(&owner.session))
        {
            return;
        }
        if !self.replays.contains_key(&key) {
            if self.replays.len() >= 8 {
                self.replay_error(
                    &key,
                    &owner,
                    error(pb::ErrorCode::ResourceExhausted, "data replay capacity"),
                );
                return;
            }
            let size = message
                .fragment
                .as_ref()
                .map_or(0, |f| f.total_size as usize);
            let reserved = self.reassembly_budget.reserve(size);
            let result = reserved.and_then(|reservation| {
                reassembly::DataAssembler::new(&message, MIB)
                    .map(|assembler| (reservation, assembler))
                    .map_err(|e| e.to_protocol_error())
            });
            let (reservation, assembler) = match result {
                Ok(v) => v,
                Err(e) => {
                    self.replay_error(&key, &owner, e);
                    return;
                }
            };
            self.replays.insert(
                key.clone(),
                Replay {
                    owner: owner.clone(),
                    message: assembler,
                    deadline: tokio::time::Instant::now() + timeout(message.timeout.as_ref()),
                    _reservation: reservation,
                },
            );
        }
        match self.replays.get_mut(&key).unwrap().message.push(&message) {
            Ok(false) => return,
            Err(e) => {
                self.replays.remove(&key);
                self.replay_error(&key, &owner, e.to_protocol_error());
                return;
            }
            Ok(true) => {}
        }
        let replay = self.replays.remove(&key).unwrap();
        let complete = match replay.message.finish() {
            Ok(m) => m,
            Err(e) => {
                self.replay_error(&key, &owner, e.to_protocol_error());
                return;
            }
        };
        let stored = &self.receiving[&key];
        let response = if stored.digest.is_some_and(|d| d != data_digest(&complete)) {
            Body::DataError(pb::DataError {
                message_id: key.1.clone(),
                error: Some(error(
                    pb::ErrorCode::Conflict,
                    "message ID reused with different content",
                )),
            })
        } else if let Some(e) = &stored.terminal_error {
            Body::DataError(pb::DataError {
                message_id: key.1.clone(),
                error: Some(e.clone()),
            })
        } else {
            Body::DataAck(pb::DataAck {
                message_id: key.1.clone(),
                stage: stored.stage.min(stored.requested),
            })
        };
        let _ = self.send_owned(&key.0, &owner, response);
    }
    fn replay_error(&self, key: &(Vec<u8>, Vec<u8>), owner: &Peer, e: pb::ProtocolError) {
        let _ = self.send_owned(
            &key.0,
            owner,
            Body::DataError(pb::DataError {
                message_id: key.1.clone(),
                error: Some(e),
            }),
        );
    }
}
fn data_digest(message: &pb::DataMessage) -> [u8; 32] {
    let f = message.fragment.as_ref().expect("complete data fragment");
    let ack = message.requested_ack.to_string();
    let encoding = f.encoding.to_string();
    let encoded = noise::encode_parts(&[
        &message.in_reply_to,
        ack.as_bytes(),
        f.application_type_url.as_bytes(),
        encoding.as_bytes(),
        &f.protobuf_bytes,
    ])
    .expect("bounded data fields");
    Sha256::digest(encoded).into()
}
#[cfg(test)]
mod tests;
