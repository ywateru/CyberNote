#![allow(dead_code)]
use std::collections::{HashMap,HashSet};

#[derive(Clone)]
pub struct Identity {
    session_id: String,
    operation_id: String,
    owner: String,
    child: String,
}

struct Entry {
    identity: Identity,
    owner_alive: bool,
    started: bool,
    terminal: bool,
    revision: Option<(u64, bool)>,
    checkpoint_revision: u64,
    child_destroyed: bool,
    docked: bool,
}

struct Quit {
    sealing: HashSet<String>,
    id: String,
    participants: HashSet<String>,
    waiting: HashSet<String>,
}

#[derive(Default)]
struct Registry {
    entries: HashMap<String, Entry>,
    local: HashMap<String, LocalEntry>,
    completed_local: HashMap<String, (LocalIdentity, bool, u64)>,
    incarnations: HashMap<String, String>,
    used_local_sessions: HashSet<String>,
    used_local_operations: HashSet<String>,
    quit: Option<Quit>,
    exit_allowed: bool,
}

#[derive(Clone)]
pub struct LocalIdentity {
    session_id: String,
    operation_id: String,
    owner: String,
    incarnation: String,
}

struct LocalEntry {
    identity: LocalIdentity,
    owner_alive: bool,
    started: bool,
    acknowledged: u64,
    final_ack: bool,
}

fn canonical_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.hyphenated().to_string() == value)
}

fn document_window(label: &str) -> bool {
    label == "main" || label.starts_with("note-")
}

fn register_local(
    registry: &mut Registry,
    session: String,
    operation: String,
    caller: &str,
) -> Result<LocalIdentity, String> {
    if !document_window(caller) || !canonical_uuid(&session) || !canonical_uuid(&operation) {
        return Err("本地录音身份无效".into());
    }
    // A lost registration response must be recoverable only by this original
    // live incarnation, with the same session/operation and before capture.
    // This exact recovery is allowed during Quit so empty cleanup can finish.
    if !registry.exit_allowed {
        if let Some(entry) = registry.local.get(&session) {
            if entry.owner_alive
                && entry.identity.owner == caller
                && entry.identity.operation_id == operation
                && registry.incarnations.get(caller) == Some(&entry.identity.incarnation)
                && !entry.started
                && entry.acknowledged == 0
                && !entry.final_ack
            {
                return Ok(entry.identity.clone());
            }
            return Err("原录音登记身份已失效或采集已开始".into());
        }
    }
    if registry.quit.is_some() || registry.exit_allowed {
        return Err("应用正在退出，请稍候".into());
    }
    if registry.used_local_sessions.contains(&session)
        || registry.used_local_operations.contains(&operation)
        || registry
            .local
            .values()
            .any(|entry| entry.identity.owner == caller)
        || registry
            .entries
            .values()
            .any(|entry| entry.identity.owner == caller)
    {
        return Err("原窗口已有未完成录音或操作身份已使用".into());
    }
    let incarnation = registry
        .incarnations
        .entry(caller.into())
        .or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    let identity = LocalIdentity {
        session_id: session.clone(),
        operation_id: operation.clone(),
        owner: caller.into(),
        incarnation,
    };
    registry.used_local_sessions.insert(session.clone());
    registry.used_local_operations.insert(operation);
    registry.local.insert(
        session,
        LocalEntry {
            identity: identity.clone(),
            owner_alive: true,
            started: false,
            acknowledged: 0,
            final_ack: false,
        },
    );
    Ok(identity)
}

fn local_entry<'a>(
    registry: &'a mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
) -> Result<&'a mut LocalEntry, String> {
    let entry = registry
        .local
        .get_mut(session)
        .ok_or("本地录音会话已失效，音频仍保留")?;
    if !entry.owner_alive
        || entry.identity.owner != caller
        || entry.identity.operation_id != operation
        || entry.identity.incarnation != incarnation
        || registry.incarnations.get(caller).map(String::as_str) != Some(incarnation)
    {
        return Err("原录音窗口或操作身份已失效".into());
    }
    Ok(entry)
}

fn acknowledge_local(
    registry: &mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
    revision: u64,
    final_intent: bool,
) -> Result<(), String> {
    let entry = local_entry(registry, session, operation, incarnation, caller)?;
    if !entry.started || revision == 0 {
        return Err("录音尚未开始".into());
    }
    if entry.acknowledged == revision && entry.final_ack == final_intent {
        return Ok(());
    }
    if entry.final_ack || revision != entry.acknowledged + 1 {
        return Err("录音确认版本顺序无效".into());
    }
    entry.acknowledged = revision;
    entry.final_ack = final_intent;
    Ok(())
}

fn release_local(
    registry: &mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
    saved: bool,
    revision: u64,
) -> Result<(), String> {
    if !registry.local.contains_key(session) {
        if let Some((identity, completed_saved, completed_revision)) =
            registry.completed_local.get(session)
        {
            if identity.owner == caller
                && identity.operation_id == operation
                && identity.incarnation == incarnation
                && registry.incarnations.get(caller).map(String::as_str) == Some(incarnation)
                && *completed_saved == saved
                && *completed_revision == revision
                && !registry
                    .local
                    .values()
                    .any(|entry| entry.identity.owner == caller)
            {
                return Ok(()); // Exact cleanup receipt after a lost IPC response.
            }
        }
        return Err("本地录音清理身份已失效".into());
    }
    let entry = local_entry(registry, session, operation, incarnation, caller)?;
    if if saved {
        !entry.final_ack || revision != entry.acknowledged
    } else {
        revision != 0 || entry.acknowledged != 0 || entry.final_ack
    } {
        return Err("录音最终保存尚未确认，不能清理会话".into());
    }
    let completed = registry.local.remove(session).unwrap();
    registry
        .completed_local
        .insert(session.into(), (completed.identity, saved, revision));
    // Removing audio ownership does not acknowledge any document Quit barrier.
    Ok(())
}

