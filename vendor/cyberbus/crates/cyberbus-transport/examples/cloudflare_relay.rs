//! Official anonymous relay host; EOF/newline requests deterministic shutdown.
use cyberbus_transport::{CloudflareRelay, CloudflareRelayConfig, ConnectorProtocol};
use tokio::io::AsyncBufReadExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut config = CloudflareRelayConfig::default();
    if let Some(path) = std::env::args_os().nth(1) {
        config.executable = path.into();
    }
    config.protocol = match std::env::args().nth(2).as_deref().unwrap_or("http2") {
        "http2" => ConnectorProtocol::Http2,
        "quic" => ConnectorProtocol::Quic,
        _ => anyhow::bail!("protocol must be http2 or quic"),
    };
    let relay = CloudflareRelay::start(config).await?;
    println!("READY {}", relay.endpoint());
    let mut state = relay.subscribe_state();
    let mut line = String::new();
    let mut input = tokio::io::BufReader::new(tokio::io::stdin());
    tokio::select! {
        r=input.read_line(&mut line)=>{ r?; },
        _=state.changed()=>{},
    }
    let failed = *state.borrow() == cyberbus_transport::CloudflareRelayState::Failed;
    relay.close().await?;
    println!("CLOSED");
    anyhow::ensure!(!failed, "official connector exited");
    Ok(())
}
