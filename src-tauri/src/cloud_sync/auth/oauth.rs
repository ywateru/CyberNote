//! Connection-bound token refresh. One in-flight refresh per runtime; a late
//! response can never overwrite a newer credential generation.
use super::{
    openlist::{AccountInfo, OpenList, Renewed},
    vault::{Credential, Vault},
    ISSUER,
};
use crate::cloud_sync::model::*;
use std::{path::Path, sync::Arc, time::{SystemTime, UNIX_EPOCH}};

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub struct OAuth {
    vault: Vault,
    openlist: OpenList,
    refresh: tokio::sync::Mutex<()>,
}

impl OAuth {
    pub fn new(root: &Path) -> Result<Self> {
        Ok(Self {
            vault: Vault::open(root)?,
            openlist: OpenList::new()?,
            refresh: tokio::sync::Mutex::new(()),
        })
    }
    #[cfg(test)]
    pub fn fixture(root: &Path, issuer: &str, graph: &str, baidu: &str) -> Result<Self> {
        Ok(Self {
            vault: Vault::open(root)?,
            openlist: OpenList::fixture(issuer, graph, baidu)?,
            refresh: tokio::sync::Mutex::new(()),
        })
    }
    pub async fn requests(&self, driver: &str) -> Result<super::openlist::RequestStart> {
        self.openlist.requests(driver).await
    }
    pub fn parse_callback(&self, raw: &str, driver: &str) -> Result<super::openlist::TokenPayload> {
        self.openlist.parse_callback(raw, driver)
    }
    pub async fn account(&self, provider: Provider, token: &str) -> Result<AccountInfo> {
        self.openlist.account(provider, token).await
    }
    pub async fn renew(
        &self,
        provider: Provider,
        driver: &str,
        refresh_token: &str,
    ) -> Result<Renewed> {
        self.openlist.renew(provider, driver, refresh_token).await
    }
    pub fn save(&self, credential: Credential) -> Result<()> {
        self.vault.put(credential)
    }
    pub fn remove(&self, id: &str) -> Result<()> {
        self.vault.remove(id)
    }
    pub fn get(&self, id: &str) -> Result<Credential> {
        self.vault.get(id)
    }
    pub async fn access_token(&self, id: &str) -> Result<String> {
        let c = self.vault.get(id)?;
        if let Some(token) = c
            .access_token
            .as_ref()
            .filter(|t| !t.is_empty())
            .filter(|_| c.expires_at.is_none_or(|e| e > now() + 60))
        {
            return Ok(token.clone());
        }
        let _guard = self.refresh.lock().await;
        // Re-read after waiting: another request may have refreshed already.
        let c = self.vault.get(id)?;
        if let Some(token) = c
            .access_token
            .as_ref()
            .filter(|t| !t.is_empty())
            .filter(|_| c.expires_at.is_none_or(|e| e > now() + 60))
        {
            return Ok(token.clone());
        }
        let renewed = self
            .openlist
            .renew(c.provider, &c.driver, &c.refresh_token)
            .await?;
        let updated = self.vault.update_tokens(
            id,
            Some(renewed.access_token.clone()),
            renewed.refresh_token,
            renewed.expires_at,
        )?;
        if updated.connection_id != c.connection_id || updated.driver != c.driver {
            return Err(error("state"));
        }
        Ok(renewed.access_token)
    }
    pub async fn verified_account(&self, id: &str) -> Result<(Credential, AccountInfo)> {
        let c = self.vault.get(id)?;
        let token = self.access_token(id).await?;
        match self.openlist.account(c.provider, &token).await {
            Ok(a) => Ok((self.vault.get(id)?, a)),
            Err(e) if e.code == "authentication" => {
                // A provider can reject a locally-unexpired token. Force one
                // refresh before treating the connection as reauthorization.
                let _guard = self.refresh.lock().await;
                let c = self.vault.get(id)?;
                // Another request may have refreshed while this one waited.
                // Reuse that token before rotating the refresh token again.
                if let Some(current) = c
                    .access_token
                    .as_deref()
                    .filter(|t| !t.is_empty() && *t != token.as_str())
                {
                    if let Ok(a) = self.openlist.account(c.provider, current).await {
                        return Ok((c, a));
                    }
                }
                let renewed = self
                    .openlist
                    .renew(c.provider, &c.driver, &c.refresh_token)
                    .await?;
                let updated = self.vault.update_tokens(
                    id,
                    Some(renewed.access_token.clone()),
                    renewed.refresh_token,
                    renewed.expires_at,
                )?;
                if updated.connection_id != c.connection_id || updated.driver != c.driver {
                    return Err(error("state"));
                }
                self.openlist
                    .account(c.provider, &renewed.access_token)
                    .await
                    .map(|a| (updated, a))
            }
            Err(e) => Err(e),
        }
    }
    pub fn issuer(&self) -> &'static str {
        ISSUER
    }
}

pub type SharedOAuth = Arc<OAuth>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn read_request(stream: &mut std::net::TcpStream) -> String {
        let mut data = vec![];
        let mut buf = [0; 4096];
        loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            data.extend_from_slice(&buf[..n]);
            if data.windows(4).any(|w| w == b"\r\n\r\n") {
                break;
            }
        }
        String::from_utf8(data).unwrap()
    }

    fn respond(stream: &mut std::net::TcpStream, status: &str, body: &str) {
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).unwrap();
        stream.write_all(body.as_bytes()).unwrap();
    }

    #[test]
    fn rejected_cached_token_refreshes_once_before_reauth() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let worker = thread::spawn(move || {
            let expected = [
                ("GET /me ", "401 Unauthorized", "{}"),
                (
                    "GET /onedrive/renewapi?",
                    "200 OK",
                    r#"{"access_token":"fresh","refresh_token":"fresh-refresh","expires_in":3600}"#,
                ),
                (
                    "GET /me ",
                    "200 OK",
                    r#"{"id":"account-1","displayName":"Test"}"#,
                ),
                (
                    "GET /me/drive ",
                    "200 OK",
                    r#"{"driveType":"personal","quota":{"total":100,"used":10}}"#,
                ),
            ];
            for (prefix, status, body) in expected {
                let (mut stream, _) = listener.accept().unwrap();
                let request = read_request(&mut stream);
                assert!(
                    request.starts_with(prefix),
                    "unexpected request: {}",
                    request.lines().next().unwrap_or("")
                );
                respond(&mut stream, status, body);
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let oauth = OAuth::fixture(&root, &base, &base, &base).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        oauth
            .save(Credential {
                version: 1,
                connection_id: id.clone(),
                provider: Provider::Onedrive,
                issuer: ISSUER.into(),
                driver: "onedrive_pr".into(),
                refresh_token: "old-refresh".into(),
                access_token: Some("stale".into()),
                expires_at: None,
                scope: "offline_access Files.ReadWrite.All".into(),
                account_id: "account-1".into(),
                display_name: "Test".into(),
            })
            .unwrap();

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let (credential, account) = oauth.verified_account(&id).await.unwrap();
            assert_eq!(account.account_id, "account-1");
            assert_eq!(account.drive_type.as_deref(), Some("personal"));
            assert_eq!(credential.access_token.as_deref(), Some("fresh"));
            assert_eq!(credential.refresh_token, "fresh-refresh");
            assert!(credential.expires_at.is_some());
        });
        worker.join().unwrap();
    }
}
