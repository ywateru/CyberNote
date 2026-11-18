//! AuthManager owns network work and grants; this dispatcher only submits and consumes
//! ready outcomes. No OAuth/discovery/cloud future borrows the serialized runtime.
use super::*;
use cyberbus_auth::OperationReady;
pub(super) struct Reply {
    pub id: Vec<u8>,
    pub sender: tokio::sync::oneshot::Sender<pb::SdkResult>,
}
impl Reply {
    pub fn finish(self, result: PResult<ResultBody>) {
        let _ = self.sender.send(pb::SdkResult {
            command_id: self.id,
            body: Some(result.unwrap_or_else(ResultBody::Error)),
        });
    }
}
// Operation phases describe progress without changing the auth owner's state.
// Project only fields that are valid for the emitted phase.
fn operation_event(
    mut event: pb::AuthEvent,
    phase: pb::AuthPhase,
    failure: Option<pb::ProtocolError>,
) -> pb::AuthEvent {
    event.phase = phase as i32;
    event.error = failure;
    if phase != pb::AuthPhase::Authenticated {
        event.account = None;
    }
    event
}
impl Runtime {
    pub(super) fn auth_phase(
        &mut self,
        id: Vec<u8>,
        phase: pb::AuthPhase,
        failure: Option<pb::ProtocolError>,
    ) {
        self.auth_seen_revision = self.auth.snapshot().state_revision;
        self.auth_revision += 1;
        let event = operation_event(self.auth_event(id), phase, failure);
        self.emit(Event::Auth(event));
    }
    pub(super) async fn submit_auth_command(
        &mut self,
        command: pb::SdkCommand,
        reply: Reply,
    ) -> bool {
        use pb::sdk_command::Body as C;
        let result: PResult<Option<[u8; 16]>> = match command.body {
            Some(C::AuthStart(c)) => {
                if self.transport.is_some() || self.starting.is_some() {
                    self.stop_network().await;
                }
                let mode = match pb::AuthIntent::try_from(c.intent) {
                    Ok(pb::AuthIntent::Login) => Ok(AuthMode::Login),
                    Ok(pb::AuthIntent::Register) => Ok(AuthMode::Register),
                    _ => Err(error(pb::ErrorCode::InvalidArgument, "invalid auth intent")),
                };
                mode.and_then(|mode| {
                    self.auth
                        .submit_begin_auth(mode)
                        .map(|id| Some(id.0))
                        .map_err(auth_error)
                })
            }
            Some(C::AuthCallback(c)) => id16(&c.operation_id)
                .and_then(|id| {
                    self.auth
                        .submit_complete_auth(OperationId(id), &c.callback_uri)
                        .map_err(auth_error)
                })
                .map(|_| None),
            Some(C::AuthRestore(c)) => {
                let result = id16(&c.operation_id).and_then(|id| {
                    self.auth
                        .submit_restore_auth(OperationId(id))
                        .map_err(auth_error)
                });
                if result.is_ok() {
                    self.auth_phase(c.operation_id, pb::AuthPhase::Restoring, None);
                }
                result.map(|_| None)
            }
            Some(C::AuthCancel(c)) => id16(&c.operation_id)
                .and_then(|id| {
                    self.auth
                        .cancel_operation(OperationId(id))
                        .map_err(auth_error)
                })
                .map(|_| None),
            Some(C::AuthLogout(c)) => {
                self.stop_network().await;
                let policy = match c.cloud_policy.unwrap_or(1) {
                    1 => Ok(LogoutPolicy::LocalOnly),
                    2 => Ok(LogoutPolicy::RevokeGrant),
                    3 => Ok(LogoutPolicy::EndSession),
                    4 => Ok(LogoutPolicy::RevokeAndEndSession),
                    _ => Err(error(
                        pb::ErrorCode::InvalidArgument,
                        "invalid logout policy",
                    )),
                };
                policy.and_then(|p| {
                    self.auth
                        .submit_logout(
                            p,
                            timeout(c.cloud_budget.as_ref()).min(Duration::from_secs(30)),
                        )
                        .map(|id| Some(id.0))
                        .map_err(auth_error)
                })
            }
            _ => return false,
        };
        match result {
            Ok(Some(id)) => {
                self.auth_replies.insert(id, reply);
            }
            Ok(None) => reply.finish(Ok(ResultBody::Ok(()))),
            Err(e) => reply.finish(Err(e)),
        }
        true
    }
    pub(super) fn drain_auth_ready(&mut self) {
        while let Some(ready) = self.auth.poll_ready() {
            match ready {
                OperationReady::AuthStarted(a) => {
                    self.auth_changed(a.operation_id.0.to_vec());
                    if let Some(reply) = self.auth_replies.remove(&a.operation_id.0) {
                        reply.finish(Ok(ResultBody::AuthStarted(pb::AuthStarted {
                            operation_id: a.operation_id.0.to_vec(),
                            authorization_uri: a.authorization_url,
                            expires_at: Some(timestamp(a.expires_at)),
                        })));
                    }
                }
                OperationReady::AuthFinished {
                    operation_id,
                    result,
                } => {
                    let phase = match result.as_ref() {
                        Ok(_) => pb::AuthPhase::Authenticated,
                        Err(cyberbus_auth::Error::Cancelled) => pb::AuthPhase::AuthCancelled,
                        Err(
                            cyberbus_auth::Error::ReauthRequired
                            | cyberbus_auth::Error::SessionRevoked,
                        ) => pb::AuthPhase::ReauthRequired,
                        Err(_) => pb::AuthPhase::Failed,
                    };
                    self.auth_phase(
                        operation_id.0.to_vec(),
                        phase,
                        result.as_ref().err().copied().map(auth_error),
                    );
                    if let Some(reply) = self.auth_replies.remove(&operation_id.0) {
                        reply.finish(result.map(|_| ResultBody::Ok(())).map_err(auth_error));
                    }
                }
                OperationReady::LogoutFinished {
                    operation_id,
                    result,
                } => {
                    self.logout_ready.insert(operation_id.0, result);
                    self.auth_changed(operation_id.0.to_vec());
                }
            }
        }
        if self.closing.is_empty() {
            for (id, r) in std::mem::take(&mut self.logout_ready) {
                if let Some(reply) = self.auth_replies.remove(&id) {
                    reply.finish(Ok(ResultBody::AuthLogout(pb::AuthLogoutResult {
                        local_closed: r.local_closed && self.cleanup_error.is_none(),
                        cloud_status: match r.cloud_status {
                            CloudLogout::NotRequested => 1,
                            CloudLogout::Succeeded => 2,
                            CloudLogout::Failed => 3,
                            CloudLogout::Unsupported => 4,
                            CloudLogout::UnknownOutcome => 5,
                        },
                        local_error: self.cleanup_error.clone().or(r.local_error.map(auth_error)),
                        cloud_error: r.cloud_error.map(auth_error),
                    })));
                }
            }
        }
    }
    pub(super) fn schedule_auth_validation(&mut self) {
        let snapshot = self.auth.snapshot();
        if !snapshot.request_in_flight
            && snapshot
                .next_validation
                .is_some_and(|due| self.clock.elapsed() >= due)
            && snapshot.refresh_supported
            && !snapshot.refresh_grant_frozen
        {
            let _ = self.auth.submit_refresh();
        }
        if let Some(deadline) = self.auth.snapshot().lease_deadline {
            *self.lease.lock().unwrap() = deadline;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authenticated_snapshot_projects_strict_operation_events_without_changing_owner_fields() {
        let snapshot = pb::AuthEvent {
            operation_id: vec![7; 16],
            phase: pb::AuthPhase::Authenticated as i32,
            state_revision: 9,
            refresh_supported: true,
            account: Some(pb::AccountSummary {
                issuer: "https://issuer.example/oidc".into(),
                subject: "public-subject".into(),
                product_id: "cyberbus".into(),
            }),
            validation_lease_expires_at: Some(prost_types::Timestamp {
                seconds: 1800000000,
                nanos: 0,
            }),
            ..Default::default()
        };
        let mut incompatible = snapshot.clone();
        incompatible.phase = pb::AuthPhase::Restoring as i32;
        assert!(
            codec::encode(&incompatible).is_err(),
            "codec must still reject account on RESTORING"
        );
        for phase in [
            pb::AuthPhase::Restoring,
            pb::AuthPhase::Failed,
            pb::AuthPhase::Authorizing,
            pb::AuthPhase::AuthCancelled,
            pb::AuthPhase::Degraded,
            pb::AuthPhase::ConfigurationError,
            pb::AuthPhase::LoggedOut,
            pb::AuthPhase::Authenticated,
        ] {
            let event = operation_event(snapshot.clone(), phase, None);
            assert_eq!(
                event.account.is_some(),
                phase == pb::AuthPhase::Authenticated
            );
            assert_eq!(event.refresh_supported, snapshot.refresh_supported);
            assert_eq!(
                event.validation_lease_expires_at,
                snapshot.validation_lease_expires_at
            );
            assert_eq!(event.operation_id, snapshot.operation_id);
            assert_eq!(event.state_revision, snapshot.state_revision);
            codec::encode(&pb::SdkEvent {
                event_sequence: 1,
                runtime_id: vec![1; 16],
                body: Some(Event::Auth(event)),
            })
            .unwrap();
        }
        // Projecting RESTORING must not erase the owner's actual authenticated account.
        assert!(snapshot.account.is_some());
    }
}
