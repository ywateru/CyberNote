#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>
#include <stdint.h>

typedef void (*NotesRecordingReply)(void *, int, long);
typedef void (*NotesRecordingRelease)(void *);
typedef void (*NotesRecordingDiagnostic)(uint64_t, uint32_t, int, long);
// Shared fixed stage values with recording_diagnostics.rs. Only scalars cross
// this boundary; callback entry never reads AppKit or mutable request state.
enum {
    RecordingNativeEntry = 4, RecordingNativeMain = 5, RecordingNativeWindow = 6,
    RecordingPendingBusy = 7, RecordingExistingStatus = 8, RecordingRequestIssued = 9,
    RecordingFinish = 10, RecordingOsCompletionEntry = 11, RecordingMainCompletion = 12,
    RecordingCompletionStatus = 13, RecordingPendingClear = 14, RecordingException = 15,
    RecordingLateCompletion = 16, RecordingWindowClose = 17, RecordingDuplicateFinish = 27,
};
static void recordingDiagnostic(NotesRecordingDiagnostic diagnostic, uint64_t requestID,
                                uint32_t stage, int code, long status) {
    if (!diagnostic || !requestID) return;
    @try { diagnostic(requestID, stage, code, status); }
    @catch (NSException *exception) { (void)exception; }
}

@class NotesRecordingAccess;
// A system request cannot be cancelled. Keep it single-flight until its real
// callback, even after a view closes or the caller stops waiting.
static NotesRecordingAccess *pendingRecordingAccess;
static NSHashTable<NSWindow *> *closedRecordingWindows;
static id recordingWindowObserver;

// Install when the WebView becomes ready, before any Start. This only watches
// application-local window lifetime; it never queries or requests microphone access.
int notes_ui_recording_watch_windows(void) {
    if (!NSThread.isMainThread) return 1;
    @try {
        if (!recordingWindowObserver) {
            closedRecordingWindows = NSHashTable.weakObjectsHashTable;
            recordingWindowObserver = [NSNotificationCenter.defaultCenter
                addObserverForName:NSWindowWillCloseNotification object:nil queue:NSOperationQueue.mainQueue
                usingBlock:^(NSNotification *notification) {
                    if ([notification.object isKindOfClass:NSWindow.class])
                        [closedRecordingWindows addObject:notification.object];
                }];
        }
        return recordingWindowObserver ? 0 : 6;
    } @catch (NSException *exception) { (void)exception; return 6; }
}

void notes_ui_recording_drop(void) {
    if (!NSThread.isMainThread) return;
    if (recordingWindowObserver) [NSNotificationCenter.defaultCenter removeObserver:recordingWindowObserver];
    recordingWindowObserver = nil;
    closedRecordingWindows = nil;
}

@interface NotesRecordingAccess : NSObject
@property(nonatomic) void *context;
@property(nonatomic) NotesRecordingReply reply;
@property(nonatomic) NotesRecordingRelease releaseContext;
@property(nonatomic, copy) BOOL (^windowValid)(void);
@property(nonatomic, strong) id closeObserver;
@property(nonatomic) BOOL delivered;
@property(nonatomic) uint64_t requestID;
@property(nonatomic) NotesRecordingDiagnostic diagnostic;
- (void)diagnose:(uint32_t)stage code:(int)code status:(long)status;
- (AVAuthorizationStatus)authorizationStatus;
- (void)requestSystemAccess:(void (^)(BOOL))completion;
- (void)start;
- (void)finish:(int)code status:(long)status;
- (void)systemCompleted:(BOOL)granted;
- (void)scheduleTimeout;
@end

