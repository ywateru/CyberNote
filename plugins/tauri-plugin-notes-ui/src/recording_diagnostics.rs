//! Content-free, process-local recording diagnostics. No file/network sink.
use std::{
    io::Write,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::Instant,
};

pub(super) const EVENT_LIMIT: usize = 256;
static ENABLED: OnceLock<bool> = OnceLock::new();
static NEXT_REQUEST: AtomicU64 = AtomicU64::new(1);
static OUTPUT: Mutex<usize> = Mutex::new(0);
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
            Self(NEXT_REQUEST.fetch_add(1, Ordering::Relaxed))
        } else {
            Self(0)
        }
    }
    pub fn emit(self, stage: Stage, code: i32, status: i64) {
        if self.0 == 0 {
            return;
        }
        // Diagnostics cannot unwind across FFI or alter authorization results.
        let _ = std::panic::catch_unwind(|| {
            let mut count = OUTPUT.lock().unwrap_or_else(|error| error.into_inner());
            if *count > EVENT_LIMIT {
                return;
            }
            let micros = EPOCH.get_or_init(Instant::now).elapsed().as_micros();
            let mut output = std::io::stderr().lock();
            if *count == EVENT_LIMIT {
                let _ = writeln!(
                    output,
                    "notes-recording-diag stage=truncated events={EVENT_LIMIT} t_us={micros}"
                );
            } else {
                let _ = writeln!(output, "notes-recording-diag request={} stage={} code={code} status={status} t_us={micros}", self.0, stage.name());
            }
            *count += 1;
        });
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
    Request(request).emit(stage, code, status);
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
