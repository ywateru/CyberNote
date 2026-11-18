//! Public fixtures only: isolate EasyTier TCP from the real protocol Noise handshake.
//! No account credentials, SDK directory, business Data, or OS TUN are involved.
use cyberbus_protocol::{noise, pb};
use cyberbus_transport::{BoxStream, CancellationToken, Transport, TransportConfig};
use serde_json::json;
use std::{
    error::Error,
    future::Future,
    net::{Ipv4Addr, SocketAddrV4},
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf},
    time::{timeout, Instant},
};
type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

fn record(stage: &str, began: Instant, extra: serde_json::Value) {
    println!(
        "{}",
        json!({"stage":stage,"elapsed_ms":began.elapsed().as_millis(),"detail":extra})
    );
}

async fn bounded<T>(
    stage: &str,
    budget: Duration,
    work: impl Future<Output = Result<T>>,
) -> Result<T> {
    let began = Instant::now();
    match timeout(budget, work).await {
        Ok(Ok(value)) => {
            record(stage, began, json!({"result":"PASS"}));
            Ok(value)
        }
        Ok(Err(e)) => {
            record(stage, began, json!({"result":"FAIL","error":e.to_string()}));
            Err(e)
        }
        Err(_) => {
            record(stage, began, json!({"result":"FAIL","error":"deadline"}));
            Err(format!("{stage}: deadline").into())
        }
    }
}

// Log successful IO sizes/times only. These indicate wire progress, never peer
// receipt or individual protocol stages (reads may split/coalesce records).
struct Trace {
    io: BoxStream,
    began: Instant,
}
impl AsyncRead for Trace {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let result = Pin::new(&mut self.io).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &result {
            record(
                "read",
                self.began,
                json!({"bytes":buf.filled().len()-before}),
            );
        }
        result
    }
}
impl AsyncWrite for Trace {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let result = Pin::new(&mut self.io).poll_write(cx, buf);
        if let Poll::Ready(Ok(n)) = &result {
            record("write", self.began, json!({"bytes":n}));
        }
        result
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.io).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.io).poll_shutdown(cx)
    }
}

async fn raw(mut io: BoxStream, listen: bool) -> Result<()> {
    // Five sequential small request/reply exchanges expose latency hidden by a
    // bulk throughput test. Every reply and 64KiB body is compared exactly.
    for sequence in 0..5u8 {
        bounded("small_rtt", Duration::from_secs(10), async {
            let sent = [sequence; 32];
            let mut got = [0; 32];
            if listen {
                io.read_exact(&mut got).await?;
                if got != sent {
                    return Err("small request mismatch".into());
                }
                io.write_all(&sent).await?;
            } else {
                io.write_all(&sent).await?;
                io.read_exact(&mut got).await?;
                if got != sent {
                    return Err("small reply mismatch".into());
                }
            }
            io.flush().await?;
            Ok(())
        })
        .await?;
    }
    bounded("bulk_65536_each_way", Duration::from_secs(20), async {
        let sent = vec![0x6d; 65536];
        let mut got = vec![0; sent.len()];
        if listen {
            io.read_exact(&mut got).await?;
            if got != sent {
                return Err("bulk request mismatch".into());
            }
            io.write_all(&sent).await?;
            io.flush().await?;
            if io.read_u8().await? != 1 {
                return Err("missing receiver confirmation".into());
            }
            io.write_u8(2).await?;
        } else {
            io.write_all(&sent).await?;
            io.read_exact(&mut got).await?;
            if got != sent {
                return Err("bulk reply mismatch".into());
            }
            io.write_u8(1).await?;
            io.flush().await?;
            if io.read_u8().await? != 2 {
                return Err("missing final confirmation".into());
            }
        }
        io.flush().await?;
        Ok(())
    })
    .await
}

async fn encrypted(io: BoxStream, listen: bool, budget: Duration) -> Result<()> {
    let config = noise::NoiseConfig::new(
        [if listen { 41 } else { 42 }; 32],
        [9; 32],
        [8; 32],
        "1",
        [7; 16],
    );
    let traced = Trace {
        io,
        began: Instant::now(),
    };
    let mut secure = bounded("noise_hello_xx_bind_ready", budget, async {
        Ok(if listen {
            noise::accept(traced, config, |_| Ok(())).await?
        } else {
            noise::connect(traced, config, |_| Ok(())).await?
        })
    })
    .await?;
    bounded("encrypted_ping_pong", Duration::from_secs(10), async {
        use pb::wire_envelope::Body;
        let nonce = vec![3; 16];
        if listen {
            if secure.recv().await?.body
                != Some(Body::Ping(pb::Ping {
                    nonce: nonce.clone(),
                }))
            {
                return Err("encrypted ping mismatch".into());
            }
            secure
                .send(Body::Pong(pb::Pong {
                    nonce: nonce.clone(),
                }))
                .await?;
            if secure.recv().await?.body != Some(Body::Ping(pb::Ping { nonce })) {
                return Err("missing encrypted receiver confirmation".into());
            }
        } else {
            secure
                .send(Body::Ping(pb::Ping {
                    nonce: nonce.clone(),
                }))
                .await?;
            if secure.recv().await?.body
                != Some(Body::Pong(pb::Pong {
                    nonce: nonce.clone(),
                }))
            {
                return Err("encrypted pong mismatch".into());
            }
            secure.send(Body::Ping(pb::Ping { nonce })).await?;
        }
        Ok(())
    })
    .await
}

