use super::fixture::Fixture;
use crate::{
    cloud_sync::{
        crypto,
        engine::*,
        model::*,
        persistence::PrivateFiles,
        protocol::Remote,
        runtime::{CloudCommand, CloudRuntime, Lease},
        store_port,
    },
    store::Store,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::json;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
struct Host {
    store: Mutex<Store>,
    context: Context,
    valid: AtomicBool,
    captures: AtomicUsize,
}
fn err<T>(_: T) -> CloudError {
    error("invalid")
}
fn scope<T>(
    s: &mut Store,
    incoming: &[crate::sync::model::WireVersion],
    f: impl FnOnce(&mut Store) -> Result<T>,
) -> Result<T> {
    let media = s
        .sync_media_snapshot(incoming, false)
        .map_err(err)?
        .receipt_only()
        .verify()
        .map_err(err)?;
    s.sync_begin_media(media).map_err(err)?;
    let r = f(s);
    s.sync_end_media();
    r
}
fn generation(s: &mut Store) -> Result<String> {
    scope(s, &[], |s| {
        s.sync_plan_apply(&[]).map(|p| p.generation).map_err(err)
    })
}
impl Host {
    fn new(path: &std::path::Path, workspace: &str) -> Arc<Self> {
        let mut s = Store::open(path).unwrap();
        s.sync_enable(Some(workspace)).unwrap();
        let context = Context {
            window: "fixture-main".into(),
            session: uuid::Uuid::new_v4().to_string(),
            token: json!({"epoch":1}),
            store_instance: s.sync_store_instance().to_string(),
        };
        Arc::new(Self {
            store: Mutex::new(s),
            context,
            valid: AtomicBool::new(true),
            captures: AtomicUsize::new(0),
        })
    }
    fn note(&self, title: &str, media: bool) -> String {
        let mut s = self.store.lock().unwrap();
        let id = s.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let mut content =
            vec![json!({"type":"paragraph","content":[{"type":"text","text":title}]})];
        if media {
            let a = s
                .store_attachment(&id, "fixture.png", "image/png", vec![1, 2, 3, 4])
                .unwrap();
            content.push(json!({"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"fixture.png"}}));
        }
        let revision = s.note(&id).unwrap().revision;
        s.action(json!({"type":"saveNote","id":id,"revision":revision,"document":{"type":"doc","content":content}})).unwrap();
        id
    }
    fn rename(&self, id: &str, title: &str) {
        let mut s = self.store.lock().unwrap();
        let n = s.note(id).unwrap();
        let mut doc = n.document;
        doc["content"][0] = json!({"type":"paragraph","content":[{"type":"text","text":title}]});
        s.action(json!({"type":"saveNote","id":id,"revision":n.revision,"document":doc}))
            .unwrap();
    }
    fn snapshot(&self) -> Bundle {
        let mut s = self.store.lock().unwrap();
        scope(&mut s, &[], |s| {
            let local = s.sync_identity().map_err(err)?.unwrap().workspace_id;
            let (w, versions, refs) = store_port::rows(s, &local)?;
            let storage = s.sync_blob_storage().map_err(err)?;
            let mut blobs = BTreeMap::new();
            for b in refs {
                let reader = storage.open_reader(&b.hash, b.size).map_err(err)?;
                let mut bytes = vec![];
                let mut offset = 0;
                while offset < b.size {
                    let chunk = reader.read(offset, 65536).map_err(err)?;
                    offset += chunk.len() as u64;
                    bytes.extend(chunk);
                }
                blobs.insert(b.hash, bytes);
            }
            Ok(store_port::assemble(
                w,
                versions,
                vec![],
                blobs,
                s.sync_plan_apply(&[]).map_err(err)?.generation,
            )?
            .bundle)
        })
        .unwrap()
    }
}
fn binding(
    host: &Host,
    c: &Context,
    f: &crate::cloud_sync::runtime::CloudFence,
    bundle: Option<&Bundle>,
) -> Result<()> {
    let identity = host.store.lock().unwrap().sync_identity().map_err(err)?;
    if &f.context != c
        || identity.as_ref().map(|i| &i.workspace_id) != f.store_workspace_id.as_ref()
        || identity.as_ref().map(|i| &i.device_id) != f.store_device_id.as_ref()
    {
        return Err(error("stale"));
    }
    if let Some(b) = bundle {
        if f.incoming_payload_hash.as_deref() != Some(&b.digest()) {
            return Err(error("stale"));
        }
    }
    Ok(())
}
impl CloudHost for Host {
    fn check(&self, c: &Context) -> Result<()> {
        if !self.valid.load(Ordering::SeqCst) || c != &self.context {
            return Err(error("permission"));
        }
        if self.store.lock().unwrap().sync_store_instance().to_string() != c.store_instance {
            return Err(error("stale"));
        }
        Ok(())
    }
    fn inspect(&self, c: &Context) -> Result<LocalInfo> {
        self.check(c)?;
        let mut s = self.store.lock().unwrap();
        let generation = generation(&mut s)?;
        let rows = s.sync_inventory().map_err(err)?;
        Ok(LocalInfo {
            store_workspace_id: s.sync_identity().map_err(err)?.map(|i| i.workspace_id),
            store_device_id: s.sync_identity().map_err(err)?.map(|i| i.device_id),
            generation,
            notes: rows
                .iter()
                .filter(|v| v.kind == crate::sync::model::EntityKind::Note)
                .count(),
        })
    }
    fn capture(&self, c: &Context, w: &str, _initialize: bool, lease: Lease) -> Result<Capture> {
        self.check(c)?;
        let guard = lease.enter()?;
        binding(self, c, guard.binding()?, None)?;
        self.captures.fetch_add(1, Ordering::SeqCst);
        guard.check_workspace(w)?;
        let mut b = self.snapshot();
        b.versions = b
            .versions
            .iter()
            .map(|v| store_port::rebind(v, w))
            .collect::<Result<Vec<_>>>()?;
        b.workspace_id = w.into();
        let g = generation(&mut self.store.lock().unwrap())?;
        Ok(Capture {
            bundle: b,
            generation: g,
        })
    }
    fn validate(&self, c: &Context, b: &Bundle, lease: Lease) -> Result<()> {
        self.check(c)?;
        lease.check_workspace(&b.workspace_id)?;
        binding(self, c, lease.binding()?, Some(b))?;
        let mut s = self.store.lock().unwrap();
        let local = store_port::local_versions(&s, b)?;
        scope(&mut s, &local, |s| store_port::validate(s, b))
    }
    fn commit(&self, c: &Context, b: Bundle, expected: &str, lease: Lease) -> Result<CommitReport> {
        self.check(c)?;
        lease.check_workspace(&b.workspace_id)?;
        let guard = lease.enter()?;
        binding(self, c, guard.binding()?, Some(&b))?;
        let mut s = self.store.lock().unwrap();
        let local = store_port::local_versions(&s, &b)?;
        if generation(&mut s)? != expected {
            return Err(error("stale"));
        }
        scope(&mut s, &local, |s| store_port::validate(s, &b))?;
        for (h, data) in &b.blobs {
            let bytes = B64.decode(data).map_err(err)?;
            s.sync_store_blob(h, bytes.len() as u64, &bytes[..])
                .map_err(err)?;
        }
        scope(&mut s, &local, |s| store_port::receive(s, &b))?;
        let media = s
            .sync_media_snapshot(&[], false)
            .map_err(err)?
            .verify()
            .map_err(err)?;
        s.sync_begin_media(media).map_err(err)?;
        let r = s.sync_apply_pending().map_err(err);
        s.sync_end_media();
        let r = r?;
        Ok(CommitReport {
            applied: r.applied,
            pending: r.pending,
            conflicts: r.conflicts,
        })
    }
}
async fn configured(
    path: &std::path::Path,
    host: Arc<Host>,
    f: &Fixture,
    password: &str,
) -> Arc<CloudRuntime> {
    let r = CloudRuntime::fixture(&path.canonicalize().unwrap(), host.clone(), &f.url).unwrap();
    let p = f.config(Provider::Webdav);
    r.command(
        host.context.clone(),
        CloudCommand::Save {
            patch: ConfigPatch {
                expected_revision: 0,
                enabled: Some(true),
                selected: Some(Provider::Webdav),
                provider: Some(Provider::Webdav),
                fields: Some(p.fields),
                secrets: Some(p.secrets),
                passphrase: Some(password.into()),
                ..Default::default()
            },
        },
    )
    .await
    .unwrap();
    r
}
async fn sync(r: &CloudRuntime, h: &Host) -> Result<crate::cloud_sync::runtime::Reply> {
    let p = r
        .command(h.context.clone(), CloudCommand::Preview { recovery: None })
        .await?
        .preview
        .unwrap();
    r.command(h.context.clone(), CloudCommand::Sync { preview_id: p.id })
        .await
}
#[tokio::test]
async fn setup_preview_reads_remote_without_enabling_or_authorizing_transfer() {
    let directory = tempfile::tempdir().unwrap();
    let workspace = uuid::Uuid::new_v4().to_string();
    let remote = Fixture::new(Provider::Webdav);
    let sender_path = directory.path().join("sender");
    let sender = Host::new(&sender_path, &workspace);
    sender.note("Remote preview note", false);
    let runtime = configured(&sender_path, sender.clone(), &remote, "fixture-password").await;
    sync(&runtime, &sender).await.unwrap();

    let receiver_path = directory.path().join("receiver");
    let receiver = Host::new(&receiver_path, &workspace);
    let runtime = CloudRuntime::fixture(
        &receiver_path.canonicalize().unwrap(),
        receiver.clone(),
        &remote.url,
    )
    .unwrap();
    let config = remote.config(Provider::Webdav);
    let reply = runtime
        .command(
            receiver.context.clone(),
            CloudCommand::PreviewSetup {
                patch: ConfigPatch {
                    provider: Some(Provider::Webdav),
                    fields: Some(config.fields),
                    secrets: Some(config.secrets),
                    passphrase: Some("fixture-password".into()),
                    ..Default::default()
                },
            },
        )
        .await
        .unwrap();
    assert!(!reply.status.enabled);
    assert_eq!(reply.status.revision, 0);
    assert!(reply.status.providers.is_empty());
    assert!(!reply.status.passphrase_set);
    let preview = reply.preview.unwrap();
    assert_eq!(preview.source, "setup");
    assert!(preview.remote_exists);
    assert!(preview.versions > 0);
    assert_eq!(preview.local_notes, 0);
    assert!(runtime
        .command(
            receiver.context.clone(),
            CloudCommand::Sync {
                preview_id: preview.id,
            },
        )
        .await
        .is_err());
    assert_eq!(receiver.captures.load(Ordering::SeqCst), 0);
    assert!(receiver.snapshot().versions.is_empty());
}
#[tokio::test]
async fn real_store_bidirectional_media_conflicts_stable_ids_and_recovery() {
    let d = tempfile::tempdir().unwrap();
    let w = uuid::Uuid::new_v4().to_string();
    let a = Host::new(&d.path().join("a"), &w);
    let b = Host::new(&d.path().join("b"), &w);
    let id = a.note("本地合成笔记", true);
    let f = Fixture::new(Provider::Webdav);
    let ar = configured(&d.path().join("a"), a.clone(), &f, "fixture-password").await;
    let br = configured(&d.path().join("b"), b.clone(), &f, "fixture-password").await;
    assert_eq!(ar.status().unwrap().minutes, 0);
    sync(&ar, &a).await.unwrap();
    sync(&br, &b).await.unwrap();
    assert_eq!(a.snapshot().digest(), b.snapshot().digest());
    assert_eq!(
        b.store.lock().unwrap().note(&id).unwrap().title,
        "本地合成笔记"
    );
    assert_eq!(
        b.snapshot().blobs.values().next().unwrap(),
        &B64.encode([1, 2, 3, 4])
    );
    a.rename(&id, "离线分支 A");
    b.rename(&id, "离线分支 B");
    sync(&ar, &a).await.unwrap();
    sync(&br, &b).await.unwrap();
    sync(&ar, &a).await.unwrap();
    let heads = a.snapshot();
    assert_eq!(heads.digest(), b.snapshot().digest());
    assert_eq!(a.store.lock().unwrap().sync_conflicts().unwrap().len(), 1);
    for _ in 0..100 {
        assert_eq!(
            merge(&heads, &b.snapshot()).unwrap().digest(),
            heads.digest()
        );
    }
    assert_eq!(
        heads.versions.iter().filter(|v| v.entity_id == id).count(),
        2
    );
    let recovery = br.status().unwrap().recoveries.first().unwrap().clone();
    let p = br
        .command(
            b.context.clone(),
            CloudCommand::Preview {
                recovery: Some(recovery),
            },
        )
        .await
        .unwrap()
        .preview
        .unwrap();
    let result = br
        .command(
            b.context.clone(),
            CloudCommand::Restore { preview_id: p.id },
        )
        .await
        .unwrap();
    assert!(result.result.unwrap().applied);
    assert!(b.store.lock().unwrap().note(&id).is_ok());
    let encrypted = f.state.lock().unwrap().object.clone().unwrap();
    assert!(!String::from_utf8_lossy(&encrypted).contains("离线分支"));
    assert_ne!(
        crypto::decrypt(&encrypted, "fixture-password")
            .unwrap()
            .workspace_id,
        w
    );
}
#[tokio::test]
async fn password_revocation_stale_preview_and_cas_zero_apply() {
    let d = tempfile::tempdir().unwrap();
    let w = uuid::Uuid::new_v4().to_string();
    let a = Host::new(&d.path().join("a"), &w);
    let id = a.note("保留", false);
    let f = Fixture::new(Provider::Webdav);
    let ar = configured(&d.path().join("a"), a.clone(), &f, "fixture-password").await;
    sync(&ar, &a).await.unwrap();
    let b = Host::new(&d.path().join("b"), &w);
    let br = configured(&d.path().join("b"), b.clone(), &f, "incorrect-password").await;
    let before = b.snapshot().digest();
    assert_eq!(sync(&br, &b).await.err().unwrap().code, "password");
    assert_eq!(b.captures.load(Ordering::SeqCst), 0);
    assert_eq!(b.snapshot().digest(), before);
    let p = ar
        .command(a.context.clone(), CloudCommand::Preview { recovery: None })
        .await
        .unwrap()
        .preview
        .unwrap();
    a.rename(&id, "预览后修改");
    assert_eq!(
        ar.command(a.context.clone(), CloudCommand::Sync { preview_id: p.id })
            .await
            .err()
            .unwrap()
            .code,
        "stale"
    );
    let p = ar
        .command(a.context.clone(), CloudCommand::Preview { recovery: None })
        .await
        .unwrap()
        .preview
        .unwrap();
    f.state.lock().unwrap().conflict = true;
    assert_eq!(
        ar.command(a.context.clone(), CloudCommand::Sync { preview_id: p.id })
            .await
            .err()
            .unwrap()
            .code,
        "conflict"
    );
    assert_eq!(
        a.store.lock().unwrap().note(&id).unwrap().title,
        "预览后修改"
    );
    let requests = f.state.lock().unwrap().requests.len();
    a.valid.store(false, Ordering::SeqCst);
    assert_eq!(
        ar.command(a.context.clone(), CloudCommand::Test)
            .await
            .err()
            .unwrap()
            .code,
        "permission"
    );
    assert_eq!(f.state.lock().unwrap().requests.len(), requests);
}
#[test]
fn private_state_preserves_partial_choices_and_rejects_corruption_links_and_intervening_edits() {
    use std::os::unix::fs::PermissionsExt;
    let d = tempfile::tempdir().unwrap();
    let path = d.path().canonicalize().unwrap();
    let files = PrivateFiles::open(&path).unwrap();
    let c = Config::default()
        .patch(ConfigPatch {
            expected_revision: 0,
            minutes: Some(0),
            enabled: Some(false),
            ..Default::default()
        })
        .unwrap();
    assert!(!c.enabled);
    assert_eq!(c.minutes, 0);
    let raw = serde_json::to_vec(&c).unwrap();
    files.replace("state.json", &raw, None).unwrap();
    assert_eq!(
        std::fs::metadata(path.join(".cloud-sync/state.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    assert_eq!(
        files
            .replace("state.json", b"new", None)
            .err()
            .unwrap()
            .code,
        "stale"
    );
    std::fs::write(path.join(".cloud-sync/state.json"), b"corrupt").unwrap();
    assert_eq!(
        files
            .replace("state.json", b"new", Some(&raw))
            .err()
            .unwrap()
            .code,
        "stale"
    );
    assert_eq!(
        std::fs::read(path.join(".cloud-sync/state.json")).unwrap(),
        b"corrupt"
    );
    let outside = path.join("outside");
    std::fs::write(&outside, b"untouched").unwrap();
    std::os::unix::fs::symlink(&outside, path.join(".cloud-sync/link.enc")).unwrap();
    assert_eq!(files.read("link.enc", 100).err().unwrap().code, "state");
    assert_eq!(std::fs::read(outside).unwrap(), b"untouched");
}
#[test]
fn causal_restore_and_settings_merge_keep_all_branches_and_reject_equivocation() {
    let d = tempfile::tempdir().unwrap();
    let w = uuid::Uuid::new_v4().to_string();
    let a = Host::new(d.path(), &w);
    let id = a.note("旧正文", false);
    let old = a.snapshot();
    a.rename(&id, "新正文");
    let current = a.snapshot();
    let restored = crate::cloud_sync::engine::restore(&current, &old).unwrap();
    assert_eq!(restored.versions.len(), 1);
    assert_eq!(restored.versions[0].entity_id, id);
    assert_eq!(
        restored.versions[0].payload.as_ref().unwrap()["note"]["title"],
        "旧正文"
    );
    let mut left = Bundle::empty(w.clone());
    left.settings.push(
        SettingVersion {
            key: "groupDates".into(),
            value: json!(false),
            vector: BTreeMap::from([(uuid::Uuid::new_v4().to_string(), 1)]),
            digest: String::new(),
        }
        .seal(),
    );
    let mut right = Bundle::empty(w);
    let mut value = left.settings[0].clone();
    value.value = json!(true);
    value.vector = BTreeMap::from([(uuid::Uuid::new_v4().to_string(), 1)]);
    right.settings.push(value.seal());
    assert_eq!(merge(&left, &right).unwrap().settings.len(), 2);
    right.settings[0].vector = left.settings[0].vector.clone();
    right.settings[0] = right.settings[0].clone().seal();
    assert_eq!(merge(&left, &right).err().unwrap().code, "invalid");
}

#[test]
fn multiple_remote_heads_merge_without_dropping_branches() {
    let workspace = uuid::Uuid::new_v4().to_string();
    let mut left = Bundle::empty(workspace.clone());
    left.settings.push(
        SettingVersion {
            key: "theme".into(),
            value: json!("dark"),
            vector: BTreeMap::from([(uuid::Uuid::new_v4().to_string(), 1)]),
            digest: String::new(),
        }
        .seal(),
    );
    let mut right = Bundle::empty(workspace.clone());
    right.settings.push(
        SettingVersion {
            key: "view".into(),
            value: json!("gallery"),
            vector: BTreeMap::from([(uuid::Uuid::new_v4().to_string(), 1)]),
            digest: String::new(),
        }
        .seal(),
    );
    let merged = merge_bundles(vec![left, right]).unwrap();
    assert_eq!(merged.settings.len(), 2);
    assert_eq!(merged.workspace_id, workspace);

    let other = Bundle::empty(uuid::Uuid::new_v4().to_string());
    assert_eq!(
        merge_bundles(vec![merged, other]).err().unwrap().code,
        "workspace"
    );
}

#[tokio::test]
async fn account_owned_store_identity_is_never_adopted_or_replaced() {
    let d = tempfile::tempdir().unwrap();
    let w = uuid::Uuid::new_v4().to_string();
    let h = Host::new(&d.path().join("account-store"), &w);
    let identity = h.store.lock().unwrap().sync_identity().unwrap().unwrap();
    h.note("账户库笔记", false);
    let root = d.path().join("account-store");
    std::fs::create_dir_all(root.join(".account")).unwrap();
    std::fs::write(
        root.join(".account/binding.json"),
        b"synthetic-account-binding-no-credentials",
    )
    .unwrap();
    let f = Fixture::new(Provider::Webdav);
    let r = configured(&root, h.clone(), &f, "fixture-password").await;
    let other = Bundle::empty(uuid::Uuid::new_v4().to_string());
    f.state.lock().unwrap().object = Some(crypto::encrypt(&other, "fixture-password").unwrap());
    let before = h.snapshot().digest();
    sync(&r, &h).await.unwrap();
    assert_eq!(h.snapshot().digest(), before);
    assert_eq!(
        h.store.lock().unwrap().sync_identity().unwrap().unwrap(),
        identity
    );
    assert_eq!(
        std::fs::read(root.join(".account/binding.json")).unwrap(),
        b"synthetic-account-binding-no-credentials"
    );
    let foreign_workspace = uuid::Uuid::new_v4().to_string();
    let second = Host::new(&d.path().join("other-account"), &foreign_workspace);
    let second_identity = second
        .store
        .lock()
        .unwrap()
        .sync_identity()
        .unwrap()
        .unwrap();
    second.note("另一账户本机笔记", false);
    let sr = configured(
        &d.path().join("other-account"),
        second.clone(),
        &f,
        "fixture-password",
    )
    .await;
    sync(&sr, &second).await.unwrap();
    sync(&r, &h).await.unwrap();
    let cloud = crypto::decrypt(
        f.state.lock().unwrap().object.as_ref().unwrap(),
        "fixture-password",
    )
    .unwrap();
    let normalize = |mut b: Bundle| {
        b.versions = b
            .versions
            .iter()
            .map(|v| store_port::rebind(v, &cloud.workspace_id).unwrap())
            .collect();
        b.workspace_id = cloud.workspace_id.clone();
        b.digest()
    };
    assert_eq!(normalize(h.snapshot()), normalize(second.snapshot()));
    let shared = cloud
        .versions
        .iter()
        .find(|v| v.kind == crate::sync::model::EntityKind::Note)
        .unwrap()
        .entity_id
        .clone();
    h.rename(&shared, "账户 A 离线修改");
    second.rename(&shared, "账户 B 离线修改");
    sync(&r, &h).await.unwrap();
    sync(&sr, &second).await.unwrap();
    sync(&r, &h).await.unwrap();
    assert_eq!(normalize(h.snapshot()), normalize(second.snapshot()));
    assert_eq!(h.store.lock().unwrap().sync_conflicts().unwrap().len(), 1);
    {
        let mut s = h.store.lock().unwrap();
        let conflict = s.sync_conflicts().unwrap().remove(0);
        let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
        s.sync_begin_media(media).unwrap();
        let result = s.sync_resolve(conflict.kind, &shared, &conflict.versions[0].digest, false);
        s.sync_end_media();
        result.unwrap();
    }
    sync(&r, &h).await.unwrap();
    sync(&sr, &second).await.unwrap();
    assert!(second
        .store
        .lock()
        .unwrap()
        .sync_conflicts()
        .unwrap()
        .is_empty());
    assert_eq!(
        h.store.lock().unwrap().note(&shared).unwrap().title,
        second.store.lock().unwrap().note(&shared).unwrap().title
    );
    let old = h.snapshot();
    h.store
        .lock()
        .unwrap()
        .action(json!({"type":"deleteNote","id":shared}))
        .unwrap();
    h.store
        .lock()
        .unwrap()
        .action(json!({"type":"purgeNote","id":shared}))
        .unwrap();
    sync(&r, &h).await.unwrap();
    sync(&sr, &second).await.unwrap();
    assert!(second.store.lock().unwrap().note(&shared).is_err());
    let current = h.snapshot();
    assert_eq!(merge(&current, &old).unwrap().digest(), current.digest());
    for _ in 0..8 {
        sync(&sr, &second).await.unwrap();
        sync(&r, &h).await.unwrap();
    }
    assert_eq!(normalize(h.snapshot()), normalize(second.snapshot()));
    assert_eq!(
        h.store.lock().unwrap().sync_identity().unwrap().unwrap(),
        identity
    );
    assert_eq!(
        second
            .store
            .lock()
            .unwrap()
            .sync_identity()
            .unwrap()
            .unwrap(),
        second_identity
    );
    // A previously accepted cloud UUID cannot silently change underneath the same saved configuration.
    f.state.lock().unwrap().object = Some(
        crypto::encrypt(
            &Bundle::empty(uuid::Uuid::new_v4().to_string()),
            "fixture-password",
        )
        .unwrap(),
    );
    let captures = h.captures.load(Ordering::SeqCst);
    assert_eq!(sync(&r, &h).await.err().unwrap().code, "workspace");
    assert_eq!(h.captures.load(Ordering::SeqCst), captures);
}
#[test]
fn settings_sql_transaction_preserves_unrelated_fields_false_conflicts_and_rollback() {
    use crate::cloud_sync::settings_port as p;
    use rusqlite::Connection;
    let mut a = Connection::open_in_memory().unwrap();
    let mut b = Connection::open_in_memory().unwrap();
    for db in [&a, &b] {
        db.execute_batch("CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); INSERT INTO settings VALUES(1,'{\"groupDates\":false,\"selectedNote\":\"local-choice\",\"privateSetting\":\"not-exported\"}')").unwrap();
    }
    let actor = uuid::Uuid::new_v4().to_string();
    let tx = a.transaction().unwrap();
    p::install(&tx).unwrap();
    let left = p::capture(&tx, &actor).unwrap();
    let initial = p::generation(&tx).unwrap();
    assert_eq!(left[0].value, json!(false));
    tx.commit().unwrap();
    let tx = b.transaction().unwrap();
    p::install(&tx).unwrap();
    p::capture(&tx, &uuid::Uuid::new_v4().to_string()).unwrap();
    assert_eq!(p::apply(&tx, &left).unwrap(), 1);
    let body: String = tx
        .query_row("SELECT body FROM settings", [], |r| r.get(0))
        .unwrap();
    let body: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(body["selectedNote"], "local-choice");
    assert_eq!(body["privateSetting"], "not-exported");
    assert_eq!(p::heads(&tx).unwrap().len(), 2);
    tx.commit().unwrap();
    a.execute(
        "UPDATE settings SET body=json_set(body,'$.groupDates',json('true'))",
        [],
    )
    .unwrap();
    let tx = a.transaction().unwrap();
    let changed = p::capture(&tx, &actor).unwrap();
    assert_eq!(changed.len(), 1);
    assert_eq!(changed[0].value, json!(true));
    assert_ne!(p::generation(&tx).unwrap(), initial);
    tx.rollback().unwrap();
    assert_eq!(p::heads(&a).unwrap()[0].value, json!(false));
    assert!(p::install(&a).is_err());
}
#[tokio::test]
async fn disabling_cancels_inflight_network_and_preserves_credentials() {
    let d = tempfile::tempdir().unwrap();
    let h = Host::new(d.path(), &uuid::Uuid::new_v4().to_string());
    let f = Fixture::new(Provider::Webdav);
    let r = configured(d.path(), h.clone(), &f, "fixture-password").await;
    assert!(r.automatic(h.context.clone()).await.unwrap().is_none());
    assert_eq!(f.state.lock().unwrap().requests.len(), 0);
    f.state.lock().unwrap().delay_ms = 150;
    let other = r.clone();
    let ctx = h.context.clone();
    let pending = tokio::spawn(async move { other.command(ctx, CloudCommand::Test).await });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    let status = r.status().unwrap();
    r.command(
        h.context.clone(),
        CloudCommand::Save {
            patch: ConfigPatch {
                expected_revision: status.revision,
                enabled: Some(false),
                minutes: Some(0),
                ..Default::default()
            },
        },
    )
    .await
    .unwrap();
    assert_eq!(pending.await.unwrap().err().unwrap().code, "permission");
    assert!(!r.status().unwrap().enabled);
    assert!(r.status().unwrap().passphrase_set);
    assert!(r.status().unwrap().providers[&Provider::Webdav].credentials_set["password"]);
    assert_eq!(h.captures.load(Ordering::SeqCst), 0);
}
#[test]
fn changed_encrypted_header_and_ciphertext_are_rejected() {
    let b = Bundle::empty(uuid::Uuid::new_v4().to_string());
    let sealed = crypto::encrypt(&b, "fixture-password").unwrap();
    let mut v: serde_json::Value = serde_json::from_slice(&sealed).unwrap();
    v["workspace_id"] = json!(uuid::Uuid::new_v4().to_string());
    assert_eq!(
        crypto::decrypt(&serde_json::to_vec(&v).unwrap(), "fixture-password")
            .err()
            .unwrap()
            .code,
        "password"
    );
    let mut v: serde_json::Value = serde_json::from_slice(&sealed).unwrap();
    let text = v["ciphertext"].as_str().unwrap().to_string();
    let mut bytes = B64.decode(text).unwrap();
    bytes[0] ^= 1;
    v["ciphertext"] = json!(B64.encode(bytes));
    assert_eq!(
        crypto::decrypt(&serde_json::to_vec(&v).unwrap(), "fixture-password")
            .err()
            .unwrap()
            .code,
        "password"
    );
    v["app"] = json!("another-app");
    assert_eq!(
        crypto::decrypt(&serde_json::to_vec(&v).unwrap(), "fixture-password")
            .err()
            .unwrap()
            .code,
        "invalid"
    );
}
#[tokio::test]
async fn public_status_never_returns_secrets_and_restart_preserves_explicit_off() {
    let d = tempfile::tempdir().unwrap();
    let h = Host::new(d.path(), &uuid::Uuid::new_v4().to_string());
    let f = Fixture::new(Provider::Webdav);
    let r = configured(d.path(), h.clone(), &f, "fixture-password").await;
    let status = r.status().unwrap();
    let serialized = serde_json::to_string(&status).unwrap();
    assert!(!serialized.contains("fixture-password"));
    assert!(!serialized.contains("fixture-webdav-password"));
    r.command(
        h.context.clone(),
        CloudCommand::Save {
            patch: ConfigPatch {
                expected_revision: status.revision,
                enabled: Some(false),
                minutes: Some(0),
                ..Default::default()
            },
        },
    )
    .await
    .unwrap();
    let root = d.path().canonicalize().unwrap();
    drop(r);
    let reopened = CloudRuntime::new(&root, h).unwrap();
    assert!(!reopened.status().unwrap().enabled);
    assert_eq!(reopened.status().unwrap().minutes, 0);
    assert!(reopened.status().unwrap().passphrase_set);
}
