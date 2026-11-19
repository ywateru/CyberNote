#![cfg(feature = "websocket")]
use cyberbus_transport::{Transport, TransportConfig};
use std::{sync::Arc, time::Duration};
use tokio_rustls::{TlsAcceptor, rustls};

#[tokio::test]
async fn native_wss_connector_rejects_self_signed_public_origin() {
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let config = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .unwrap()
    .with_no_client_auth()
    .with_single_cert(
        vec![cert.cert.der().clone()],
        rustls::pki_types::PrivatePkcs8KeyDer::from(cert.signing_key.serialize_der()).into(),
    )
    .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(config));
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let mut config = TransportConfig::new("tls-fixture".into(), "public".into(), [1; 32]);
    config.peers = vec![format!("wss://{}", listener.local_addr().unwrap())];
    config.listeners.clear();
    config.enable_p2p = false;
    let transport = Transport::start(config).await.unwrap();
    let handshake = tokio::time::timeout(Duration::from_secs(10), async {
        let (socket, _) = listener.accept().await.unwrap();
        acceptor.accept(socket).await
    })
    .await;
    transport.close().await.unwrap();
    assert!(handshake.is_ok(), "native connector must attempt TLS");
    assert!(
        handshake.unwrap().is_err(),
        "client must reject the untrusted certificate before completing TLS"
    );
}
