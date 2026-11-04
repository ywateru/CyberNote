// Controlled boundary test. Real offscreen WKWebViews; fake NSApplication getter values.
// No system preference writes, visible windows, page loads or product/user data.
#import "../../../plugins/tauri-plugin-notes-ui/macos/keyboard.m"
#import <pthread.h>

@interface PolicyTestApplication : NSApplication
@property BOOL testKeyboardNavigation;
@property NSUInteger testReads;
@end
@implementation PolicyTestApplication
- (BOOL)isFullKeyboardAccessEnabled { self.testReads += 1; return self.testKeyboardNavigation; }
@end
@interface PolicyTestWindow : NSWindow
@property BOOL testKey;
@end
@implementation PolicyTestWindow
- (BOOL)isKeyWindow { return self.testKey; }
@end
// Offscreen WindowServer numbers are zero here. Explicit fake event ownership tests the
// production handler boundary; it does not prove AppKit monitor delivery or native focus.
@interface PolicyTestEvent : NSEvent
@property(nonatomic, weak) NSWindow *testWindow;
@property(nonatomic) NSEventType testType;
@property(nonatomic) unsigned short testCode;
@property(nonatomic) NSEventModifierFlags testFlags;
@end
@implementation PolicyTestEvent
- (NSWindow *)window { return self.testWindow; }
- (NSEventType)type { return self.testType; }
- (unsigned short)keyCode { return self.testCode; }
- (NSEventModifierFlags)modifierFlags { return self.testFlags; }
@end
static NSUInteger checks;
static void check(BOOL ok, NSString *name) {
    if (!ok) { fprintf(stderr, "FAIL %s\n", name.UTF8String); exit(1); }
    checks += 1;
    printf("PASS %s\n", name.UTF8String);
}
static PolicyTestWindow *windowWithView(WKWebView **out) {
    PolicyTestWindow *window = [[PolicyTestWindow alloc] initWithContentRect:NSMakeRect(0,0,320,200)
        styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
    WKWebView *view = [[WKWebView alloc] initWithFrame:NSMakeRect(0,0,320,200) configuration:configuration];
    window.contentView = view;
    *out = view;
    return window;
}
static NSEvent *keyEvent(NSWindow *window, NSEventType type, unsigned short code, NSEventModifierFlags flags) {
    PolicyTestEvent *event = [PolicyTestEvent new];
    event.testWindow = window;
    event.testType = type;
    event.testCode = code;
    event.testFlags = flags;
    return event;
}
static void *wrongThread(void *unused) {
    (void)unused;
    int *statuses = malloc(2*sizeof(int));
    statuses[0] = notes_ui_keyboard_attach(NULL,NULL,"none","none");
    statuses[1] = notes_ui_keyboard_destroy(NULL);
    return statuses;
}
int main(void) {
    @autoreleasepool {
        PolicyTestApplication *app = [PolicyTestApplication sharedApplication];
        WKWebView *view = nil, *otherView = nil;
        PolicyTestWindow *window = windowWithView(&view), *otherWindow = windowWithView(&otherView);
        check(!window.visible && !otherWindow.visible, @"real WK views remain offscreen");
        view.configuration.preferences.tabFocusesLinks = YES;
        app.testKeyboardNavigation = NO;
        NSUInteger reads = app.testReads;
        check(notes_ui_keyboard_attach((__bridge void *)view,(__bridge void *)window,"main-view","main") == 0,
            @"initial native attachment succeeds");
        check(!view.configuration.preferences.tabFocusesLinks && app.testReads == reads+1,
            @"initial false directly read into real WKPreferences");
        NotesUIKeyboardPolicy *policy = keyboardPolicies[@"main-view"];
        check(policy.monitor != nil && policy.observers.count == 3, @"one local monitor and three observers installed");
        id monitor = policy.monitor;
        reads = app.testReads;
        check(notes_ui_keyboard_attach((__bridge void *)view,(__bridge void *)window,"main-view","main") == 0 &&
            keyboardPolicies.count == 1 && policy.monitor == monitor && app.testReads == reads+1,
            @"duplicate same target refreshes without duplicate lifecycle");
        NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
        app.testKeyboardNavigation = YES;
        reads = app.testReads;
        [center postNotificationName:NSWindowDidBecomeKeyNotification object:otherWindow];
        check(app.testReads == reads, @"other window activation does not refresh this view");
        [center postNotificationName:NSWindowDidBecomeKeyNotification object:window];
        check(view.configuration.preferences.tabFocusesLinks && app.testReads == reads+1,
            @"own window activation directly rereads true");
        app.testKeyboardNavigation = NO;
        window.testKey = NO;
        reads = app.testReads;
        [center postNotificationName:NSApplicationDidBecomeActiveNotification object:app];
        check(app.testReads == reads, @"app activation ignores non-key owner");
        window.testKey = YES;
        [center postNotificationName:NSApplicationDidBecomeActiveNotification object:app];
        check(!view.configuration.preferences.tabFocusesLinks && app.testReads == reads+1,
            @"app activation directly rereads false for key owner");
        app.testKeyboardNavigation = YES;
        reads = app.testReads;
        NSEvent *tab = keyEvent(window,NSEventTypeKeyDown,48,0);
        NSEvent *returnedTab = [policy navigationEvent:tab];
        check(returnedTab == tab && view.configuration.preferences.tabFocusesLinks && app.testReads == reads+1,
            @"Tab boundary returns exact event and rereads true");
        app.testKeyboardNavigation = NO;
        reads = app.testReads;
        NSEvent *optionTab = keyEvent(window,NSEventTypeKeyDown,48,NSEventModifierFlagOption);
        check([policy navigationEvent:optionTab] == optionTab && !view.configuration.preferences.tabFocusesLinks &&
            app.testReads == reads+1 && (optionTab.modifierFlags & NSEventModifierFlagOption),
            @"Option event preserved with false policy; no manual inversion");
        app.testKeyboardNavigation = YES;
        reads = app.testReads;
        NSEvent *shiftTab = keyEvent(window,NSEventTypeKeyDown,48,NSEventModifierFlagShift);
        check([policy navigationEvent:shiftTab] == shiftTab && view.configuration.preferences.tabFocusesLinks && app.testReads == reads+1,
            @"Shift Tab uses same live policy and exact original event");
        reads = app.testReads;
        NSEvent *other = keyEvent(otherWindow,NSEventTypeKeyDown,48,0);
        NSEvent *letter = keyEvent(window,NSEventTypeKeyDown,0,0);
        NSEvent *up = keyEvent(window,NSEventTypeKeyUp,48,0);
        check([policy navigationEvent:other] == other && [policy navigationEvent:letter] == letter &&
            [policy navigationEvent:up] == up && app.testReads == reads,
            @"other-window Tab, non-Tab and key-up untouched without system read");
        check(notes_ui_keyboard_attach((__bridge void *)view,(__bridge void *)otherWindow,"bad","main") == 2,
            @"mismatched WK window rejected");
        check(notes_ui_keyboard_attach((__bridge void *)view,(__bridge void *)window,"","main") == 2,
            @"missing label rejected");
        check(notes_ui_keyboard_attach((__bridge void *)otherView,(__bridge void *)otherWindow,"main-view","other") == 3,
            @"same view identity cannot target another window");
        pthread_t thread;
        check(pthread_create(&thread,NULL,wrongThread,NULL) == 0, @"controlled background check starts");
        void *threadResult = NULL;
        check(pthread_join(thread,&threadResult) == 0, @"controlled background check completes");
        int *statuses = threadResult;
        check(statuses[0] == 1 && statuses[1] == 1, @"off-main attach and cleanup explicitly rejected");
        free(statuses);
        [center postNotificationName:NSWindowWillCloseNotification object:window];
        check(keyboardPolicies.count == 0 && policy.disposed && !policy.monitor && policy.observers.count == 0 &&
            !policy.webview && !policy.window, @"close releases lifecycle and removes registry entry");
        reads = app.testReads;
        [center postNotificationName:NSWindowDidBecomeKeyNotification object:window];
        [policy navigationEvent:tab];
        check(app.testReads == reads, @"disposed controller no longer refreshes");
        check(notes_ui_keyboard_destroy("main") == 0 && notes_ui_keyboard_destroy(NULL) == 0,
            @"close destroy and drop cleanup idempotent");
        __weak NotesUIKeyboardPolicy *releasedPolicy = policy;
        policy = nil;
        monitor = nil;
        check(releasedPolicy == nil, @"removed controller is not retained by monitor or observer blocks");
        check(notes_ui_keyboard_attach((__bridge void *)view,(__bridge void *)window,"main-view","main") == 0 &&
            notes_ui_keyboard_attach((__bridge void *)otherView,(__bridge void *)otherWindow,"note-view","note-1") == 0,
            @"independent window receives its own policy without toolbar bindings");
        NotesUIKeyboardPolicy *otherPolicy = keyboardPolicies[@"note-view"];
        check(notes_ui_keyboard_destroy("main") == 0 && keyboardPolicies.count == 1 &&
            keyboardPolicies[@"note-view"] == otherPolicy && !otherPolicy.disposed,
            @"destroy by owner label preserves independent window lifecycle");
        check(notes_ui_keyboard_destroy(NULL) == 0 && keyboardPolicies.count == 0 && otherPolicy.disposed &&
            !otherPolicy.monitor && otherPolicy.observers.count == 0,
            @"drop releases remaining lifecycle");
        check(!window.visible && !otherWindow.visible && view.URL == nil && otherView.URL == nil,
            @"no windows shown or pages loaded");
        printf("RESULT %lu controlled checks passed; fake system true/false and event ownership; no actual system setting changed\n",(unsigned long)checks);
    }
    return 0;
}
