use cyberbus_transport::{AddressPhase, BoxStream, CancellationToken, Transport, TransportConfig};
use sha2::{Digest, Sha256};
use std::{
    net::{Ipv4Addr, SocketAddrV4},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    time::{Instant, timeout},
};

const NAME: &str = "cyberbus-native-integration-public-fixture";
const SECRET: &str = "public-test-only-not-a-real-credential";
fn cfg(id: u8, ip: &str) -> TransportConfig {
    let mut c = TransportConfig::new(NAME.into(), SECRET.into(), [id; 32]);
    c.preferred_ipv4 = Some(ip.parse().unwrap());
    c.enable_p2p = false;
    c.listeners = vec!["tcp://127.0.0.1:0".into()];
    c
}
async fn ready(t: &Transport) {
    t.wait_ready(
        Instant::now() + Duration::from_secs(10),
        &CancellationToken::new(),
    )
    .await
    .unwrap();
}
async fn route(t: &Transport, ip: Ipv4Addr) {
    timeout(Duration::from_secs(30), async {
        loop {
            if t.routes().await.unwrap().iter().any(|r| r.ipv4 == ip) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .expect("whole-network route must converge");
}

async fn assert_stream_cancelled(stream: &mut BoxStream) {
    timeout(Duration::from_secs(2), async {
        for _ in 0..3 {
            assert_eq!(
                stream
                    .write(b"after cancellation")
                    .await
                    .unwrap_err()
                    .kind(),
                std::io::ErrorKind::ConnectionAborted
            );
            assert_eq!(
                stream.shutdown().await.unwrap_err().kind(),
                std::io::ErrorKind::ConnectionAborted
            );
            assert_eq!(
                stream.flush().await.unwrap_err().kind(),
                std::io::ErrorKind::ConnectionAborted
            );
            assert_eq!(
                stream.read(&mut [0]).await.unwrap_err().kind(),
                std::io::ErrorKind::ConnectionAborted
            );
        }
    })
    .await
    .expect("cancelled stream IO and cleanup must finish promptly");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_two_instances_and_independent_canary() -> anyhow::Result<()> {
    timeout(Duration::from_secs(100), run()).await??;
    Ok(())
}
async fn run() -> anyhow::Result<()> {
    let cancel = CancellationToken::new();
    let b = Transport::start(cfg(2, "10.144.0.2")).await?;
    ready(&b).await;
    let endpoint = b
        .running_listeners()
        .into_iter()
        .find(|x| x.starts_with("tcp:"))
        .unwrap();
    let mut ac = cfg(1, "10.144.0.1");
    ac.peers = vec![endpoint.clone()];
    let a = Transport::start(ac).await?;
    ready(&a).await;
    route(&a, b.status().ipv4).await;
    route(&b, a.status().ipv4).await;
    let mut service = b.listen(11000).await?;
    assert!(b.listen(11000).await.is_err(), "duplicate binds must fail");
    let dst = SocketAddrV4::new(b.status().ipv4, 11000);
    let (client, server) = tokio::join!(
        a.connect(dst, Instant::now() + Duration::from_secs(10), &cancel),
        service.accept(&cancel)
    );
    let mut client = client?;
    let (mut server, _) = server?;
    let forward: Vec<_> = (0..65536).map(|n| (n % 251) as u8).collect();
    let backward: Vec<_> = (0..65536).map(|n| (n % 239) as u8).collect();
    let (x, y) = tokio::join!(
        async {
            client.write_all(&forward).await?;
            let mut buf = vec![0; backward.len()];
            client.read_exact(&mut buf).await?;
            anyhow::ensure!(Sha256::digest(&buf) == Sha256::digest(&backward));
            anyhow::Ok(())
        },
        async {
            let mut buf = vec![0; forward.len()];
            server.read_exact(&mut buf).await?;
            anyhow::ensure!(Sha256::digest(&buf) == Sha256::digest(&forward));
            server.write_all(&backward).await?;
            anyhow::Ok(())
        }
    );
    x?;
    y?;
    println!("PASS native bidirectional TCP 65536 bytes each, SHA-256 equality");
    let cancelled = CancellationToken::new();
    cancelled.cancel();
    assert!(matches!(
        service.accept(&cancelled).await,
        Err(cyberbus_transport::Error::Cancelled)
    ));
    assert!(matches!(
        a.connect(dst, Instant::now() + Duration::from_secs(1), &cancelled)
            .await,
        Err(cyberbus_transport::Error::Cancelled)
    ));
    assert!(matches!(
        a.connect(dst, Instant::now() - Duration::from_secs(1), &cancel)
            .await,
        Err(cyberbus_transport::Error::Deadline)
    ));
    assert!(
        a.connect(
            SocketAddrV4::new(Ipv4Addr::LOCALHOST, 80),
            Instant::now() + Duration::from_secs(1),
            &cancel
        )
        .await
        .is_err()
    );
    assert!(
        a.connect(
            SocketAddrV4::new(a.status().ipv4, 80),
            Instant::now() + Duration::from_secs(1),
            &cancel
        )
        .await
        .is_err()
    );
    let pending_cancel = CancellationToken::new();
    let signal = pending_cancel.clone();
    let timer = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        signal.cancel();
    });
    let unused = SocketAddrV4::new(b.status().ipv4, 19001);
    assert!(matches!(
        a.connect(
            unused,
            Instant::now() + Duration::from_secs(5),
            &pending_cancel
        )
        .await,
        Err(cyberbus_transport::Error::Cancelled)
    ));
    timer.await?;
    assert!(matches!(
        a.connect(unused, Instant::now() + Duration::from_millis(150), &cancel)
            .await,
        Err(cyberbus_transport::Error::Deadline)
    ));
    service.close();
    assert_stream_cancelled(&mut server).await;
    drop(client);
    drop(server);
    // Canary uses OS sockets. The attacker is a separate process, raw upstream factory/Data Plane,
    // and has no dependency on Transport::connect's destination validation.
    let canary = tokio::net::TcpListener::bind("0.0.0.0:0").await?;
    let canary_port = canary.local_addr()?.port();
    let os_control = tokio::net::TcpListener::bind("0.0.0.0:11000").await?;
    let baseline = tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, canary_port)).await?;
    let accepted = timeout(Duration::from_secs(1), canary.accept()).await??;
    drop(accepted);
    drop(baseline);
    let mut command = tokio::process::Command::new(std::env::current_exe()?);
    command
        .args(["--exact", "independent_attacker", "--nocapture"])
        .env("CYBERBUS_ATTACK_ENDPOINT", &endpoint)
        .env("CYBERBUS_CANARY_PORT", canary_port.to_string());
    let mut child = command.spawn()?;
    let (child_result, canary_hit, control_hit) = tokio::join!(
        child.wait(),
        timeout(Duration::from_secs(12), canary.accept()),
        timeout(Duration::from_secs(12), os_control.accept())
    );
    anyhow::ensure!(child_result?.success(), "independent raw attacker failed");
    anyhow::ensure!(
        canary_hit.is_err() && control_hit.is_err(),
        "unbound virtual port reached OS canary"
    );
    println!(
        "PASS independent process raw EasyTier probes: unbound OS canary and closed control port isolated"
    );
    // The same raw attacker joined behind B; A must observe it through B rather than direct neighbors.
    // Child exits after its probe; route may withdraw quickly, so chain coverage has a dedicated test below.
    let mut alive = b.listen(11000).await?;
    let (c, s) = tokio::join!(
        a.connect(dst, Instant::now() + Duration::from_secs(10), &cancel),
        alive.accept(&cancel)
    );
    let mut c = c?;
    let (mut s, _) = s?;
    let pending = tokio::spawn(async move {
        let mut byte = [0];
        assert_eq!(
            s.read(&mut byte).await.unwrap_err().kind(),
            std::io::ErrorKind::ConnectionAborted
        );
        assert_stream_cancelled(&mut s).await;
    });
    let outer: url::Url = endpoint.parse()?;
    b.close().await?;
    b.close().await?;
    let rebound = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, outer.port().unwrap()))?;
    drop(rebound);
    assert_eq!(b.status().phase, AddressPhase::Closed);
    timeout(Duration::from_secs(2), pending).await??;
    assert!(
        c.write_all(b"after close").await.is_err()
            || timeout(Duration::from_secs(2), c.read_u8()).await.is_ok()
    );
    assert!(alive.accept(&cancel).await.is_err());
    a.close().await?;
    assert_stream_cancelled(&mut c).await;
    println!("PASS cancellation, deadline, duplicate bind, wake blocked read and idempotent close");
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn independent_attacker() -> anyhow::Result<()> {
    let Ok(endpoint) = std::env::var("CYBERBUS_ATTACK_ENDPOINT") else {
        return Ok(());
    };
    use easytier::instance::factory::create_native_instance;
    use easytier_core::config::toml::{ConfigLoader, NetworkIdentity, PeerConfig, TomlConfig};
    let c = TomlConfig::default();
    c.set_network_identity(NetworkIdentity {
        network_name: NAME.into(),
        network_secret: Some(SECRET.into()),
        network_secret_digest: None,
    });
    c.set_ipv4(Some("10.144.0.3/20".parse()?));
    c.set_dhcp(false);
    let mut flags = c.get_flags();
    flags.no_tun = true;
    flags.use_smoltcp = true;
    flags.enable_ipv6 = false;
    flags.disable_p2p = true;
    flags.disable_upnp = true;
    flags.disable_tcp_hole_punching = true;
    flags.disable_udp_hole_punching = true;
    flags.encryption_algorithm = "aes-gcm".into();
    c.set_flags(flags);
    c.set_listeners(vec![]);
    c.set_peers(vec![PeerConfig {
        uri: endpoint.parse()?,
        peer_public_key: None,
    }]);
    c.set_stun_servers(Some(vec![]));
    c.set_stun_servers_v6(Some(vec![]));
    c.set_tcp_stun_servers(Some(vec![]));
    let raw = create_native_instance(c)?;
    raw.start().await?;
    timeout(Duration::from_secs(15), async {
        loop {
            if raw.route_snapshots().await.iter().any(|r| {
                r.ipv4_addr
                    .as_ref()
                    .and_then(|i| i.address)
                    .map(Ipv4Addr::from)
                    == Some(Ipv4Addr::new(10, 144, 0, 2))
            }) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await?;
    let port: u16 = std::env::var("CYBERBUS_CANARY_PORT")?.parse()?;
    for p in [port, 11000] {
        let result = raw
            .data_plane_tcp_connect(format!("10.144.0.2:{p}").parse()?, Duration::from_secs(2))
            .await;
        anyhow::ensure!(
            result.is_err(),
            "raw attacker connected to undeclared virtual port {p}"
        );
    }
    raw.stop().await;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn indirect_whole_network_routes() -> anyhow::Result<()> {
    let c = CancellationToken::new();
    let b = Transport::start(cfg(12, "10.144.1.2")).await?;
    ready(&b).await;
    let ep = b.running_listeners()[0].clone();
    let mut ac = cfg(11, "10.144.1.1");
    ac.peers = vec![ep.clone()];
    let a = Transport::start(ac).await?;
    let mut dc = cfg(13, "10.144.1.3");
    dc.peers = vec![ep];
    let d = Transport::start(dc).await?;
    ready(&a).await;
    ready(&d).await;
    route(&a, d.status().ipv4).await;
    let routes = a.routes().await?;
    let r = routes.iter().find(|r| r.ipv4 == d.status().ipv4).unwrap();
    assert_eq!(r.cost, 2);
    assert_eq!(r.next_hop_peer_id, b.status().peer_id);
    let mut l = d.listen(11000).await?;
    let (s, t) = tokio::join!(
        a.connect(
            SocketAddrV4::new(d.status().ipv4, 11000),
            Instant::now() + Duration::from_secs(10),
            &c
        ),
        l.accept(&c)
    );
    let mut s = s?;
    let (mut t, _) = t?;
    s.write_all(b"indirect EasyTier route").await?;
    let mut got = [0; 23];
    t.read_exact(&mut got).await?;
    assert_eq!(&got, b"indirect EasyTier route");
    a.close().await?;
    d.close().await?;
    b.close().await?;
    println!(
        "PASS three native instances: full-network candidate, cost=2, byte stream via upstream relay"
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn duplicate_address_converges() -> anyhow::Result<()> {
    let b = Transport::start(cfg(22, "10.144.4.2")).await?;
    ready(&b).await;
    let mut ac = cfg(21, "10.144.4.2");
    ac.peers = vec![b.running_listeners()[0].clone()];
    let a = Transport::start(ac).await?;
    timeout(Duration::from_secs(25), async {
        loop {
            let x = a.status();
            let y = b.status();
            anyhow::ensure!(
                x.phase != AddressPhase::Failed && y.phase != AddressPhase::Failed,
                "native address update failed"
            );
            if x.phase == AddressPhase::Ready && y.phase == AddressPhase::Ready && x.ipv4 != y.ipv4
            {
                let winner = if x.peer_id < y.peer_id { &x } else { &y };
                assert_eq!(winner.ipv4, "10.144.4.2".parse::<Ipv4Addr>()?);
                assert!(x.generation > 1 || y.generation > 1);
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        anyhow::Ok(())
    })
    .await??;
    route(&a, b.status().ipv4).await;
    route(&b, a.status().ipv4).await;
    let c = CancellationToken::new();
    let mut l = b.listen(11000).await?;
    let (s, t) = tokio::join!(
        a.connect(
            SocketAddrV4::new(b.status().ipv4, 11000),
            Instant::now() + Duration::from_secs(10),
            &c
        ),
        l.accept(&c)
    );
    let mut s = s?;
    let (mut t, _) = t?;
    s.write_all(b"after-conflict").await?;
    let mut got = [0; 14];
    timeout(Duration::from_secs(5), t.read_exact(&mut got)).await??;
    assert_eq!(&got, b"after-conflict");
    a.close().await?;
    b.close().await?;
    println!(
        "PASS duplicate route claim: minimum peer ID retains address, loser changes generation, real stream works"
    );
    Ok(())
}
