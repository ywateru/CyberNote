#!/usr/bin/env python3
"""Compile exact selected production Registry functions without Tauri runtime.
Only Serialize derives/command wrappers are omitted. No copied core algorithm.
The caller coordinates the native compilation slot and supplies cached uuid rlib.
"""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--uuid-rlib',required=True);p.add_argument('--source',required=True);a=p.parse_args();out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
source=Path('src-tauri/src/recording_window.rs').read_text();expected=subprocess.check_output(['git','show',a.source+':src-tauri/src/recording_window.rs'],text=True);assert source==expected

def item(kind,name):
    import re
    m=re.search(r'(?m)^(?:pub )?'+kind+r' '+name+r'(?:\b|<)',source);assert m,name
    begin=source.index('{',m.start());depth=0
    for i in range(begin,len(source)):
        if source[i]=='{':depth+=1
        elif source[i]=='}':
            depth-=1
            if depth==0:return source[m.start():i+1]
    raise AssertionError(name)
structs=['Identity','Entry','Quit','Registry','LocalIdentity','LocalEntry']
functions=['canonical_uuid','document_window','register_local','local_entry','acknowledge_local','release_local','seal_quit_participant','acknowledge_quit_participant','expire_quit','cancel_destroyed_participant','may_exit','cancel_changed_participants']
parts=['#![allow(dead_code)]\nuse std::collections::{HashMap,HashSet};']
selected={}
for name in structs:
    selected[name]=item('struct',name);parts.append(('#[derive(Clone)]\n' if name in ['Identity','LocalIdentity'] else '#[derive(Default)]\n' if name=='Registry' else '')+selected[name])
for name in functions:selected[name]=item('fn',name);parts.append(selected[name])
parts.append(r'''
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
''')
core=out/'production-core-and-tests.rs';core.write_text('\n\n'.join(parts)+'\n');rlib=Path(a.uuid_rlib).resolve();manifest={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'source':a.source,'sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'selected':{n:hashlib.sha256(s.encode()).hexdigest() for n,s in selected.items()},'uuidRlib':str(rlib),'uuidSha256':hashlib.sha256(rlib.read_bytes()).hexdigest(),'coreSha256':hashlib.sha256(core.read_bytes()).hexdigest(),'limits':'Selected exact production Registry structs/functions, Serialize omitted; command wrappers/runtime not executed. uuid actual cached production dependency. No GUI/device/hardware media.'}
(out/'bindings.json').write_text(json.dumps(manifest,indent=2)+'\n');(out/'runner-used.py').write_bytes(Path(__file__).read_bytes());binary=out/'native-core-tests';compile_args=['rustc','--test','--edition=2021','--crate-name','sidebar66_independent',str(core),'--extern','uuid='+str(rlib),'-L','dependency='+str(rlib.parent),'-o',str(binary)]
with (out/'compile.stdout').open('w')as f:r=subprocess.run(compile_args,stdout=f,stderr=subprocess.STDOUT)
assert r.returncode==0,'independent native core compile failed'
with (out/'tests.stdout').open('w')as f:r=subprocess.run([str(binary),'--nocapture'],stdout=f,stderr=subprocess.STDOUT)
(out/'result.json').write_text(json.dumps({'source':a.source,'compileExit':0,'testExit':r.returncode,'status':'pass'if r.returncode==0 else'failed'},indent=2)+'\n');print(json.dumps({'status':'pass'if r.returncode==0 else'failed','testExit':r.returncode,'source':a.source}));raise SystemExit(r.returncode)
