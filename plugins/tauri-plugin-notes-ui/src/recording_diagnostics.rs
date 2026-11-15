//! Content-free, process-local recording diagnostics. No file/network sink.
use std::{
    io::Write,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
        OnceLock,
    },
    time::Instant,
};

pub(super) const EVENT_LIMIT: usize = 256;
static ENABLED: OnceLock<bool> = OnceLock::new();
static NEXT_REQUEST: AtomicU64 = AtomicU64::new(1);
const QUEUE_CAPACITY: usize = 64;
static SENDER: OnceLock<Option<SyncSender<Event>>> = OnceLock::new();
static ATTEMPTS: AtomicU64 = AtomicU64::new(0);
static QUEUE_DROPPED: AtomicU64 = AtomicU64::new(0);
static BUDGET_DROPPED: AtomicU64 = AtomicU64::new(0);
#[cfg(test)]
static TEST_WRITTEN: AtomicU64 = AtomicU64::new(0);
#[cfg(test)]
static TEST_TRUNCATED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
struct Event {
    request: u64,
    stage: Stage,
    code: i32,
    status: i64,
    micros: u128,
}

// This is the only I/O owner. It may block forever on a pipe without retaining
// any authorization context; producers never wait for it, including at exit.
fn writer(rx: mpsc::Receiver<Event>) {
    let mut written = 0;
    let mut truncated = false;
    loop {
        match rx.recv_timeout(std::time::Duration::from_millis(25)) {
            Ok(event) => {
                if truncated {
                    continue;
                }
                let _ = writeln!(
                    std::io::stderr().lock(),
                    "notes-recording-diag request={} stage={} code={} status={} t_us={}",
                    event.request,
                    event.stage.name(),
                    event.code,
                    event.status,
                    event.micros
                );
                written += 1;
                #[cfg(test)]
                TEST_WRITTEN.fetch_add(1, Ordering::Release);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let queue_dropped = QUEUE_DROPPED.load(Ordering::Relaxed);
                let budget_dropped = BUDGET_DROPPED.load(Ordering::Relaxed);
                if !truncated && (queue_dropped != 0 || budget_dropped != 0) {
                    let micros = EPOCH.get().map_or(0, |epoch| epoch.elapsed().as_micros());
                    let _ = writeln!(std::io::stderr().lock(),
                        "notes-recording-diag stage=truncated event_limit={EVENT_LIMIT} emitted={written} queue_dropped={queue_dropped} budget_dropped={budget_dropped} t_us={micros}");
                    truncated = true;
                    #[cfg(test)]
                    TEST_TRUNCATED.store(true, Ordering::Release);
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

// Test-only completion observation. No product endpoint or flush/join exists.
#[cfg(test)]
#[allow(dead_code)]
pub(super) fn test_output() -> (u64, bool) {
    (
        TEST_WRITTEN.load(Ordering::Acquire),
        TEST_TRUNCATED.load(Ordering::Acquire),
    )
}
static EPOCH: OnceLock<Instant> = OnceLock::new();

// Values are shared with recording_access.m. The sink accepts only this closed
// stage vocabulary; unknown stage numbers are discarded, never formatted raw.
#[derive(Clone, Copy)]
#[repr(u32)]
pub(super) enum Stage {
    RustDispatch = 1,
    RustMain = 2,
    RustWindow = 3,
    NativeEntry = 4,
    NativeMain = 5,
    NativeWindow = 6,
    PendingBusy = 7,
    ExistingStatus = 8,
    RequestIssued = 9,
    NativeFinish = 10,
    OsCompletionEntry = 11,
    MainCompletion = 12,
    CompletionStatus = 13,
    PendingClear = 14,
    NativeException = 15,
    LateCompletion = 16,
    WindowClose = 17,
    ContextRelease = 18,
    NativeResult = 19,
    RustWaitReceive = 20,
    RustWaitDeadline = 21,
    RustRevalidate = 22,
    RustDelivery = 23,
    RustWaitCancelled = 24,
    RustLateDispatch = 25,
    LateReceiver = 26,
    DuplicateFinish = 27,
}
impl Stage {
    fn name(self) -> &'static str {
        match self {
            Self::RustDispatch => "rust_dispatch",
            Self::RustMain => "rust_main",
            Self::RustWindow => "rust_window",
            Self::NativeEntry => "native_entry",
            Self::NativeMain => "native_main",
            Self::NativeWindow => "native_window",
            Self::PendingBusy => "pending_busy",
            Self::ExistingStatus => "existing_status",
            Self::RequestIssued => "request_issued",
            Self::NativeFinish => "native_finish",
            Self::OsCompletionEntry => "os_completion_entry",
            Self::MainCompletion => "main_completion",
            Self::CompletionStatus => "completion_status",
            Self::PendingClear => "pending_clear",
            Self::NativeException => "native_exception",
            Self::LateCompletion => "late_completion",
            Self::WindowClose => "window_close",
            Self::ContextRelease => "context_release",
            Self::NativeResult => "native_result",
            Self::RustWaitReceive => "rust_wait_receive",
            Self::RustWaitDeadline => "rust_wait_deadline",
            Self::RustRevalidate => "rust_revalidate",
            Self::RustDelivery => "rust_delivery",
            Self::RustWaitCancelled => "rust_wait_cancelled",
            Self::RustLateDispatch => "rust_late_dispatch",
            Self::LateReceiver => "late_receiver",
            Self::DuplicateFinish => "duplicate_finish",
        }
    }
}

#[derive(Clone, Copy)]
pub(super) struct Request(pub u64);
impl Request {
    pub fn new() -> Self {
        if *ENABLED.get_or_init(|| {
            std::env::var_os("NOTES_RECORDING_DIAGNOSTICS").as_deref()
                == Some(std::ffi::OsStr::new("1"))
        }) {
            // Initialize before dispatch to AppKit. The main/OS/FFI producer
            // path below only reads this cell and never starts or joins threads.
            EPOCH.get_or_init(Instant::now);
            SENDER.get_or_init(|| {
                let (tx, rx) = mpsc::sync_channel(QUEUE_CAPACITY);
                std::thread::Builder::new()
                    .name("notes-recording-diag".into())
                    .spawn(move || writer(rx))
                    .ok()
                    .map(|_| tx)
            });
            Self(NEXT_REQUEST.fetch_add(1, Ordering::Relaxed))
        } else {
            Self(0)
        }
    }
    pub fn emit(self, stage: Stage, code: i32, status: i64) {
        if self.0 == 0 {
            return;
        }
        // Fixed-size scalars only. No lock, allocation, I/O, worker wait or
        // blocking send occurs on main, OS callback or FFI producers.
        let slot = ATTEMPTS.fetch_add(1, Ordering::Relaxed);
        if slot >= EVENT_LIMIT as u64 {
            BUDGET_DROPPED.fetch_add(1, Ordering::Relaxed);
            return;
        }
        let micros = EPOCH.get().map_or(0, |epoch| epoch.elapsed().as_micros());
        let event = Event {
            request: self.0,
            stage,
            code,
            status,
            micros,
        };
        if !matches!(SENDER.get(), Some(Some(sender)) if sender.try_send(event).is_ok()) {
            QUEUE_DROPPED.fetch_add(1, Ordering::Relaxed);
        }
    }
    pub fn error(self, mut error: crate::Error, stage: Stage) -> crate::Error {
        if self.0 != 0 && error.stage.is_none() {
            error.stage = Some(stage.name().into());
            error.request_id = Some(self.0.to_string());
        }
        error
    }
    pub fn callback(self) -> Option<extern "C" fn(u64, u32, i32, std::ffi::c_long)> {
        if self.0 == 0 {
            None
        } else {
            Some(native_event)
        }
    }
}

extern "C" fn native_event(request: u64, stage: u32, code: i32, status: std::ffi::c_long) {
    let stage = match stage {
        4 => Stage::NativeEntry,
        5 => Stage::NativeMain,
        6 => Stage::NativeWindow,
        7 => Stage::PendingBusy,
        8 => Stage::ExistingStatus,
        9 => Stage::RequestIssued,
        10 => Stage::NativeFinish,
        11 => Stage::OsCompletionEntry,
        12 => Stage::MainCompletion,
        13 => Stage::CompletionStatus,
        14 => Stage::PendingClear,
        15 => Stage::NativeException,
        16 => Stage::LateCompletion,
        17 => Stage::WindowClose,
        27 => Stage::DuplicateFinish,
        _ => return,
    };
    let _ = std::panic::catch_unwind(|| Request(request).emit(stage, code, status));
}

// A dropped preflight future identifies a cancelled/expired Rust waiter. It
// neither owns nor cancels the native context or the outstanding OS request.
pub(super) struct Delivery(pub Request, pub bool);
impl Drop for Delivery {
    fn drop(&mut self) {
        if !self.1 {
            self.0.emit(Stage::RustWaitCancelled, 0, -1);
        }
    }
}
