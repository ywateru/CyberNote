// The runner inserts the exact committed Runtime::logout method into this
// minimal host. Real SDK, in-memory installation, no grant/network/Keychain.
use notes_cyberbus::{pb, Bus};
use pb::sdk_command::Body as C;
type Result<T> = std::result::Result<T, Error>;
#[derive(Debug)]
enum Error { CleanupRequired, UnknownOutcome, CoordinationProtocol, Sdk }
impl From<notes_cyberbus::Error> for Error {
    fn from(_: notes_cyberbus::Error) -> Self { Self::Sdk }
}
struct Probe { owner: Bus }
impl Probe {
    async fn bus(&self) -> Result<Bus> { Ok(self.owner.clone()) }
    // EXACT_LOGOUT_METHOD
}
#[tokio::main]
async fn main() {
    let bytes = std::sync::Arc::new(std::sync::Mutex::new(None::<Vec<u8>>));
    let load = bytes.clone();
    let store = notes_cyberbus::CallbackStore::new(
        move || Ok(load.lock().unwrap().as_ref().map(|b| notes_cyberbus::SecretBytes::new(b.clone()))),
        move |b: &[u8]| { *bytes.lock().unwrap()=Some(b.to_vec()); Ok(()) },
    );
    let config = notes_cyberbus::ClientConfig::from_json(r#"{"issuer":"https://review.invalid/oidc","client_id":"review-native","resource":"https://review.invalid/api","product_id":"review","native_clients":{"review-native":"review"},"redirect_uri":"http://127.0.0.1:17897/callback","persist_grant":false,"bootstrap_peers":[]}"#).unwrap();
    let owner = Bus::new(config,Box::new(store),notes_cyberbus::StoreMode::CreateNew).await.unwrap();
    let probe = Probe {owner};
    let raw = probe.owner.cmd(C::AuthLogout(pb::AuthLogout {
        cloud_policy:Some(pb::CloudLogoutPolicy::RevokeGrant as i32), cloud_budget:None,
    })).await.unwrap();
    let Some(pb::sdk_result::Body::AuthLogout(raw))=raw.body else {panic!("wrong result type")};
    let first_ok = probe.logout().await.is_ok();
    let retry_ok = probe.logout().await.is_ok();
    println!("{{\"scope\":\"actual committed logout method in minimal host; real offline SDK; no existing grant\",\"local_closed\":{},\"local_error_present\":{},\"cloud_status\":{},\"cloud_error_code\":{},\"account_logout_ok\":{},\"retry_ok\":{}}}",
        raw.local_closed,raw.local_error.is_some(),raw.cloud_status,raw.cloud_error.map_or(0,|e| e.code),first_ok,retry_ok);
    probe.owner.close().await.unwrap();
    assert!(raw.local_closed);
    assert!(!first_ok && !retry_ok, "baseline observation changed: re-evaluate finding");
}
