//! Offline SDK lifecycle smoke used by the integration guide.
//! It performs no OIDC request and needs no relay or credential.
use cyberbus::{pb, Client, ClientConfig, StoreMode};
use cyberbus_auth::MemoryStore;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ClientConfig::from_json(
        r#"{
          "issuer":"https://auth.example.com/oidc",
          "client_id":"example-native-client",
          "resource":"https://api.example.com/cyberbus",
          "product_id":"example-product",
          "redirect_uri":"http://127.0.0.1:18765/callback"
        }"#,
    )
    .map_err(|error| std::io::Error::other(error.message))?;
    let client = Client::new(
        config,
        Box::new(MemoryStore::default()),
        StoreMode::CreateNew,
    )
    .await
    .map_err(|error| std::io::Error::other(error.message))?;
    let mut events = client
        .take_event_receiver()
        .await
        .ok_or("event receiver already taken")?;

    // A fresh runtime publishes its local offline snapshot asynchronously.
    let _ = tokio::time::timeout(Duration::from_secs(1), events.recv()).await;

    let result = client
        .execute(pb::SdkCommand {
            command_id: vec![1; 16],
            body: Some(pb::sdk_command::Body::SdkClose(pb::SdkClose {})),
        })
        .await;
    match result.body {
        Some(pb::sdk_result::Body::SdkClosed(closed)) if closed.closed => {}
        other => return Err(format!("unexpected close result: {other:?}").into()),
    }
    while events.recv().await.is_some() {}
    println!("sdk_lifecycle: PASS");
    Ok(())
}