async fn probe(
    t: &Transport,
    listen: bool,
    remote: Ipv4Addr,
    mode: &str,
    budget: Duration,
    rounds: u32,
) -> Result<()> {
    let cancel = CancellationToken::new();
    bounded("address_ready", Duration::from_secs(20), async {
        t.wait_ready(Instant::now() + Duration::from_secs(20), &cancel)
            .await?;
        Ok(())
    })
    .await?;
    // Bind before announcing readiness. Retain listener throughout accepted IO.
    let mut listener = t.listen(11000).await?;
    record(
        "listening",
        Instant::now(),
        json!({"ipv4":t.status().ipv4.to_string()}),
    );
    bounded("remote_route", Duration::from_secs(45), async {
        loop {
            let routes = t.routes().await?;
            let matches: Vec<_> = routes.iter().filter(|r| r.ipv4 == remote).collect();
            if matches.len() == 1 {
                record(
                    "route",
                    Instant::now(),
                    json!({"cost":matches[0].cost,"next_hop_peer_id":matches[0].next_hop_peer_id}),
                );
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await?;
    for round in 0..rounds {
        record(
            "round",
            Instant::now(),
            json!({"index":round,"mode":mode,"listen":listen,"handshake_budget_ms":budget.as_millis()}),
        );
        let io = bounded(
            if listen { "accept" } else { "connect" },
            Duration::from_secs(15),
            async {
                Ok(if listen {
                    listener.accept(&cancel).await?.0
                } else {
                    t.connect(
                        SocketAddrV4::new(remote, 11000),
                        Instant::now() + Duration::from_secs(15),
                        &cancel,
                    )
                    .await?
                })
            },
        )
        .await?;
        if mode == "raw" {
            raw(io, listen).await?;
        } else {
            encrypted(io, listen, budget).await?;
        }
    }
    // Allow the final small confirmation/FIN to drain before stopping EasyTier.
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(())
}

#[tokio::main(worker_threads = 2)]
async fn main() -> Result<()> {
    // Public-fixture executable only: capture connector/TLS failures which the
    // SDK intentionally does not export as credential-bearing error strings.
    let _ = tracing_subscriber::fmt()
        .with_env_filter("easytier=warn,easytier_core=warn")
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .try_init();
    let args: Vec<_> = std::env::args().collect();
    if !(6..=8).contains(&args.len()) {
        return Err("usage: easytier_probe listen|connect tcp://relay:port public-run-id raw|noise handshake-ms [rounds=1] [relay|p2p]".into());
    }
    let listen = match args[1].as_str() {
        "listen" => true,
        "connect" => false,
        _ => return Err("unknown role".into()),
    };
    if !matches!(args[4].as_str(), "raw" | "noise") {
        return Err("unknown mode".into());
    }
    let millis: u64 = args[5].parse()?;
    let rounds: u32 = args.get(6).map(|s| s.parse()).transpose()?.unwrap_or(1);
    if !(1..=10000).contains(&millis) || !(1..=20).contains(&rounds) {
        return Err("budget 1..10000ms, rounds 1..20 required".into());
    }
    let p2p = match args.get(7).map(String::as_str).unwrap_or("relay") {
        "relay" | "fallback" => false,
        "p2p" => true,
        _ => return Err("unknown topology".into()),
    };
    let mut config = TransportConfig::new(
        format!("cyberbus-diagnosis-{}", args[3]),
        "public-diagnostic-fixture".into(),
        [if listen { 1 } else { 2 }; 32],
    );
    if args.get(7).map(String::as_str) == Some("fallback") {
        config.cloudflare_fallback = Some(cyberbus_transport::CloudflareFallback {
            peers: vec![args[2].clone()],
            after: Duration::from_secs(2),
        });
    } else {
        config.peers = vec![args[2].clone()];
    }
    config.enable_p2p = p2p;
    if !p2p {
        config.listeners.clear();
    }
    config.preferred_ipv4 = Some(if listen { "10.144.3.1" } else { "10.144.3.2" }.parse()?);
    let t = bounded("start", Duration::from_secs(20), async {
        Ok(Transport::start(config).await?)
    })
    .await?;
    let remote = if listen { "10.144.3.2" } else { "10.144.3.1" }.parse()?;
    let result = probe(
        &t,
        listen,
        remote,
        &args[4],
        Duration::from_millis(millis),
        rounds,
    )
    .await;
    let close = bounded("close", Duration::from_secs(10), async {
        Ok(t.close().await?)
    })
    .await;
    result?;
    close?;
    record(
        "complete",
        Instant::now(),
        json!({"result":"PASS","mode":args[4],"rounds":rounds,"p2p_enabled":p2p}),
    );
    Ok(())
}