@implementation NotesRecordingAccess
- (void)diagnose:(uint32_t)stage code:(int)code status:(long)status {
    recordingDiagnostic(self.diagnostic, self.requestID, stage, code, status);
}
- (AVAuthorizationStatus)authorizationStatus {
    return [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}
- (void)requestSystemAccess:(void (^)(BOOL))completion {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:completion];
}
- (void)finish:(int)code status:(long)status {
    if (self.delivered) { [self diagnose:RecordingDuplicateFinish code:code status:status]; return; }
    [self diagnose:RecordingFinish code:code status:status];
    self.delivered = YES;
    if (self.closeObserver) {
        [NSNotificationCenter.defaultCenter removeObserver:self.closeObserver];
        self.closeObserver = nil;
    }
    // context is intentionally NOT released here. The OS block may still own
    // this object. Its late callback sees delivered and never replies twice.
    if (self.reply) self.reply(self.context, code, status);
}
- (void)scheduleTimeout {
    __weak NotesRecordingAccess *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        [weakSelf finish:7 status:-1];
    });
}
- (void)systemCompleted:(BOOL)granted {
    [self diagnose:RecordingMainCompletion code:0 status:granted];
    if (self.delivered) [self diagnose:RecordingLateCompletion code:0 status:granted];
    @try {
        if (!self.delivered) {
            if (!self.windowValid || !self.windowValid()) {
                [self finish:2 status:-1];
            } else {
                AVAuthorizationStatus status = [self authorizationStatus];
                [self diagnose:RecordingCompletionStatus code:0 status:status];
                if (status == AVAuthorizationStatusAuthorized && granted) [self finish:0 status:status];
                else if (status == AVAuthorizationStatusDenied) [self finish:3 status:status];
                else if (status == AVAuthorizationStatusRestricted) [self finish:4 status:status];
                else [self finish:9 status:status];
            }
        }
    } @catch (NSException *exception) {
        (void)exception;
        [self diagnose:RecordingException code:6 status:-1];
        [self finish:6 status:-1];
    }
    if (pendingRecordingAccess == self) {
        pendingRecordingAccess = nil;
        [self diagnose:RecordingPendingClear code:0 status:-1];
    }
}
- (void)start {
    @try {
        BOOL onMain = NSThread.isMainThread;
        [self diagnose:RecordingNativeMain code:0 status:onMain];
        if (!onMain) { [self finish:1 status:-1]; return; }
        BOOL valid = self.windowValid && self.windowValid();
        [self diagnose:RecordingNativeWindow code:0 status:valid];
        if (!valid) { [self finish:2 status:-1]; return; }
        if (pendingRecordingAccess) {
            [self diagnose:RecordingPendingBusy code:8 status:-1];
            [self finish:8 status:-1]; return;
        }
        AVAuthorizationStatus status = [self authorizationStatus];
        [self diagnose:RecordingExistingStatus code:0 status:status];
        switch (status) {
            case AVAuthorizationStatusAuthorized: [self finish:0 status:status]; return;
            case AVAuthorizationStatusDenied: [self finish:3 status:status]; return;
            case AVAuthorizationStatusRestricted: [self finish:4 status:status]; return;
            case AVAuthorizationStatusNotDetermined: break;
            default: [self finish:5 status:status]; return;
        }
        pendingRecordingAccess = self;
        [self scheduleTimeout];
        // Capture the owning ObjC object, never a raw Rust context pointer.
        // AVCaptureDevice owns its block until system completion, including
        // when the Rust receiver has already expired.
        NotesRecordingAccess *owner = self;
        const uint64_t requestID = self.requestID;
        const NotesRecordingDiagnostic diagnostic = self.diagnostic;
        [self diagnose:RecordingRequestIssued code:0 status:-1];
        [self requestSystemAccess:^(BOOL granted) {
            // Runs on the OS callback thread BEFORE dispatching the main work.
            // Immutable captured ID/function and the Boolean are the only inputs.
            recordingDiagnostic(diagnostic, requestID, RecordingOsCompletionEntry, 0, granted);
            dispatch_async(dispatch_get_main_queue(), ^{ [owner systemCompleted:granted]; });
        }];
    } @catch (NSException *exception) {
        (void)exception;
        [self diagnose:RecordingException code:6 status:-1];
        [self finish:6 status:-1];
        if (pendingRecordingAccess == self) {
            pendingRecordingAccess = nil;
            [self diagnose:RecordingPendingClear code:0 status:-1];
        }
    }
}
- (void)dealloc {
    if (_closeObserver) [NSNotificationCenter.defaultCenter removeObserver:_closeObserver];
    if (_context && _releaseContext) _releaseContext(_context);
}
@end

// Takes context ownership on every path. No Objective-C exception crosses FFI.
void notes_ui_recording_access_diagnostic(void *rawView, void *rawWindow, void *context,
                               NotesRecordingReply reply, NotesRecordingRelease releaseContext,
                               uint64_t requestID, NotesRecordingDiagnostic diagnostic) {
    NotesRecordingAccess *request = [NotesRecordingAccess new];
    request.context = context;
    request.reply = reply;
    request.releaseContext = releaseContext;
    request.requestID = requestID;
    request.diagnostic = diagnostic;
    [request diagnose:RecordingNativeEntry code:0 status:-1];
    @try {
        BOOL onMain = NSThread.isMainThread;
        [request diagnose:RecordingNativeMain code:0 status:onMain];
        if (!onMain) { [request finish:1 status:-1]; return; }
        WKWebView *view = (__bridge WKWebView *)rawView;
        NSWindow *window = (__bridge NSWindow *)rawWindow;
        if (![view isKindOfClass:WKWebView.class] || ![window isKindOfClass:NSWindow.class] ||
            !NSApp || view.window != window || ![NSApp.windows containsObject:window] ||
            !recordingWindowObserver || [closedRecordingWindows containsObject:window]) {
            [request diagnose:RecordingNativeWindow code:0 status:0];
            [request finish:2 status:-1]; return;
        }
        [request diagnose:RecordingNativeWindow code:0 status:1];
        __weak WKWebView *weakView = view;
        __weak NSWindow *weakWindow = window;
        __block BOOL closed = NO;
        request.windowValid = ^BOOL {
            WKWebView *currentView = weakView;
            NSWindow *currentWindow = weakWindow;
            return recordingWindowObserver && !closed && currentView && currentWindow && currentView.window == currentWindow &&
                ![closedRecordingWindows containsObject:currentWindow] &&
                [NSApp.windows containsObject:currentWindow];
        };
        __weak NotesRecordingAccess *weakRequest = request;
        request.closeObserver = [NSNotificationCenter.defaultCenter
            addObserverForName:NSWindowWillCloseNotification object:window queue:NSOperationQueue.mainQueue
            usingBlock:^(NSNotification *notification) {
                (void)notification;
                closed = YES;
                [weakRequest diagnose:RecordingWindowClose code:2 status:-1];
                [weakRequest finish:2 status:-1];
            }];
        [request start];
    } @catch (NSException *exception) {
        (void)exception;
        [request diagnose:RecordingException code:6 status:-1];
        [request finish:6 status:-1];
    }
}

// Preserve the existing C boundary for sealed fake-OS regression harnesses.
void notes_ui_recording_access(void *rawView, void *rawWindow, void *context,
                               NotesRecordingReply reply, NotesRecordingRelease releaseContext) {
    notes_ui_recording_access_diagnostic(rawView, rawWindow, context, reply, releaseContext, 0, NULL);
}
