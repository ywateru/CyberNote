use crate::CancellationToken;
use std::{
    future::Future,
    io,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
pub trait AsyncStream: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> AsyncStream for T {}
pub type BoxStream = Box<dyn AsyncStream>;
struct Closed {
    pending: Option<Pin<Box<dyn Future<Output = ()> + Send>>>,
}
impl Closed {
    fn new(generation: CancellationToken, shutdown: CancellationToken) -> Self {
        Self {
            pending: Some(Box::pin(async move {
                tokio::select! {_=generation.cancelled()=>{},_=shutdown.cancelled()=>{}}
            })),
        }
    }

    fn is_closed(&mut self, cx: &mut Context<'_>) -> bool {
        let Some(pending) = self.pending.as_mut() else {
            return true;
        };
        if pending.as_mut().poll(cx).is_pending() {
            return false;
        }
        // Cancellation is terminal. Drop the completed future before any later IO poll.
        self.pending = None;
        true
    }
}
struct Stream<T> {
    native: T,
    read_closed: Closed,
    write_closed: Closed,
}
pub(crate) fn boxed<T: AsyncStream + 'static>(
    native: T,
    generation: CancellationToken,
    shutdown: CancellationToken,
) -> BoxStream {
    Box::new(Stream {
        native,
        read_closed: Closed::new(generation.clone(), shutdown.clone()),
        write_closed: Closed::new(generation, shutdown),
    })
}
fn closed_error() -> io::Error {
    io::Error::new(
        io::ErrorKind::ConnectionAborted,
        "transport closed or address generation changed",
    )
}
impl<T: AsyncStream> AsyncRead for Stream<T> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.read_closed.is_closed(cx) {
            return Poll::Ready(Err(closed_error()));
        }
        Pin::new(&mut this.native).poll_read(cx, buf)
    }
}
impl<T: AsyncStream> AsyncWrite for Stream<T> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        if this.write_closed.is_closed(cx) {
            return Poll::Ready(Err(closed_error()));
        }
        Pin::new(&mut this.native).poll_write(cx, buf)
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.write_closed.is_closed(cx) {
            return Poll::Ready(Err(closed_error()));
        }
        Pin::new(&mut this.native).poll_flush(cx)
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.write_closed.is_closed(cx) {
            return Poll::Ready(Err(closed_error()));
        }
        Pin::new(&mut this.native).poll_shutdown(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    use std::task::{Wake, Waker};
    use tokio::io::{AsyncReadExt, AsyncWriteExt, duplex};

    async fn assert_closed(stream: &mut BoxStream) {
        for _ in 0..3 {
            assert_eq!(
                stream.write(b"closed").await.unwrap_err().kind(),
                io::ErrorKind::ConnectionAborted
            );
            // Session cleanup after the write error must be safe on every attempt.
            assert_eq!(
                stream.shutdown().await.unwrap_err().kind(),
                io::ErrorKind::ConnectionAborted
            );
            assert_eq!(
                stream.flush().await.unwrap_err().kind(),
                io::ErrorKind::ConnectionAborted
            );
            assert_eq!(
                stream.read(&mut [0]).await.unwrap_err().kind(),
                io::ErrorKind::ConnectionAborted
            );
        }
    }

    #[tokio::test]
    async fn cancelled_stream_is_terminal_for_every_initial_io_operation() {
        for shutdown_first in [false, true] {
            for first_operation in 0..4 {
                let generation = CancellationToken::new();
                let shutdown = CancellationToken::new();
                let (native, mut peer) = duplex(16);
                // Both native directions are ready: cancellation must take priority.
                peer.write_all(b"ready").await.unwrap();
                let mut stream = boxed(native, generation.child_token(), shutdown.clone());
                if shutdown_first {
                    shutdown.cancel();
                } else {
                    generation.cancel();
                }
                let error = match first_operation {
                    0 => stream.read(&mut [0]).await.unwrap_err(),
                    1 => stream.write(b"ready").await.unwrap_err(),
                    2 => stream.flush().await.unwrap_err(),
                    _ => stream.shutdown().await.unwrap_err(),
                };
                assert_eq!(error.kind(), io::ErrorKind::ConnectionAborted);
                assert_closed(&mut stream).await;
            }
        }
    }

    #[derive(Default)]
    struct WakeCount(AtomicUsize);

    impl Wake for WakeCount {
        fn wake(self: Arc<Self>) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn cancellation_wakes_both_pending_directions_and_stays_terminal() {
        for cancel_shutdown in [false, true] {
            let generation = CancellationToken::new();
            let shutdown = CancellationToken::new();
            let (native, _peer) = duplex(1);
            let mut stream = boxed(native, generation.child_token(), shutdown.clone());
            // Fill the native write buffer while the peer leaves the read side empty.
            stream.write_all(b"x").await.unwrap();
            let read_wakes = Arc::new(WakeCount::default());
            let write_wakes = Arc::new(WakeCount::default());
            let read_waker = Waker::from(read_wakes.clone());
            let write_waker = Waker::from(write_wakes.clone());
            assert!(
                Pin::new(&mut stream)
                    .poll_read(
                        &mut Context::from_waker(&read_waker),
                        &mut ReadBuf::new(&mut [0]),
                    )
                    .is_pending()
            );
            assert!(
                Pin::new(&mut stream)
                    .poll_write(&mut Context::from_waker(&write_waker), b"y")
                    .is_pending()
            );
            assert_eq!(read_wakes.0.load(Ordering::SeqCst), 0);
            assert_eq!(write_wakes.0.load(Ordering::SeqCst), 0);
            if cancel_shutdown {
                shutdown.cancel();
            } else {
                generation.cancel();
            }
            assert!(read_wakes.0.load(Ordering::SeqCst) > 0);
            assert!(write_wakes.0.load(Ordering::SeqCst) > 0);
            assert_closed(&mut stream).await;

            // Replacing a generation cannot revive streams belonging to the old token.
            let (native, _peer) = duplex(1);
            let mut replacement = boxed(native, CancellationToken::new(), shutdown);
            if !cancel_shutdown {
                replacement.write_all(b"z").await.unwrap();
            }
            assert_closed(&mut stream).await;
        }
    }
}
