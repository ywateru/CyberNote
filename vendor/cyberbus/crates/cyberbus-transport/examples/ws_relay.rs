//! An owned, loopback-only EasyTier WebSocket bootstrap for Quick Tunnel tests.
//! Stop with stdin EOF/newline. This is not an application/HTTP byte-stream proxy.
use easytier::instance::factory::create_native_dataplane_instance;
use easytier_core::config::toml::{ConfigLoader, NetworkIdentity, TomlConfig};
use tokio::io::AsyncBufReadExt;

#[tokio::main(worker_threads = 2)]
async fn main() -> anyhow::Result<()> {
    let config = TomlConfig::default();
    config.set_network_identity(NetworkIdentity {
        network_name: "cyberbus-ws-diagnostic-relay".into(),
        network_secret: Some("public-relay-fixture".into()),
        network_secret_digest: None,
    });
    config.set_listeners(vec!["ws://127.0.0.1:0".parse()?]);
    config.set_dhcp(false);
    let mut flags = config.get_flags();
    flags.no_tun = true;
    flags.use_smoltcp = true;
    flags.enable_ipv6 = false;
    flags.disable_upnp = true;
    flags.disable_p2p = true;
    flags.disable_udp_hole_punching = true;
    flags.disable_tcp_hole_punching = true;
    flags.relay_network_whitelist = "*".into();
    flags.encryption_algorithm = "aes-gcm".into();
    flags.multi_thread = true;
    flags.multi_thread_count = 2;
    config.set_flags(flags);
    config.set_stun_servers(Some(vec![]));
    config.set_stun_servers_v6(Some(vec![]));
    config.set_tcp_stun_servers(Some(vec![]));
    let native = create_native_dataplane_instance(config)?;
    native.start().await?;
    let endpoint = native
        .running_listeners()
        .into_iter()
        .find(|u| u.scheme() == "ws");
    let Some(endpoint) = endpoint else {
        native.stop().await;
        anyhow::bail!("WebSocket listener missing");
    };
    println!("READY {endpoint}");
    let mut line = String::new();
    let result = tokio::io::BufReader::new(tokio::io::stdin())
        .read_line(&mut line)
        .await;
    native.stop().await;
    result?;
    println!("CLOSED");
    Ok(())
}
