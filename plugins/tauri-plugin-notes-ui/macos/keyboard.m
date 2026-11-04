#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

// Separate from toolbar controllers: hiding/unbinding a toolbar cannot disable this policy.
@class NotesUIKeyboardPolicy;
static NSMutableDictionary<NSString *, NotesUIKeyboardPolicy *> *keyboardPolicies;

@interface NotesUIKeyboardPolicy : NSObject
@property(nonatomic, weak) WKWebView *webview;
@property(nonatomic, weak) NSWindow *window;
@property(nonatomic, copy) NSString *webviewLabel;
@property(nonatomic, copy) NSString *windowLabel;
@property(nonatomic, strong) id monitor;
@property(nonatomic, strong) NSMutableArray *observers;
@property(nonatomic) BOOL disposed;
- (int)refresh;
- (NSEvent *)navigationEvent:(NSEvent *)event;
- (void)dispose;
@end

@implementation NotesUIKeyboardPolicy
- (int)refresh {
    if (!NSThread.isMainThread) return 1;
    WKWebView *view = self.webview;
    NSWindow *window = self.window;
    if (self.disposed || !view || !window || view.window != window || !NSApp) return 2;
    @try {
        // Read each time. AppKit explicitly does not provide KVO changes for this property.
        view.configuration.preferences.tabFocusesLinks = NSApp.isFullKeyboardAccessEnabled;
        return 0;
    } @catch (NSException *exception) {
        (void)exception;
        return 5;
    }
}
- (void)refreshFromNotification {
    if ([self refresh] != 0) NSLog(@"notes-ui: keyboard policy refresh failed");
}
- (NSEvent *)navigationEvent:(NSEvent *)event {
    if (!self.disposed && self.window && event.window == self.window &&
        event.type == NSEventTypeKeyDown && event.keyCode == 48) {
        [self refreshFromNotification];
    }
    // Preserve event identity, modifiers and native WebKit handling, including Option.
    return event;
}
- (void)dispose {
    if (self.disposed) return;
    self.disposed = YES;
    if (self.monitor) [NSEvent removeMonitor:self.monitor];
    self.monitor = nil;
    for (id observer in self.observers) [NSNotificationCenter.defaultCenter removeObserver:observer];
    [self.observers removeAllObjects];
    self.webview = nil;
    self.window = nil;
}
- (void)dealloc { [self dispose]; }
@end

// Statuses are shared with Rust keyboard_status; no Objective-C exception crosses the ABI.
int notes_ui_keyboard_attach(void *rawView, void *rawWindow,
                             const char *rawViewLabel, const char *rawWindowLabel) {
    if (!NSThread.isMainThread) return 1;
    NotesUIKeyboardPolicy *policy = nil;
    @try {
        WKWebView *view = (__bridge WKWebView *)rawView;
        NSWindow *window = (__bridge NSWindow *)rawWindow;
        NSString *viewLabel = rawViewLabel ? [NSString stringWithUTF8String:rawViewLabel] : nil;
        NSString *windowLabel = rawWindowLabel ? [NSString stringWithUTF8String:rawWindowLabel] : nil;
        if (![view isKindOfClass:WKWebView.class] || ![window isKindOfClass:NSWindow.class] ||
            view.window != window || !viewLabel.length || !windowLabel.length || !NSApp) return 2;
        if (!keyboardPolicies) keyboardPolicies = [NSMutableDictionary dictionary];
        NotesUIKeyboardPolicy *existing = keyboardPolicies[viewLabel];
        if (existing) {
            if (existing.webview != view || existing.window != window ||
                ![existing.windowLabel isEqual:windowLabel]) return 3;
            return [existing refresh];
        }
        policy = [NotesUIKeyboardPolicy new];
        policy.webview = view;
        policy.window = window;
        policy.webviewLabel = viewLabel;
        policy.windowLabel = windowLabel;
        policy.observers = [NSMutableArray array];
        int status = [policy refresh];
        if (status != 0) { [policy dispose]; return status; }
        __weak NotesUIKeyboardPolicy *weakPolicy = policy;
        policy.monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
            handler:^NSEvent *(NSEvent *event) {
                NotesUIKeyboardPolicy *owner = weakPolicy;
                return owner ? [owner navigationEvent:event] : event;
            }];
        if (!policy.monitor) { [policy dispose]; return 4; }
        NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
        [policy.observers addObject:[center addObserverForName:NSWindowDidBecomeKeyNotification
            object:window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
                (void)notification;
                [weakPolicy refreshFromNotification];
            }]];
        [policy.observers addObject:[center addObserverForName:NSApplicationDidBecomeActiveNotification
            object:NSApp queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
                (void)notification;
                NotesUIKeyboardPolicy *owner = weakPolicy;
                if (owner.window.isKeyWindow) [owner refreshFromNotification];
            }]];
        [policy.observers addObject:[center addObserverForName:NSWindowWillCloseNotification
            object:window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
                (void)notification;
                NotesUIKeyboardPolicy *owner = weakPolicy;
                if (owner) {
                    [owner dispose];
                    if (keyboardPolicies[owner.webviewLabel] == owner)
                        [keyboardPolicies removeObjectForKey:owner.webviewLabel];
                }
            }]];
        keyboardPolicies[viewLabel] = policy;
        return 0;
    } @catch (NSException *exception) {
        (void)exception;
        [policy dispose];
        return 5;
    }
}

int notes_ui_keyboard_destroy(const char *rawWindowLabel) {
    if (!NSThread.isMainThread) return 1;
    @try {
        NSString *label = rawWindowLabel ? [NSString stringWithUTF8String:rawWindowLabel] : nil;
        if (rawWindowLabel && !label.length) return 2;
        for (NSString *key in keyboardPolicies.allKeys) {
            NotesUIKeyboardPolicy *policy = keyboardPolicies[key];
            if (!label || [policy.windowLabel isEqual:label]) {
                [policy dispose];
                [keyboardPolicies removeObjectForKey:key];
            }
        }
        return 0;
    } @catch (NSException *exception) {
        (void)exception;
        return 5;
    }
}
