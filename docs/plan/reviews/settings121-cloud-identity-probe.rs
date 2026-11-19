// Review-only Store/model probes. The translation below is a candidate adapter,
// not shipped Cloud code. Production modules are imported without modification.
#![allow(dead_code, unused_imports)]
#[path = "__ROOT__/src-tauri/src/agent_access/mod.rs"] mod agent_access;
#[path = "__ROOT__/src-tauri/src/application/mod.rs"] mod application;
#[path = "__ROOT__/src-tauri/src/session.rs"] mod session;
#[path = "__ROOT__/src-tauri/src/store.rs"] mod store;
mod sync {
    #[path = "__ROOT__/src-tauri/src/sync/model.rs"] pub(crate) mod model;
}
use serde_json::json;
use store::Store;
use sync::model::{EntityKind, WireVersion};

const A: &str = "00000000-0000-4000-8000-000000000001";
const B: &str = "00000000-0000-4000-8000-000000000002";
const CLOUD: &str = "00000000-0000-4000-8000-000000000003";
const ACTOR_A: &str = "00000000-0000-4000-8000-000000000011";
const ACTOR_B: &str = "00000000-0000-4000-8000-000000000022";

fn edit(s: &mut Store, id: &str, text: &str) {
    let revision = s.note(id).unwrap().revision;
    s.action(json!({"type":"saveNote","id":id,"revision":revision,
        "document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}})).unwrap();
}
fn create(s: &mut Store, text: &str) -> String {
    let id = s.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_owned();
    edit(s, &id, text);
    id
}
fn rows(s: &mut Store) -> Vec<WireVersion> {
    s.sync_flush().unwrap();
    s.sync_inventory().unwrap().into_iter().map(|v| s.sync_version(&v.digest).unwrap()).collect()
}
fn translated(v: &WireVersion, workspace: &str) -> WireVersion {
    v.validate_envelope().unwrap(); // Verify the original digest before re-sealing.
    let mut result = v.clone();
    result.workspace_id = workspace.into();
    result.seal()
}
fn cloud_transfer(source: &mut Store, target: &mut Store) {
    let workspace = target.sync_identity().unwrap().unwrap().workspace_id;
    let incoming = rows(source).iter().map(|v| translated(&translated(v, CLOUD), &workspace)).collect();
    target.sync_receive(incoming).unwrap();
    target.sync_apply_pending().unwrap(); // Headless probe ONLY; no UI barrier claim.
}
fn check_translation_and_roundtrip() {
    let ar = tempfile::tempdir().unwrap(); let br = tempfile::tempdir().unwrap();
    let mut a = Store::open(ar.path()).unwrap(); let mut b = Store::open(br.path()).unwrap();
    let na = create(&mut a, "A 独有正文"); let nb = create(&mut b, "B 独有正文");
    let ia = a.sync_enable_with_device(Some(A), ACTOR_A).unwrap();
    let ib = b.sync_enable_with_device(Some(B), ACTOR_B).unwrap();
    let original = rows(&mut a).remove(0);
    assert_eq!(b.sync_receive(vec![original.clone()]).unwrap_err().code, "sync_workspace_mismatch");
    let cloud = translated(&original, CLOUD);
    let mut invalid = cloud.clone(); invalid.workspace_id = B.into();
    assert!(invalid.validate_envelope().is_err());
    assert_eq!(translated(&translated(&cloud, B), CLOUD), cloud);
    let received = b.sync_receive(vec![translated(&cloud, B)]).unwrap();
    assert!(!received.applied); assert!(b.note(&na).is_err());
    b.sync_apply_pending().unwrap();
    for _ in 0..8 { cloud_transfer(&mut a, &mut b); cloud_transfer(&mut b, &mut a); }
    assert_eq!(a.notes().unwrap().len(), 2); assert_eq!(b.notes().unwrap().len(), 2);
    assert_eq!(a.note(&nb).unwrap().plain_text, "B 独有正文");
    assert_eq!(b.note(&na).unwrap().plain_text, "A 独有正文");
    let stale = rows(&mut a).into_iter().find(|v| v.entity_id == na).unwrap();
    a.action(json!({"type":"deleteNote","id":na})).unwrap();
    a.action(json!({"type":"purgeNote","id":na})).unwrap();
    cloud_transfer(&mut a, &mut b);
    b.sync_receive(vec![translated(&translated(&stale, CLOUD), B)]).unwrap();
    b.sync_apply_pending().unwrap(); assert!(b.note(&na).is_err());
    assert_eq!(a.sync_identity().unwrap().unwrap(), ia);
    assert_eq!(b.sync_identity().unwrap().unwrap(), ib);
    drop(a); drop(b);
    assert_eq!(Store::open(ar.path()).unwrap().sync_identity().unwrap().unwrap(), ia);
    assert_eq!(Store::open(br.path()).unwrap().sync_identity().unwrap().unwrap(), ib);
    println!("PASS translation: foreign reject, original digest validation, reversible re-seal, 8 roundtrips, purge replay, restart identity");
}
fn check_projection_order_and_equivocation() {
    let ar = tempfile::tempdir().unwrap(); let br = tempfile::tempdir().unwrap();
    let mut a = Store::open(ar.path()).unwrap(); let mut b = Store::open(br.path()).unwrap();
    let id = create(&mut a, "seed");
    a.sync_enable_with_device(Some(A), ACTOR_A).unwrap();
    b.sync_enable_with_device(Some(B), ACTOR_B).unwrap();
    let first = rows(&mut a).remove(0);
    let mut pair = None;
    for index in 0..1024 {
        let mut second = first.clone();
        second.vector = [(ACTOR_B.to_owned(), 1)].into_iter().collect();
        let note = &mut second.payload.as_mut().unwrap()["note"];
        note["title"] = json!(format!("branch-{index}"));
        second = second.seal();
        if (translated(&first, A).digest < translated(&second, A).digest)
            != (translated(&first, B).digest < translated(&second, B).digest) {
            pair = Some([first.clone(), second]); break;
        }
    }
    let pair = pair.expect("find bounded digest-order counterexample");
    for (s, workspace) in [(&mut a, A), (&mut b, B)] {
        s.sync_receive(pair.iter().map(|v| translated(&translated(v, CLOUD), workspace)).collect()).unwrap();
        s.sync_apply_pending().unwrap();
        assert_eq!(s.sync_conflicts().unwrap()[0].versions.len(), 2);
    }
    assert_ne!(a.note(&id).unwrap().title, b.note(&id).unwrap().title);
    let mut altered = translated(&first, B);
    altered.payload.as_mut().unwrap()["note"]["title"] = json!("same-vector changed-content");
    assert_eq!(b.sync_receive(vec![altered.seal()]).unwrap_err().code, "sync_equivocation");
    println!("PASS counterexample: same logical heads survive but re-sealed digest ordering selects different visible branches; same-vector/different-content rejected");
}
fn check_generation_and_media_scopes() {
    let ar = tempfile::tempdir().unwrap(); let br = tempfile::tempdir().unwrap();
    let mut a = Store::open(ar.path()).unwrap(); let mut b = Store::open(br.path()).unwrap();
    let id = create(&mut a, "media");
    let bytes = b"synthetic original image bytes121";
    let attachment = a.store_attachment(&id, "fixture.png", "image/png", bytes.to_vec()).unwrap();
    let revision = a.note(&id).unwrap().revision;
    a.action(json!({"type":"saveNote","id":id,"revision":revision,"document":{"type":"doc","content":[{"type":"paragraph"},{"type":"attachment","attrs":{"id":attachment.id,"kind":"image","name":"fixture.png"}}]}})).unwrap();
    a.sync_enable_with_device(Some(A), ACTOR_A).unwrap();
    b.sync_enable_with_device(Some(B), ACTOR_B).unwrap();
    let wire = rows(&mut a).remove(0);
    let local = translated(&translated(&wire, CLOUD), B);
    for blob in a.sync_required_blobs(&wire).unwrap() {
        b.sync_store_blob(&blob.hash, blob.size, std::fs::File::open(a.sync_blob_path(&blob.hash).unwrap()).unwrap()).unwrap();
    }
    let obsolete = b.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    let app_generation = b.application_generation().unwrap();
    let receipt = b.sync_media_snapshot(&[local.clone()], false).unwrap().receipt_only().verify().unwrap();
    b.sync_with_media(receipt, |s| s.sync_receive(vec![local])).unwrap();
    assert_eq!(b.application_generation().unwrap(), app_generation);
    assert_eq!(b.sync_begin_media(obsolete).unwrap_err().code, "sync_plan_stale");
    let receipt = b.sync_media_snapshot(&[], false).unwrap().receipt_only().verify().unwrap();
    assert_eq!(b.sync_with_media(receipt, |s| s.sync_apply_pending()).unwrap_err().code, "sync_plan_stale");
    assert!(b.note(&id).is_err());
    let apply = b.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    b.sync_with_media(apply, |s| s.sync_apply_pending()).unwrap();
    assert_eq!(b.read_attachment(&attachment.id).unwrap()["data"], base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes));
    let obsolete_plan = b.sync_plan_apply(&[]).unwrap();
    edit(&mut b, &id, "new local text");
    assert_eq!(b.sync_apply_plan(&obsolete_plan).unwrap_err().code, "sync_plan_stale");
    let media = b.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    std::fs::write(br.path().join(".sync/blobs").join(format!("{}.blob", wire.payload.as_ref().unwrap()["attachments"][0]["sha256"].as_str().unwrap())), vec![b'x'; bytes.len()]).unwrap();
    assert_eq!(b.sync_begin_media(media).unwrap_err().code, "sync_plan_stale");
    println!("PASS generation/media: inbox-only receive evades application_generation but invalidates media generation; receipt-only cannot apply attachments; full scope preserves bytes; dirty plan and replaced file stale");
}
fn main() {
    check_translation_and_roundtrip();
    check_projection_order_and_equivocation();
    check_generation_and_media_scopes();
}