fn seal_quit_participant(
    registry: &mut Registry,
    id: &str,
    caller: &str,
) -> Result<Option<HashSet<String>>, String> {
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.sealing.remove(caller) {
        return Err("退出封存身份已失效".into());
    }
    Ok(quit.sealing.is_empty().then(|| quit.participants.clone()))
}

fn acknowledge_quit_participant(
    registry: &mut Registry,
    id: &str,
    caller: &str,
) -> Result<(), String> {
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.sealing.is_empty() || !quit.waiting.remove(caller) {
        return Err("退出确认身份已失效或正文尚未全部封存".into());
    }
    Ok(())
}

fn expire_quit(registry: &mut Registry, id: &str) -> bool {
    if registry.quit.as_ref().is_some_and(|quit| quit.id == id) {
        registry.quit = None;
        true
    } else {
        false
    }
}

fn cancel_destroyed_participant(registry: &mut Registry, label: &str) {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.participants.contains(label))
    {
        registry.quit = None;
    }
}

fn may_exit(registry: &mut Registry) -> bool {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.waiting.is_empty() && quit.sealing.is_empty())
        && registry.entries.is_empty()
        && registry.local.is_empty()
    {
        registry.quit = None;
        registry.exit_allowed = true;
        true
    } else {
        false
    }
}

fn cancel_changed_participants(
    registry: &mut Registry,
    current: &HashSet<String>,
) -> Option<String> {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| &quit.participants != current)
    {
        registry.quit.take().map(|quit| quit.id)
    } else {
        None
    }
}


#[cfg(test)] mod independent {
use super::*;
fn ids()->(String,String){(uuid::Uuid::new_v4().to_string(),uuid::Uuid::new_v4().to_string())}
fn register(r:&mut Registry,owner:&str)->LocalIdentity{let(s,o)=ids();register_local(r,s,o,owner).unwrap()}
fn quitting(r:&mut Registry,id:&str){let p=HashSet::from(["main".into(),"note-b".into()]);r.quit=Some(Quit{id:id.into(),participants:p.clone(),sealing:p.clone(),waiting:p})}
#[test] fn exact_registration_reply_loss_retrieves_same_identity(){
 let mut r=Registry::default();let a=register(&mut r,"main");
 // The command has committed; simulate loss only of its returned Identity.
 let again=register_local(&mut r,a.session_id.clone(),a.operation_id.clone(),"main").expect("same owner/session/op must recover a committed registration reply");
 assert_eq!(again.incarnation,a.incarnation);assert_eq!(again.session_id,a.session_id);assert_eq!(r.local.len(),1);
 quitting(&mut r,"registration-recovery-quit");let during_quit=register_local(&mut r,a.session_id.clone(),a.operation_id.clone(),"main").expect("exact no-audio recovery during quit must remain possible");assert_eq!(during_quit.incarnation,a.incarnation);
 r.quit=None;local_entry(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main").unwrap().started=true;assert!(register_local(&mut r,a.session_id.clone(),a.operation_id.clone(),"main").is_err());
}
#[test] fn cross_owner_changed_op_stale_and_new_session_do_not_adopt(){
 let mut r=Registry::default();let a=register(&mut r,"main");
 for(owner,s,o)in[("note-b",a.session_id.clone(),a.operation_id.clone()),("main",a.session_id.clone(),ids().1),("main",ids().0,a.operation_id.clone()),("main",ids().0,ids().1)]{assert!(register_local(&mut r,s,o,owner).is_err())}
 let b=register(&mut r,"note-b");assert_ne!(a.incarnation,b.incarnation);
 r.local.get_mut(&a.session_id).unwrap().owner_alive=false;r.incarnations.remove("main");
 assert!(register_local(&mut r,a.session_id.clone(),a.operation_id.clone(),"main").is_err());assert!(!may_exit(&mut r));
}
#[test] fn no_audio_release_does_not_ack_quit_documents_or_allow_stale_cleanup(){
 let mut r=Registry::default();let a=register(&mut r,"main");quitting(&mut r,"q");
 release_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",false,0).unwrap();assert!(!may_exit(&mut r));
 for owner in ["main","note-b"]{seal_quit_participant(&mut r,"q",owner).unwrap();}
 acknowledge_quit_participant(&mut r,"q","main").unwrap();assert!(!may_exit(&mut r));acknowledge_quit_participant(&mut r,"q","note-b").unwrap();assert!(may_exit(&mut r));
}
#[test] fn timeout_and_late_final_cannot_replay_expired_quit(){
 let mut r=Registry::default();let a=register(&mut r,"main");local_entry(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main").unwrap().started=true;quitting(&mut r,"q-old");assert!(expire_quit(&mut r,"q-old"));
 acknowledge_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",1,true).unwrap();release_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",true,1).unwrap();
 assert!(seal_quit_participant(&mut r,"q-old","main").is_err());assert!(acknowledge_quit_participant(&mut r,"q-old","main").is_err());assert!(!may_exit(&mut r));assert!(!r.exit_allowed);
}
#[test] fn final_cleanup_exact_receipt_and_new_session_protection(){
 let mut r=Registry::default();let a=register(&mut r,"main");local_entry(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main").unwrap().started=true;
 acknowledge_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",1,false).unwrap();assert!(release_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",true,1).is_err());
 acknowledge_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",2,true).unwrap();release_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",true,2).unwrap();release_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",true,2).unwrap();
 let b=register(&mut r,"main");assert!(release_local(&mut r,&a.session_id,&a.operation_id,&a.incarnation,"main",true,2).is_err());assert!(r.local.contains_key(&b.session_id));
}
}

