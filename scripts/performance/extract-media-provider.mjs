// Mechanical host-only extraction: no hand-maintained decoder/worker algorithm.
// The production generic parameter belongs only to Tauri's shell; Mac's methods
// use File + atomics. Fail closed if anchors cease to be unique.
export function extractMacProvider(source) {
 const unique=anchor=>{const i=source.indexOf(anchor);if(i<0||source.indexOf(anchor,i+1)!==-1)throw Error('Non-unique production provider boundary: '+anchor);return i;};
 const cut=(a,b)=>{const start=unique(a),end=unique(b);if(end<=start)throw Error('Reversed production provider boundary');return source.slice(start,end);};
 const imports=cut('use std::{','use tauri::{');
 const frame=cut('pub struct Frame {','pub struct Provider<R: Runtime> {');
 const methods=cut('impl<R: Runtime> Provider<R> {','#[cfg(target_os = "macos")]\nfn macos(').replace('impl<R: Runtime> Provider<R> {','impl Provider {');
 const mac=cut('#[cfg(target_os = "macos")]\nfn macos(','#[cfg(target_os = "android")]\nfn android');
 return '// Generated mechanically from production plugin; never edit.\n'+imports+frame+'pub struct Provider { busy: Arc<AtomicBool> }\n'+methods+mac+'pub fn measurement_provider() -> Provider { Provider { busy: Arc::new(AtomicBool::new(false)) } }\n';
}
