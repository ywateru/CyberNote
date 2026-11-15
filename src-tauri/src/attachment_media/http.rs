//! Standard HTTP parser + demand-polled bodies. A no-Range GET is a complete
//! 200 response, never a complete in-memory file. HTTP capabilities are bearer
//! URLs: Host/Origin hardening cannot authenticate an individual WebView.
use super::{Source, cancelled, error, Lease, MediaCore};
use crate::store::{attachment_media::FileStamp, Result};
use bytes::Bytes;
use futures_util::stream;
use http_body_util::{combinators::UnsyncBoxBody, BodyExt, Full, StreamBody};
use hyper::{
    body::{Frame, Incoming},
    header, Method, Request, Response, StatusCode,
};
use hyper_util::rt::TokioIo;
use std::{
    collections::HashSet,
    convert::Infallible,
    fs::File,
    io,
    sync::{atomic::Ordering, Arc},
    time::Duration,
};
use tokio::{
    net::TcpListener,
    sync::{mpsc, watch, Semaphore},
    task::JoinHandle,
};

pub(crate) const BLOCK_BYTES: usize = 64 * 1024;
type Body = UnsyncBoxBody<Bytes, io::Error>;
pub(crate) struct MediaServer {
    pub base: String,
    stop: watch::Sender<bool>,
    task: Option<JoinHandle<()>>,
    core: Arc<MediaCore>,
}
impl MediaServer {
    /// Origins are exact serialized app origins, configured by the host. Missing
    /// Origin is accepted for native media requests; URL possession is required.
    pub(crate) async fn start(core: Arc<MediaCore>, origins: HashSet<String>) -> Result<Self> {
        if origins.is_empty() || origins.iter().any(|o| !valid_origin(o)) {
            return Err(error("invalid", "媒体应用来源配置无效"));
        }
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| error("media_io", "无法启动本地媒体服务"))?;
        let address = listener.local_addr()?;
        let host = address.to_string();
        let base = format!("http://{host}");
        let (stop, mut stopped) = watch::channel(false);
        let serving_core = core.clone();
        let origins = Arc::new(origins);
        let slots = Arc::new(Semaphore::new(32));
        let task = tokio::spawn(async move {
            let mut sweep = tokio::time::interval(Duration::from_secs(15));
            loop {
                tokio::select! {
                    _ = cancelled_signal(&mut stopped) => break,
                    _ = sweep.tick() => serving_core.expire(),
                    accepted = listener.accept() => {
                        let Ok((socket, peer)) = accepted else { break; };
                        if !peer.ip().is_loopback() { continue; }
                        let Ok(slot) = slots.clone().try_acquire_owned() else { continue; };
                        // Keep kernel read-ahead bounded as well as body frames;
                        // avoid large writes queued behind a stopped consumer.
                        #[cfg(unix)] {
                            use std::os::fd::AsRawFd;
                            let size: libc::c_int = BLOCK_BYTES as _;
                            unsafe { libc::setsockopt(socket.as_raw_fd(), libc::SOL_SOCKET, libc::SO_SNDBUF,
                                &size as *const _ as *const _, std::mem::size_of_val(&size) as _); }
                        }
                        let core = serving_core.clone(); let origins = origins.clone(); let host = host.clone();
                        let mut stop = stopped.clone();
                        tokio::spawn(async move {
                            let _slot = slot;
                            let (watch_tx, mut watch_rx) = mpsc::channel::<watch::Receiver<bool>>(1);
                            let service = hyper::service::service_fn(move |request| {
                                handle(core.clone(), host.clone(), origins.clone(), watch_tx.clone(), request)
                            });
                            let mut builder = hyper::server::conn::http1::Builder::new();
                            builder.keep_alive(false).max_headers(32).max_buf_size(BLOCK_BYTES);
                            let connection = builder.serve_connection(TokioIo::new(socket), service);
                            // A stalled socket may stop polling its body. Watch
                            // cancellation at connection level so release/revoke
                            // still drops its file/task without consumer input.
                            let revoked = async {
                                if let Some(mut lease) = watch_rx.recv().await { cancelled_signal(&mut lease).await; }
                                else { std::future::pending::<()>().await; }
                            };
                            tokio::select! {
                                _ = connection => {},
                                _ = revoked => {},
                                _ = cancelled_signal(&mut stop) => {},
                                _ = tokio::time::sleep(Duration::from_secs(6 * 60 * 60)) => {},
                            }
                        });
                    }
                }
            }
        });
        Ok(Self {
            base,
            stop,
            task: Some(task),
            core,
        })
    }
    pub(crate) fn is_running(&self) -> bool {
        !*self.stop.borrow() && self.task.as_ref().is_some_and(|task| !task.is_finished())
    }
    pub(crate) async fn shutdown(mut self) {
        self.core.revoke_all();
        self.stop.send_replace(true);
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
    }
}
impl Drop for MediaServer {
    fn drop(&mut self) {
        self.core.revoke_all();
        self.stop.send_replace(true);
    }
}
async fn cancelled_signal(signal: &mut watch::Receiver<bool>) {
    while !*signal.borrow_and_update() {
        if signal.changed().await.is_err() {
            break;
        }
    }
}
fn valid_origin(origin: &str) -> bool {
    // URL's generic origin serializer treats custom schemes as opaque. Tauri's
    // macOS application origin is nevertheless an exact host-configured value.
    if origin == "tauri://localhost" {
        return true;
    }
    if origin == "null" {
        return false;
    }
    url::Url::parse(origin).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https" | "tauri")
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path() == "/"
            && url.host_str().is_some()
            && url.origin().ascii_serialization() == origin
    })
}
fn empty(status: StatusCode) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header(header::CONTENT_LENGTH, "0")
        .body(
            Full::new(Bytes::new())
                .map_err(|never: Infallible| match never {})
                .boxed_unsync(),
        )
        .unwrap()
}
fn denied() -> Response<Body> {
    empty(StatusCode::NOT_FOUND)
}

