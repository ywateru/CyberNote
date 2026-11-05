#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>

typedef void (*NotesRecordingReply)(void *, int, long);
typedef void (*NotesRecordingRelease)(void *);

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
- (AVAuthorizationStatus)authorizationStatus;
- (void)requestSystemAccess:(void (^)(BOOL))completion;
- (void)start;
- (void)finish:(int)code status:(long)status;
- (void)systemCompleted:(BOOL)granted;
- (void)scheduleTimeout;
@end

@implementation NotesRecordingAccess
- (AVAuthorizationStatus)authorizationStatus {
    return [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}
- (void)requestSystemAccess:(void (^)(BOOL))completion {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:completion];
}
- (void)finish:(int)code status:(long)status {
    if (self.delivered) return;
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
    @try {
        if (!self.delivered) {
            if (!self.windowValid || !self.windowValid()) {
                [self finish:2 status:-1];
            } else {
                AVAuthorizationStatus status = [self authorizationStatus];
                if (status == AVAuthorizationStatusAuthorized && granted) [self finish:0 status:status];
                else if (status == AVAuthorizationStatusDenied) [self finish:3 status:status];
                else if (status == AVAuthorizationStatusRestricted) [self finish:4 status:status];
                else [self finish:9 status:status];
            }
        }
    } @catch (NSException *exception) {
        (void)exception;
        [self finish:6 status:-1];
    }
    if (pendingRecordingAccess == self) pendingRecordingAccess = nil;
}
- (void)start {
    @try {
        if (!NSThread.isMainThread) { [self finish:1 status:-1]; return; }
        if (!self.windowValid || !self.windowValid()) { [self finish:2 status:-1]; return; }
        if (pendingRecordingAccess) { [self finish:8 status:-1]; return; }
        AVAuthorizationStatus status = [self authorizationStatus];
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
        [self requestSystemAccess:^(BOOL granted) {
            dispatch_async(dispatch_get_main_queue(), ^{ [owner systemCompleted:granted]; });
        }];
    } @catch (NSException *exception) {
        (void)exception;
        [self finish:6 status:-1];
        if (pendingRecordingAccess == self) pendingRecordingAccess = nil;
    }
}
- (void)dealloc {
    if (_closeObserver) [NSNotificationCenter.defaultCenter removeObserver:_closeObserver];
    if (_context && _releaseContext) _releaseContext(_context);
}
@end

// Takes context ownership on every path. No Objective-C exception crosses FFI.
void notes_ui_recording_access(void *rawView, void *rawWindow, void *context,
                               NotesRecordingReply reply, NotesRecordingRelease releaseContext) {
    NotesRecordingAccess *request = [NotesRecordingAccess new];
    request.context = context;
    request.reply = reply;
    request.releaseContext = releaseContext;
    @try {
        if (!NSThread.isMainThread) { [request finish:1 status:-1]; return; }
        WKWebView *view = (__bridge WKWebView *)rawView;
        NSWindow *window = (__bridge NSWindow *)rawWindow;
        if (![view isKindOfClass:WKWebView.class] || ![window isKindOfClass:NSWindow.class] ||
            !NSApp || view.window != window || ![NSApp.windows containsObject:window] ||
            !recordingWindowObserver || [closedRecordingWindows containsObject:window]) {
            [request finish:2 status:-1]; return;
        }
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
                [weakRequest finish:2 status:-1];
            }];
        [request start];
    } @catch (NSException *exception) {
        (void)exception;
        [request finish:6 status:-1];
    }
}
