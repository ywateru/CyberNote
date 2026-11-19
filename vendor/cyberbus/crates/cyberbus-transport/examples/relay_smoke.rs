//! Two independent embedded EasyTier instances with only a public shared relay as bootstrap.
//! cargo run --example relay_smoke -- tcp://relay.example.invalid:11010
use cyberbus_transport::{CancellationToken, Transport, TransportConfig};
use std::{net::SocketAddrV4, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    time::{Instant, timeout},
};
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let endpoint = std::env::args()
        .nth(1)
        .ok_or_else(|| anyhow::anyhow!("pass a tcp:// or udp:// shared relay endpoint"))?;
    let name = format!("cyberbus-public-relay-smoke-{}", uuid::Uuid::new_v4());
    let mut config = TransportConfig::new(name, "public-smoke-fixture".into(), [1; 32]);
    config.peers = vec![endpoint.clone()];
    config.enable_p2p = false;
    config.listeners = vec![];
    config.preferred_ipv4 = Some("10.144.2.1".parse()?);
    let a = Transport::start(config.clone()).await?;
    config.installation_id = [2; 32];
    config.preferred_ipv4 = Some("10.144.2.2".parse()?);
    let b = Transport::start(config).await?;
    let cancel = CancellationToken::new();
    let deadline = Instant::now() + Duration::from_secs(40);
    a.wait_ready(deadline, &cancel).await?;
    b.wait_ready(deadline, &cancel).await?;
    timeout(Duration::from_secs(30), async {
        loop {
            if a.routes().await?.iter().any(|r| r.ipv4 == b.status().ipv4) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        anyhow::Ok(())
    })
    .await??;
    let mut l = b.listen(11000).await?;
    let (x, y) = tokio::join!(
        a.connect(SocketAddrV4::new(b.status().ipv4, 11000), deadline, &cancel),
        l.accept(&cancel)
    );
    let mut x = x?;
    let (mut y, _) = y?;
    let sent = vec![0x6d; 65536];
    let mut got = vec![0; 65536];
    let (w, r) = tokio::join!(x.write_all(&sent), y.read_exact(&mut got));
    w?;
    r?;
    anyhow::ensure!(got == sent);
    let (w, r) = tokio::join!(y.write_all(&sent), x.read_exact(&mut got));
    w?;
    r?;
    anyhow::ensure!(got == sent);
    a.close().await?;
    b.close().await?;
    println!(
        "PASS public upstream relay {endpoint}: two native no-TUN instances, P2P disabled, 65536 bytes each direction"
    );
    Ok(())
}
