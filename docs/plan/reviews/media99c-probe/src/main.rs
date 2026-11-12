// Independent probe uses the actual registered Provider and native C decoder.
// Tauri MockRuntime replaces app/window boot only; decoder and worker are real.
use std::{fs::File, sync::atomic::{AtomicUsize,Ordering}, time::{Duration,Instant}};
use tauri::{Manager,test::{mock_builder,mock_context,noop_assets,MockRuntime}};
use tauri_plugin_notes_media::Provider;
fn main() {
    let app=mock_builder().plugin(tauri_plugin_notes_media::init()).build(mock_context(noop_assets())).unwrap();
    let p=app.state::<Provider<MockRuntime>>();
    let args:Vec<_>=std::env::args().collect();
    let png=File::open(&args[1]).unwrap();let png_bytes=png.metadata().unwrap().len();
    let frame=p.thumbnail(&png,png_bytes,"image/png",64,24_000_000,||false).unwrap();
    assert_eq!((frame.width,frame.height),(64,64));assert_eq!(frame.rgba.len(),64*64*4);
    for pixel in frame.rgba.chunks_exact(4) {
        assert!(pixel.iter().zip([200u8,100,50,128]).all(|(a,b)|a.abs_diff(b)<=3),"straight alpha pixel {:?}",pixel);
    }
    println!("actual plugin transparent PNG preserves straight RGBA, exact allocated size and output bounds");
    for pixels in [0,1025] {assert!(p.thumbnail(&png,png_bytes,"image/png",pixels,24_000_000,||false).is_err());}
    assert!(p.thumbnail(&png,png_bytes+1,"image/png",64,24_000_000,||false).is_err());
    assert!(p.thumbnail(&png,png_bytes,"image/png",64,1,||false).is_err());
    println!("actual plugin rejects invalid target, mismatched FD length and source pixel budget");
    let video=File::open(&args[2]).unwrap();let video_bytes=video.metadata().unwrap().len();
    let before=Instant::now();
    let cancelled=p.thumbnail(&video,video_bytes,"video/mp4",480,24_000_000,||true);
    assert!(matches!(cancelled,Err(ref code)if code=="cancelled"));assert!(before.elapsed()<Duration::from_millis(500));
    drop(video); // The actual worker must own its duplicate after caller release.
    let busy=p.thumbnail(&png,png_bytes,"image/png",64,24_000_000,||false);
    assert!(matches!(busy,Err(ref code)if code=="media_busy"));
    let attempts=AtomicUsize::new(0);let start=Instant::now();
    loop {
        attempts.fetch_add(1,Ordering::Relaxed);
        match p.thumbnail(&png,png_bytes,"image/png",64,24_000_000,||false) {
            Ok(frame)=>{assert_eq!(frame.rgba.len(),64*64*4);break;},
            Err(code)=>{assert_eq!(code,"media_busy");assert!(start.elapsed()<Duration::from_secs(10));std::thread::sleep(Duration::from_millis(10));}
        }
    }
    println!("actual cancelled video worker retains FD and exclusive busy guard until native completion; subsequent decode succeeds after {} attempts / {:?}",attempts.load(Ordering::Relaxed),start.elapsed());
}
