//! Notes' persistent account directory. No grant, body or attachment access.
use super::{
    config, private,
    types::{Device, DeviceSummary, Error, Result},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Default)]
pub(super) struct Catalog(Mutex<Option<(Instant, Vec<Row>)>>);
impl Catalog {
    pub fn replace(&self, rows: Vec<Row>) -> Result<()> {
        *self.0.lock().map_err(|_| Error::Storage)? = Some((Instant::now(), rows));
        Ok(())
    }
    pub fn clear(&self) {
        if let Ok(mut value) = self.0.lock() {
            *value = None;
        }
    }
    pub fn target(&self, id: &str, current: &str) -> Result<Row> {
        if !private::registry_id(id) {
            return Err(Error::DeviceIncompatible);
        }
        let guard = self.0.lock().map_err(|_| Error::Storage)?;
        let (at, rows) = guard
            .as_ref()
            .filter(|(at, _)| at.elapsed() < Duration::from_secs(60))
            .ok_or(Error::DirectoryUnavailable)?;
        let _ = at;
        let row = rows
            .iter()
            .find(|r| r.id == id)
            .ok_or(Error::DeviceOffline)?;
        row.target(current)?;
        Ok(row.clone())
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Row {
    pub id: String,
    pub name: String,
    pub online: bool,
    pub sync_available: bool,
    pub summary: Option<DeviceSummary>,
    pub transport_device_id: Option<String>,
    pub protocol_device_id: Option<String>,
    pub noise_public_key: Option<String>,
}
impl Row {
    fn valid(&self) -> bool {
        private::registry_id(&self.id)
            && private::device_name(&self.name).is_ok_and(|name| name == self.name)
            && self.summary.as_ref().is_none_or(DeviceSummary::valid)
            && self.transport_device_id.as_ref().is_none_or(|id| {
                !id.is_empty() && id.len() <= 256 && !id.chars().any(char::is_control)
            })
            && self
                .protocol_device_id
                .as_ref()
                .is_none_or(|id| private::registry_id(id))
            && self.noise_public_key.as_ref().is_none_or(|key| {
                B64.decode(key)
                    .is_ok_and(|bytes| bytes.len() == 32 && B64.encode(&bytes) == *key)
            })
            && (!self.sync_available
                || (self.online
                    && self.transport_device_id.is_some()
                    && self.protocol_device_id.is_some()
                    && self.noise_public_key.is_some()))
    }
    pub fn project(&self, current: &str) -> Device {
        Device {
            id: self.id.clone(),
            name: self.name.clone(),
            online: self.online,
            current: self.id == current,
            connected: false,
            transport: None,
            sync_available: self.online && self.sync_available,
            summary: if self.online {
                self.summary.clone()
            } else {
                None
            },
        }
    }
    pub fn target(&self, current: &str) -> Result<(&str, &str, &str)> {
        if self.id == current {
            return Err(Error::DeviceIncompatible);
        }
        if !self.online {
            return Err(Error::DeviceOffline);
        }
        if !self.sync_available {
            return Err(Error::DeviceIncompatible);
        }
        match (
            &self.transport_device_id,
            &self.protocol_device_id,
            &self.noise_public_key,
        ) {
            (Some(transport), Some(protocol), Some(key)) => Ok((transport, protocol, key)),
            _ => Err(Error::DeviceIncompatible),
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    schema_version: u8,
    devices: Vec<Row>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Updated {
    schema_version: u8,
    device: Row,
}
fn decode(bytes: &[u8]) -> Result<Vec<Row>> {
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| Error::DirectoryUnavailable)?;
    if envelope.schema_version != 1 {
        return Err(Error::DirectoryUnsupported);
    }
    let mut ids = HashSet::new();
    if envelope.devices.len() > 64
        || envelope
            .devices
            .iter()
            .any(|row| !row.valid() || !ids.insert(row.id.clone()))
    {
        return Err(Error::DirectoryUnavailable);
    }
    Ok(envelope.devices)
}
/// Intentionally no Debug/Clone: sessionKey exists only in this borrowed request.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Registration<'a> {
    pub device_id: &'a str,
    pub registry_key: &'a str,
    pub revision: u64,
    pub name: &'a str,
    pub summary: Option<&'a DeviceSummary>,
    pub sync_available: bool,
    pub transport_session_key: &'a str,
    pub protocol_device_id: Option<&'a str>,
    pub noise_public_key: Option<&'a str>,
}
pub(super) struct Api {
    http: reqwest::Client,
    origin: String,
}
fn status(status: reqwest::StatusCode) -> Result<()> {
    match status.as_u16() {
        200..=299 => Ok(()),
        404 | 405 | 501 => Err(Error::DirectoryUnsupported),
        // Old coordinators may treat the account Bearer as a transport session
        // and return INVALID_SESSION. This endpoint cannot invalidate a grant.
        401 | 403 => Err(Error::DirectoryUnavailable),
        _ => Err(Error::DirectoryUnavailable),
    }
}
impl Api {
    pub fn new() -> Result<Self> {
        Ok(Self {
            origin: config::origin()?,
            http: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(15))
                .build()
                .map_err(|_| Error::Configuration)?,
        })
    }
    pub async fn register(&self, token: &str, registration: &Registration<'_>) -> Result<()> {
        let bytes = serde_json::to_vec(registration).map_err(|_| Error::DirectoryUnavailable)?;
        if bytes.len() > 8192 {
            return Err(Error::DirectoryUnavailable);
        }
        let response = self
            .http
            .put(format!("{}/api/v1/notes/devices/self", self.origin))
            .bearer_auth(token)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(bytes)
            .send()
            .await
            .map_err(|_| Error::DirectoryUnavailable)?;
        status(response.status())?;
        let bytes = body(response, 8192).await?;
        let update: Updated =
            serde_json::from_slice(&bytes).map_err(|_| Error::DirectoryUnavailable)?;
        if update.schema_version != 1 {
            return Err(Error::DirectoryUnsupported);
        }
        if !update.device.valid() || update.device.id != registration.device_id {
            return Err(Error::DirectoryUnavailable);
        }
        Ok(())
    }
    pub async fn list(&self, token: &str) -> Result<Vec<Row>> {
        let response = self
            .http
            .get(format!("{}/api/v1/notes/devices", self.origin))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| Error::DirectoryUnavailable)?;
        status(response.status())?;
        let bytes = body(response, 256 * 1024).await?;
        decode(&bytes)
    }
}
async fn body(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>> {
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err(Error::DirectoryUnavailable);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| Error::DirectoryUnavailable)?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(Error::DirectoryUnavailable);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    async fn http_fixture(code: u16, body: String) -> (Api, tokio::task::JoinHandle<Vec<u8>>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let api = Api {
            http: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap(),
            origin: format!("http://{}", listener.local_addr().unwrap()),
        };
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            loop {
                let mut chunk = [0; 4096];
                let count = stream.read(&mut chunk).await.unwrap();
                assert!(count != 0);
                bytes.extend_from_slice(&chunk[..count]);
                assert!(bytes.len() < 16384);
                if let Some(at) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let header = std::str::from_utf8(&bytes[..at]).unwrap();
                    let length = header
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|n| n.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= at + 4 + length {
                        break;
                    }
                }
            }
            let response = format!(
                "HTTP/1.1 {code} Fixture\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).await.unwrap();
            bytes
        });
        (api, task)
    }
    #[tokio::test]
    async fn fixed_registration_request_keeps_private_proof_out_of_directory_projection() {
        let root = tempfile::tempdir().unwrap();
        let mut registry = private::registry(root.path()).unwrap();
        let registry = private::next_registration(root.path(), &mut registry).unwrap();
        let mut response_row = row();
        response_row["id"] = json!(registry.registry_device_id);
        let (api, server) = http_fixture(
            200,
            json!({"schemaVersion":1,"device":response_row}).to_string(),
        )
        .await;
        api.register(
            "synthetic-access",
            &Registration {
                device_id: &registry.registry_device_id,
                registry_key: &registry.registry_key,
                revision: registry.revision,
                name: &registry.name,
                summary: None,
                sync_available: false,
                transport_session_key: "fixture-session",
                protocol_device_id: None,
                noise_public_key: None,
            },
        )
        .await
        .unwrap();
        let bytes = server.await.unwrap();
        let at = bytes.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        let header = std::str::from_utf8(&bytes[..at])
            .unwrap()
            .to_ascii_lowercase();
        assert!(header.starts_with("put /api/v1/notes/devices/self "));
        assert!(header.contains("authorization: bearer synthetic-access"));
        let body: Value = serde_json::from_slice(&bytes[at + 4..]).unwrap();
        assert_eq!(body.as_object().unwrap().len(), 9);
        assert!(body["registryKey"].as_str() == Some(registry.registry_key.as_str()));
        assert_eq!(body["revision"], 1);
        assert_eq!(body["syncAvailable"], false);
        assert!(body["protocolDeviceId"].is_null() && body["noisePublicKey"].is_null());
        let (api, server) = http_fixture(
            200,
            json!({"schemaVersion":1,"devices":[row()]}).to_string(),
        )
        .await;
        let rows = api.list("synthetic-access").await.unwrap();
        let _ = server.await.unwrap();
        let projection = serde_json::to_string(&rows[0].project("other")).unwrap();
        for private_field in [
            "registryKey",
            "transportSessionKey",
            "transportDeviceId",
            "protocolDeviceId",
            "noisePublicKey",
        ] {
            assert!(!projection.contains(private_field));
        }
    }
    #[tokio::test]
    async fn actual_http_unsupported_and_untrusted_response_are_finite() {
        for (code, body, expected) in [
            (
                404,
                "raw upstream text /private/path".into(),
                Error::DirectoryUnsupported,
            ),
            (
                401,
                "sensitive description".into(),
                Error::DirectoryUnavailable,
            ),
            (403, "INVALID_SESSION".into(), Error::DirectoryUnavailable),
            (200, "not json".into(), Error::DirectoryUnavailable),
            (200, "x".repeat(256 * 1024 + 1), Error::DirectoryUnavailable),
        ] {
            let (api, server) = http_fixture(code, body).await;
            assert!(api.list("synthetic-access").await.err() == Some(expected));
            let _ = server.await;
        }
    }
    fn row() -> Value {
        json!({"id":uuid::Uuid::new_v4().to_string(),"name":"Mac A","online":true,"syncAvailable":false,
            "summary":{"noteCount":0,"lastNoteUpdatedAt":null,"capturedAt":100},
            "transportDeviceId":"temporary-session","protocolDeviceId":null,"noisePublicKey":null})
    }
    fn parse(row: Value) -> Result<Vec<Row>> {
        decode(&serde_json::to_vec(&json!({"schemaVersion":1,"devices":[row]})).unwrap())
    }
    #[test]
    fn offline_projection_hides_history_and_native_associations() {
        let mut value = row();
        value["online"] = json!(false);
        let parsed = parse(value).unwrap();
        let projected = serde_json::to_value(parsed[0].project("other")).unwrap();
        assert!(projected.get("summary").is_none());
        for field in ["transportDeviceId", "protocolDeviceId", "noisePublicKey"] {
            assert!(projected.get(field).is_none());
        }
        assert!(matches!(
            parsed[0].target("other"),
            Err(Error::DeviceOffline)
        ));
    }
    #[test]
    fn malformed_or_duplicate_registry_never_becomes_a_target() {
        for (key, value) in [
            ("id", json!("not-a-uuid")),
            ("name", json!("bad\nname")),
            ("syncAvailable", json!(true)),
            ("secret", json!("untrusted")),
            (
                "summary",
                json!({"noteCount":1,"lastNoteUpdatedAt":null,"capturedAt":1}),
            ),
        ] {
            let mut r = row();
            r[key] = value;
            assert!(parse(r).is_err());
        }
        let r = row();
        assert!(decode(
            &serde_json::to_vec(&json!({"schemaVersion":1,"devices":[r.clone(),r]})).unwrap()
        )
        .is_err());
        for status_code in [302, 401, 403, 404, 405, 409, 500, 501] {
            assert!(status(reqwest::StatusCode::from_u16(status_code).unwrap()).is_err());
        }
        assert_eq!(
            decode(br#"{"schemaVersion":2,"devices":[]}"#).err(),
            Some(Error::DirectoryUnsupported)
        );
    }
}
