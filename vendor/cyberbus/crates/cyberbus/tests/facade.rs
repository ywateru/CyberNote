use cyberbus::{pb, Client, ClientConfig, StoreMode};
use cyberbus_auth::MemoryStore;
use cyberbus_protocol::{codec, noise};
use std::time::Duration;
fn config() -> ClientConfig {
    ClientConfig::from_json(r#"{"issuer":"https://auth.example.com/oidc","client_id":"example-native-client","resource":"https://cyberbus.example/api","product_id":"cyberbus","native_clients":{"example-native-client":"cyberbus"},"redirect_uri":"http://127.0.0.1:18765/callback"}"#).unwrap()
}
fn command(body: pb::sdk_command::Body) -> pb::SdkCommand {
    pb::SdkCommand {
        command_id: noise::random_bytes::<16>().unwrap().to_vec(),
        body: Some(body),
    }
}
#[tokio::test]
async fn offline_identity_events_strict_dispatch_and_close() {
    fn send_sync<T: Send + Sync>() {}
    send_sync::<Client>();
    let client = Client::new(
        config(),
        Box::new(MemoryStore::default()),
        StoreMode::CreateNew,
    )
    .await
    .unwrap();
    let auth = client
        .execute(command(pb::sdk_command::Body::GetAuthState(
            pb::GetAuthState {},
        )))
        .await;
    codec::encode(&auth).unwrap();
    match auth.body.unwrap() {
        pb::sdk_result::Body::AuthState(a) => {
            assert_eq!(a.phase, pb::AuthPhase::LoggedOut as i32);
            assert_eq!(a.state_revision, 1);
            assert!(!a.refresh_supported);
        }
        _ => panic!("wrong result"),
    }
    let watch = command(pb::sdk_command::Body::WatchDevices(pb::WatchDevices {
        watch_id: vec![2; 16],
    }));
    let result = client.execute(watch.clone()).await;
    assert_eq!(result.command_id, watch.command_id);
    codec::encode(&result).unwrap();
    let initial = client.poll_event(Duration::from_secs(1)).await.unwrap();
    codec::encode(&initial).unwrap();
    match initial.body.unwrap() {
        pb::sdk_event::Body::Devices(d) => match d.body.unwrap() {
            pb::devices_event::Body::Snapshot(s) => {
                assert_eq!(s.devices.len(), 1);
                let d = &s.devices[0];
                assert!(d.is_local);
                assert_eq!(d.device_id.len(), 32);
                assert_eq!(d.presence, pb::DevicePresence::Offline as i32);
                assert!(d.profile.is_none());
                assert!(d.virtual_ipv4.is_empty());
            }
            _ => panic!("not snapshot"),
        },
        _ => panic!("not devices"),
    }
    let rejected = client
        .execute(command(pb::sdk_command::Body::NetworkStart(
            pb::NetworkStart {
                private_config: None,
            },
        )))
        .await;
    assert!(matches!(
        rejected.body,
        Some(pb::sdk_result::Body::Error(_))
    ));
    let mut ambiguous = codec::encode(&watch).unwrap();
    let query = command(pb::sdk_command::Body::GetDevices(pb::GetDevices {
        query_id: vec![3; 16],
    }));
    ambiguous.extend_from_slice(&codec::encode(&query).unwrap());
    let rejection = codec::decode_result(&client.execute_bytes(&ambiguous).await).unwrap();
    assert!(matches!(
        rejection.body,
        Some(pb::sdk_result::Body::Error(_))
    ));
    let mut events = client.take_event_receiver().await.unwrap();
    assert!(client.take_event_receiver().await.is_none());
    assert!(client.poll_event(Duration::ZERO).await.is_none());
    let close = client
        .execute(command(pb::sdk_command::Body::SdkClose(pb::SdkClose {})))
        .await;
    codec::encode(&close).unwrap();
    assert!(matches!(
        close.body,
        Some(pb::sdk_result::Body::SdkClosed(_))
    ));
    while let Some(event) = tokio::time::timeout(Duration::from_secs(2), events.recv())
        .await
        .unwrap()
    {
        codec::encode(&event).unwrap();
    }
    let closed = client
        .execute(command(pb::sdk_command::Body::GetAuthState(
            pb::GetAuthState {},
        )))
        .await;
    assert!(
        matches!(closed.body,Some(pb::sdk_result::Body::Error(e))if e.code==pb::ErrorCode::Cancelled as i32)
    );
}
#[test]
fn deployment_manifest_and_secret_rejection() {
    let raw = r#"{"issuer":"https://auth.example.com/oidc","client_id":"native","resource":"https://cyberbus.example/api","product_id":"cyberbus","redirect_uris":["http://127.0.0.1:18765/callback","cyberbus://auth/callback"],"bootstrap":{"peers":["tcp://relay.example.invalid:11010"]}}"#;
    let config = ClientConfig::from_json(raw).unwrap();
    assert_eq!(config.native_clients["native"], "cyberbus");
    assert_eq!(config.bootstrap_peers.len(), 1);
    assert!(!config.persist_grant);
    let opted_in = raw.replacen('{', "{\"persist_grant\":true,", 1);
    assert!(ClientConfig::from_json(&opted_in).unwrap().persist_grant);
    let with_secret = raw.replacen('{', "{\"seed\":\"rejected\",", 1);
    assert!(ClientConfig::from_json(&with_secret).is_err());
}

#[tokio::test]
async fn restore_without_grant_is_accepted_with_ordered_terminal_and_close_is_idempotent() {
    let client = Client::new(
        config(),
        Box::new(MemoryStore::default()),
        StoreMode::CreateNew,
    )
    .await
    .unwrap();
    let op = vec![7; 16];
    let accepted = client
        .execute(command(pb::sdk_command::Body::AuthRestore(
            pb::AuthRestore {
                operation_id: op.clone(),
            },
        )))
        .await;
    assert!(matches!(accepted.body, Some(pb::sdk_result::Body::Ok(()))));
    let mut phases = Vec::new();
    while phases.len() < 2 {
        let e = client.poll_event(Duration::from_secs(1)).await.unwrap();
        codec::encode(&e).unwrap();
        if let Some(pb::sdk_event::Body::Auth(a)) = e.body {
            if a.operation_id == op {
                phases.push((a.phase, a.state_revision, a.error));
            }
        }
    }
    assert_eq!(phases[0].0, pb::AuthPhase::Restoring as i32);
    assert_eq!(phases[1].0, pb::AuthPhase::Failed as i32);
    assert!(phases[1].1 > phases[0].1);
    assert_eq!(
        phases[1].2.as_ref().unwrap().code,
        pb::ErrorCode::Unauthenticated as i32
    );
    let first = client
        .execute(command(pb::sdk_command::Body::SdkClose(pb::SdkClose {})))
        .await;
    let retry = command(pb::sdk_command::Body::SdkClose(pb::SdkClose {}));
    let retry_id = retry.command_id.clone();
    let second = client.execute(retry).await;
    assert_eq!(second.command_id, retry_id);
    assert_eq!(first.body, second.body);
}