async fn handle(
    core: Arc<MediaCore>,
    host: String,
    origins: Arc<HashSet<String>>,
    watch_tx: mpsc::Sender<watch::Receiver<bool>>,
    request: Request<Incoming>,
) -> std::result::Result<Response<Body>, Infallible> {
    if request.headers().get_all(header::HOST).iter().count() != 1
        || request
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            != Some(host.as_str())
    {
        return Ok(empty(StatusCode::FORBIDDEN));
    }
    if request.uri().scheme().is_some()
        || request.uri().authority().is_some()
        || request.uri().query().is_some()
    {
        return Ok(empty(StatusCode::BAD_REQUEST));
    }
    let origin = if request.headers().get_all(header::ORIGIN).iter().count() > 1 {
        return Ok(empty(StatusCode::FORBIDDEN));
    } else if let Some(origin) = request.headers().get(header::ORIGIN) {
        match origin.to_str() {
            Ok(value) if origins.contains(value) => Some(value.to_owned()),
            _ => return Ok(empty(StatusCode::FORBIDDEN)),
        }
    } else {
        None
    };
    if request.method() != Method::GET && request.method() != Method::HEAD {
        let mut response = empty(StatusCode::METHOD_NOT_ALLOWED);
        response
            .headers_mut()
            .insert(header::ALLOW, "GET, HEAD".parse().unwrap());
        return Ok(response);
    }
    let Some(id) = request
        .uri()
        .path()
        .strip_prefix("/media/")
        .filter(|id| id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()))
    else {
        return Ok(denied());
    };
    let id = id.to_string();
    let authorization = core.clone();
    // Authorization performs bounded synchronous stat/open work on a worker.
    let lease = match tokio::task::spawn_blocking(move || authorization.lease(&id)).await {
        Ok(Ok(lease)) => lease,
        _ => return Ok(denied()),
    };
    if watch_tx.send(lease.cancel.subscribe()).await.is_err() {
        return Ok(denied());
    }
    let range = if request.headers().get_all(header::RANGE).iter().count() > 1 {
        Err(())
    } else {
        parse_range(
            request
                .headers()
                .get(header::RANGE)
                .map(|v| v.to_str().map_err(|_| ()))
                .transpose(),
            lease.bytes,
        )
    };
    let (start, length, partial) = match range {
        Ok(range) => range,
        Err(_) => {
            let mut response = empty(StatusCode::RANGE_NOT_SATISFIABLE);
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                format!("bytes */{}", lease.bytes).parse().unwrap(),
            );
            return Ok(response);
        }
    };
    // HEAD still verifies that the exact source exists, without reading its
    // payload. Evicted/corrupt thumbnails must not advertise successful bytes.
    let opening = core.clone();
    let opening_lease = lease.clone();
    let opened =
        match tokio::task::spawn_blocking(move || opening.open_source(&opening_lease)).await {
            Ok(Ok(opened)) => opened,
            _ => return Ok(denied()),
        };
    let is_head = request.method() == Method::HEAD;
    let body = if is_head || length == 0 {
        Full::new(Bytes::new())
            .map_err(|never: Infallible| match never {})
            .boxed_unsync()
    } else {
        let file = Arc::new(opened.file);
        let guard = ActiveStream(core.metrics.clone());
        core.metrics.active_streams.fetch_add(1, Ordering::Relaxed);
        let state = StreamState {
            core: core.clone(),
            lease: lease.clone(),
            file,
            stamp: opened.stamp,
            offset: start,
            remaining: length,
            _active: guard,
        };
        StreamBody::new(stream::unfold(state, |mut state| async {
            if state.remaining == 0 { return None; }
            let count = state.remaining.min(BLOCK_BYTES as u64) as usize;
            let core = state.core.clone(); let lease = state.lease.clone();
            let file = state.file.clone(); let stamp = state.stamp.clone(); let offset = state.offset;
            let mut cancel = lease.cancel.subscribe();
            let result = tokio::select! {
                _ = cancelled_signal(&mut cancel) => Err(cancelled()),
                result = tokio::task::spawn_blocking(move || {
                    core.check_lease(&lease)?;
                    if FileStamp::of(&file.metadata()?) != stamp { return Err(error("metadata_stale", "媒体文件已改变")); }
                    #[cfg(unix)] use std::os::unix::fs::FileExt;
                    let mut bytes = vec![0; count];
                    #[cfg(unix)] let read = file.read_at(&mut bytes, offset)?;
                    #[cfg(not(unix))] let read = 0;
                    core.metrics.bytes_read.fetch_add(read as u64, Ordering::Relaxed);
                    core.metrics.read_operations.fetch_add(1, Ordering::Relaxed);
                    let (bytes_counter, operations_counter) = match &lease.source {
                        Source::Original => (&core.metrics.original_bytes_read, &core.metrics.original_read_operations),
                        Source::Thumbnail(_) => (&core.metrics.thumbnail_bytes_read, &core.metrics.thumbnail_read_operations),
                    };
                    bytes_counter.fetch_add(read as u64, Ordering::Relaxed);
                    operations_counter.fetch_add(1, Ordering::Relaxed);
                    core.metrics.peak_read_block.fetch_max(count, Ordering::Relaxed);
                    if read == 0 { return Err(error("media_io", "媒体读取提前结束")); }
                    bytes.truncate(read);
                    core.check_lease(&lease)?;
                    if FileStamp::of(&file.metadata()?) != stamp { return Err(error("metadata_stale", "媒体文件已改变")); }
                    Ok(bytes)
                }) => result.unwrap_or_else(|_| Err(cancelled())),
            };
            match result {
                Ok(bytes) if !*state.lease.cancel.borrow() => {
                    state.offset += bytes.len() as u64; state.remaining -= bytes.len() as u64;
                    Some((Ok::<_, io::Error>(Frame::data(Bytes::from(bytes))), state))
                }
                Ok(_) | Err(_) => {
                    state.remaining = 0;
                    Some((Err(io::Error::other("media source revoked or unavailable")), state))
                }
            }
        })).boxed_unsync()
    };
    // Header values originate from native registration/sniff, never a URL path.
    let mut response = Response::builder()
        .status(if partial {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_TYPE, &lease.mime)
        .header(header::CONTENT_LENGTH, length)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header(header::CONNECTION, "close");
    if partial {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", start, start + length - 1, lease.bytes),
        );
    }
    if let Some(origin) = origin {
        response = response
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
            .header(header::VARY, "Origin")
            .header(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                "Content-Range, Content-Length, Accept-Ranges",
            );
    }
    Ok(response.body(body).unwrap_or_else(|_| denied()))
}
struct ActiveStream(Arc<super::MediaMetrics>);
impl Drop for ActiveStream {
    fn drop(&mut self) {
        self.0.active_streams.fetch_sub(1, Ordering::Relaxed);
    }
}
struct StreamState {
    core: Arc<MediaCore>,
    lease: Arc<Lease>,
    file: Arc<File>,
    stamp: FileStamp,
    offset: u64,
    remaining: u64,
    _active: ActiveStream,
}

fn parse_range(
    value: std::result::Result<Option<&str>, ()>,
    bytes: u64,
) -> std::result::Result<(u64, u64, bool), ()> {
    let Some(value) = value? else {
        return Ok((0, bytes, false));
    };
    let value = value.strip_prefix("bytes=").ok_or(())?;
    if value.contains(',') || bytes == 0 {
        return Err(());
    }
    let (start, end) = value.split_once('-').ok_or(())?;
    let decimal = |s: &str| {
        if !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) {
            s.parse::<u64>().map_err(|_| ())
        } else {
            Err(())
        }
    };
    if start.is_empty() {
        let suffix = decimal(end)?;
        if suffix == 0 {
            return Err(());
        }
        let length = suffix.min(bytes);
        Ok((bytes - length, length, true))
    } else {
        let start = decimal(start)?;
        let end = if end.is_empty() {
            bytes - 1
        } else {
            decimal(end)?.min(bytes - 1)
        };
        if start >= bytes || end < start {
            return Err(());
        }
        Ok((start, end - start + 1, true))
    }
}
