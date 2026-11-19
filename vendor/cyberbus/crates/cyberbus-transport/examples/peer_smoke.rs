//! A desktop/Android transport-only peer. Public fixtures, no Logto or application authentication.
use cyberbus_transport::{CancellationToken, Transport, TransportConfig};
use std::{net::SocketAddrV4, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    time::{Instant, timeout},
};
#[tokio::main(worker_threads = 2)]
async fn main() -> anyhow::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    anyhow::ensure!(
        args.len() == 4,
        "usage: peer_smoke listen|connect tcp://relay:port public-run-id"
    );
    let listen = args[1] == "listen";
    anyhow::ensure!(listen || args[1] == "connect", "unknown role");
    let mut config = TransportConfig::new(
        format!("cyberbus-peer-smoke-{}", args[3]),
        "public-transport-fixture".into(),
        [if listen { 1 } else { 2 }; 32],
    );
    config.peers = vec![args[2].clone()];
    config.listeners = vec![];
    config.enable_p2p = false;
    config.preferred_ipv4 = Some(if listen { "10.144.3.1" } else { "10.144.3.2" }.parse()?);
    let transport = Transport::start(config).await?;
    let cancel = CancellationToken::new();
    let deadline = Instant::now() + Duration::from_secs(60);
    transport.wait_ready(deadline, &cancel).await?;
    let mut stream = if listen {
        let mut l = transport.listen(11000).await?;
        println!("READY {}", transport.status().ipv4);
        // Keep listener alive: accepted stream generation is invalidated only by explicit close.
        let (s, _) = timeout(Duration::from_secs(60), l.accept(&cancel)).await??;
        s
    } else {
        timeout(Duration::from_secs(45), async {
            loop {
                if transport
                    .routes()
                    .await?
                    .iter()
                    .any(|r| r.ipv4 == "10.144.3.1".parse::<std::net::Ipv4Addr>().unwrap())
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            anyhow::Ok(())
        })
        .await??;
        transport
            .connect(
                SocketAddrV4::new("10.144.3.1".parse()?, 11000),
                deadline,
                &cancel,
            )
            .await?
    };
    let bytes = vec![0x4e; 65536];
    let mut received = vec![0; 65536];
    if listen {
        timeout(Duration::from_secs(20), stream.read_exact(&mut received)).await??;
        anyhow::ensure!(received == bytes);
        stream.write_all(&bytes).await?;
        stream.flush().await?;
        // Wait for receiver confirmation before closing the network.
        anyhow::ensure!(timeout(Duration::from_secs(10), stream.read_u8()).await?? == 1);
    } else {
        stream.write_all(&bytes).await?;
        timeout(Duration::from_secs(20), stream.read_exact(&mut received)).await??;
        anyhow::ensure!(received == bytes);
        stream.write_u8(1).await?;
        stream.flush().await?;
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    transport.close().await?;
    println!(
        "PASS {} native user-space stream 65536 bytes each direction via {}",
        args[1], args[2]
    );
    Ok(())
}
