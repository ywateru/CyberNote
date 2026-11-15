//! Independent probes of actual Store -> cache -> production SVG renderer.
use crate::attachment_media::*;
use crate::{session, store};
use serde_json::json;
use std::{sync::{Arc, Condvar, Mutex}, time::Duration};
fn source(body: &str) -> Vec<u8> {
    format!("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='180'><rect width='400' height='180' fill='white'/>{body}</svg>").into_bytes()
}
async fn probe(bytes: Vec<u8>) -> (Result<image::RgbaImage, String>, usize) {
    let dir = tempfile::tempdir().unwrap();
    let cache = dir.path().join("cache");
    let mut store = store::Store::open(&dir.path().join("store")).unwrap();
    let note = store.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_owned();
    let a = store.store_attachment(&note,"review.svg","image/svg+xml",bytes).unwrap();
    let session = session::Session::new(store);
    let snap = session.snapshot().unwrap();
    let token = session::Token { session_id:snap["sessionId"].as_str().unwrap().into(), epoch:snap["epoch"].as_u64().unwrap(), note_epoch:Some(snap["notes"][&note]["epoch"].as_u64().unwrap()) };
    let authority = Arc::new(SessionAuthority::new(Arc::new((Mutex::new(session),Condvar::new()))));
    let window=authority.open_window("independent104").unwrap();
    let core=MediaCore::new(authority,ThumbnailCache::new(cache.clone(),ThumbnailLimits::default()).unwrap(),Duration::from_secs(60)).unwrap();
    let (result, second, third)=tokio::join!(
        core.grant_thumbnail(&window,&a.id,&token,400,"http://127.0.0.1:1"),
        core.grant_thumbnail(&window,&a.id,&token,400,"http://127.0.0.1:1"),
        core.grant_thumbnail(&window,&a.id,&token,400,"http://127.0.0.1:1"));
    assert_eq!(result.is_ok(),second.is_ok());assert_eq!(result.is_ok(),third.is_ok());
    if result.is_ok() { assert_eq!(core.metrics.thumbnail_generations.load(std::sync::atomic::Ordering::Relaxed),1); }
    let files:Vec<_>=std::fs::read_dir(cache).unwrap().map(|f|f.unwrap().path()).collect();
    let count=files.len();
    (match result { Ok(_) => Ok(image::open(&files[0]).unwrap().into_rgba8()), Err(e)=>Err(e.code) },count)
}
pub async fn svg104_review_partial_span_and_windows() {
    for body in [
        "<text x='20' y='70' font-size='40'>Visible<tspan>\u{10ffff}</tspan></text>",
        "<text x='20' y='70' font-size='40'>Visible</text><g display='none'><text>Hidden</text></g>",
        "<text x='20' y='70' font-size='40'>Visible<tspan font-size='0'>Dropped</tspan></text>",
    ] {
        let (result,files)=probe(source(body)).await;
        assert!(result.is_err(),"partial text accepted: {body}"); assert_eq!(files,0);
    }
    // Positioning outside the viewport is legitimate SVG, not a missing glyph.
    // It must not hide the visible sibling, which we compare against a blank.
    let (blank,_)=probe(source("")).await;let blank=blank.unwrap();
    let (actual,_)=probe(source("<text x='20' y='70' font-size='40'>可见 ABC<tspan x='5000' y='5000'>outside</tspan></text>")).await;
    let actual=actual.unwrap();
    let changed=actual.pixels().zip(blank.pixels()).filter(|(a,b)|a!=b).count();
    assert!(changed>100,"visible text window missing");
}
pub async fn svg104_review_external_attributes() {
    let mut accepted=Vec::new();
    for body in [
        "<rect x='10' y='10' width='40' height='40' fill='url(http://127.0.0.1:9/private)'/>",
        "<rect x='10' y='10' width='40' height='40' stroke='url(file:///private/secret)'/>",
        "<rect x='10' y='10' width='40' height='40' fill='url(data:image/svg+xml;base64,AAAA)'/>",
    ] {
        let (result,files)=probe(source(body)).await;
        println!("external presentation outcome: accepted={} files={files} source={body}", result.is_ok());
        if result.is_ok() {accepted.push(body);} else {assert_eq!(files,0);}
    }
    assert!(accepted.is_empty(),"external presentation resources silently accepted: {accepted:?}");
}
pub async fn svg104_review_css_variants_and_budget() {
    for body in [
        "<style>/*split*/ @im/**/port 'http://127.0.0.1:9/x';</style><rect width='20' height='20'/>",
        "<rect width='20' height='20' style='fill:u\\72l(http://127.0.0.1:9/x)'/>",
        "<text x='20' y='70' style='font-size:40px;fill:URL(\"http://127.0.0.1:9/x\")'>中文</text>",
    ] {let(result,files)=probe(source(body)).await;assert!(result.is_err(),"CSS external variant accepted: {body}");assert_eq!(files,0);}
    let (result,files)=probe(source(&format!("<text x='20' y='70'>{}</text>","A".repeat(1025)))).await;
    assert!(result.is_err());assert_eq!(files,0);
    let (result,files)=probe(source(&format!("<text x='20' y='70'>{}</text>","<tspan>A</tspan>".repeat(128)))).await;
    assert!(result.is_err());assert_eq!(files,0);
}
pub async fn svg104_review_post_render_authority_and_source() {
    use std::{collections::HashSet, sync::atomic::{AtomicUsize, Ordering}};
    struct ChangeAfterRender { real:Arc<SessionAuthority>, session:Arc<(Mutex<session::Session>,Condvar)>, note:String, file:std::path::PathBuf, replace:bool, calls:AtomicUsize }
    impl Authorizer for ChangeAfterRender {
        fn authorize(&self,w:&WindowIdentity,id:&str,t:&session::Token)->store::Result<store::attachment_media::ManagedAttachment>{
            if self.calls.fetch_add(1,Ordering::SeqCst)==4 {
                if self.replace {
                    let old=std::fs::read(&self.file).unwrap();
                    let temp=self.file.with_extension("replacement");
                    let new:Vec<u8>=old.into_iter().map(|v|if v==b'A'{b'Z'}else{v}).collect();
                    std::fs::write(&temp,new).unwrap();std::fs::rename(temp,&self.file).unwrap();
                }else{
                    let mut s=self.session.0.lock().unwrap();let snap=s.snapshot().unwrap();
                    let t=session::Token{session_id:snap["sessionId"].as_str().unwrap().into(),epoch:snap["epoch"].as_u64().unwrap(),note_epoch:None};
                    s.begin(json!({"type":"deleteNote","id":self.note}),HashSet::from(["independent104".into()]),&t).unwrap();
                }
            }
            self.real.authorize(w,id,t)
        }
    }
    for replace in [false,true] {
        let dir=tempfile::tempdir().unwrap();let root=dir.path().join("store");let cache=dir.path().join("cache");
        let mut store=store::Store::open(&root).unwrap();
        let note=store.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_owned();
        let a=store.store_attachment(&note,"late.svg","image/svg+xml",source("<text x='20' y='70' font-size='40'>中文 ABC</text>")).unwrap();
        let s=session::Session::new(store);let snap=s.snapshot().unwrap();
        let token=session::Token{session_id:snap["sessionId"].as_str().unwrap().into(),epoch:snap["epoch"].as_u64().unwrap(),note_epoch:Some(snap["notes"][&note]["epoch"].as_u64().unwrap())};
        let session=Arc::new((Mutex::new(s),Condvar::new()));let real=Arc::new(SessionAuthority::new(session.clone()));let window=real.open_window("independent104").unwrap();
        let auth=Arc::new(ChangeAfterRender{real,session,note,file:root.join("attachments").join(&a.relative_path),replace,calls:AtomicUsize::new(0)});
        let core=MediaCore::new(auth.clone(),ThumbnailCache::new(cache.clone(),ThumbnailLimits::default()).unwrap(),Duration::from_secs(60)).unwrap();
        let e=core.grant_thumbnail(&window,&a.id,&token,400,"http://127.0.0.1:1").await.err().expect("late old result published");
        assert!(matches!(e.code.as_str(),"access_changed"|"metadata_stale"),"{}",e.code);
        assert_eq!(auth.calls.load(Ordering::SeqCst),5);
        assert_eq!(core.metrics.thumbnail_generation_attempts.load(Ordering::Relaxed),1);
        assert_eq!(core.metrics.thumbnail_generations.load(Ordering::Relaxed),0);
        assert_eq!(std::fs::read_dir(cache).unwrap().count(),0);
    }
}
pub async fn svg104_review_local_paint_and_css_comments() {
    let (actual, files) = probe(source("<style>/* retained stylesheet comment */ .red {fill:#ff0000}</style><rect class='red' x='10' y='10' width='40' height='40'/><rect x='70' y='10' width='40' height='40' style='/* retained inline comment */ fill:#0000ff'/><defs><linearGradient id='local'><stop stop-color='#00ff00'/></linearGradient></defs><rect x='130' y='10' width='40' height='40' fill='url( &quot;#local&quot; )'/>")).await;
    let image=actual.expect("ordinary local paint/comments were rejected");assert_eq!(files,1);
    assert_eq!(image.get_pixel(20,20).0,[255,0,0,255]);
    assert_eq!(image.get_pixel(80,20).0,[0,0,255,255]);
    assert_eq!(image.get_pixel(140,20).0,[0,255,0,255]);
}
