#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <string.h>
#include <stdio.h>

typedef int (*NotesUITerminationRequest)(void *);
typedef void (*NotesUITerminationRelease)(void *);

// Every install call transfers one retained context reference, including on
// failure or exact repeat. Rust supplies Arc::into_raw / Arc::from_raw.
@interface NotesUITerminationContext : NSObject
@property(nonatomic) void *context;
@property(nonatomic) NotesUITerminationRequest request;
@property(nonatomic) NotesUITerminationRelease releaseContext;
@end
@implementation NotesUITerminationContext
- (void)dealloc {
    @try {
        if (_context && _releaseContext) _releaseContext(_context);
    } @catch (NSException *exception) {
        (void)exception;
        NSLog(@"notes-ui: native quit context release raised");
    }
}
@end

static NotesUITerminationContext *terminationContext;
static __weak id terminationApplication;
static __weak id terminationDelegate;
static Class terminationClass;
static BOOL deliveringTermination;

static NSApplicationTerminateReply notesShouldTerminate(id delegate, SEL selector,
                                                        NSApplication *application);

static const char *terminationSignature(void) {
    // The enum is NSUInteger, not BOOL. Derive its ABI from this SDK/target.
    static char signature[32];
    if (!signature[0]) snprintf(signature, sizeof(signature), "%s@:@", @encode(NSApplicationTerminateReply));
    return signature;
}

// Status: 1 thread, 2 app/delegate absent, 3 unknown class, 4 unknown method,
// 5 exception/refresh, 6 no owned context, 7 identity/ABI changed, 8 bad callback.
static int terminationReady(id application) {
    if (!NSThread.isMainThread) return 1;
    if (!application || ![application delegate]) return 2;
    id delegate = [application delegate];
    Class expected = objc_lookUpClass("TaoAppDelegateParent");
    if (!expected || object_getClass(delegate) != expected ||
        class_getSuperclass(expected) != NSResponder.class) return 3;
    if (!terminationContext) return 6;
    Method method = class_getInstanceMethod(expected, @selector(applicationShouldTerminate:));
    if (application != terminationApplication || delegate != terminationDelegate ||
        expected != terminationClass || !method ||
        method_getImplementation(method) != (IMP)notesShouldTerminate ||
        strcmp(method_getTypeEncoding(method), terminationSignature()) != 0) return 7;
    return 0;
}

static NSApplicationTerminateReply notesShouldTerminate(id delegate, SEL selector,
                                                        NSApplication *application) {
    (void)selector;
    // Always cancel AppKit termination. Tauri's accepted exit stops its event
    // loop; it does not call terminate: again. Never wait for JS here.
    @try {
        if (terminationReady(application) != 0 || delegate != terminationDelegate) {
            NSLog(@"notes-ui: native quit protection identity is invalid; termination cancelled");
            return NSTerminateCancel;
        }
        if (deliveringTermination) return NSTerminateCancel;
        NotesUITerminationContext *context = terminationContext;
        deliveringTermination = YES;
        @try {
            if (context.request(context.context) != 0)
                NSLog(@"notes-ui: native quit request failed; termination cancelled");
        } @finally {
            deliveringTermination = NO;
        }
    } @catch (NSException *exception) {
        (void)exception;
        NSLog(@"notes-ui: native quit callback raised; termination cancelled");
    }
    return NSTerminateCancel;
}

int notes_ui_termination_install(void *context, NotesUITerminationRequest request,
                                 NotesUITerminationRelease releaseContext) {
    // The release callback is required even when admission fails. A null release
    // is rejected without taking ownership, as there is no safe way to free it.
    if (!releaseContext) return 8;
    NotesUITerminationContext *incoming = nil;
    id application = nil;
    __strong id delegate = nil;
    BOOL refreshing = NO;
    @try {
        incoming = [NotesUITerminationContext new];
        incoming.context = context;
        incoming.request = request;
        incoming.releaseContext = releaseContext;
        if (!context || !request) return 8;
        if (!NSThread.isMainThread) return 1;
        application = NSApp; // Never create an NSApplication as a side effect.
        if (!application || !(delegate = [application delegate])) return 2;
        Class expected = objc_lookUpClass("TaoAppDelegateParent");
        if (!expected || object_getClass(delegate) != expected ||
            class_getSuperclass(expected) != NSResponder.class) return 3;
        Method method = class_getInstanceMethod(expected, @selector(applicationShouldTerminate:));
        if (method && (method_getImplementation(method) != (IMP)notesShouldTerminate ||
                       expected != terminationClass ||
                       strcmp(method_getTypeEncoding(method), terminationSignature()) != 0)) return 4;
        if (terminationContext) {
            int ready = terminationReady(application);
            if (ready != 0) return ready;
            // Exact repeat only: do not replace a live callback/app context.
            if (terminationContext.context != context || terminationContext.request != request ||
                terminationContext.releaseContext != releaseContext) return 7;
            return 0;
        }
        if (!method) {
            if (!class_addMethod(expected, @selector(applicationShouldTerminate:),
                                 (IMP)notesShouldTerminate, terminationSignature())) return 4;
            terminationClass = expected;
        }
        // AppKit may cache optional delegate selectors at setDelegate:. Retain
        // the SAME Tao object throughout the refresh; never substitute a proxy.
        refreshing = YES;
        [application setDelegate:nil];
        [application setDelegate:delegate];
        refreshing = NO;
        method = class_getInstanceMethod(expected, @selector(applicationShouldTerminate:));
        if ([application delegate] != delegate || object_getClass(delegate) != expected ||
            !method || method_getImplementation(method) != (IMP)notesShouldTerminate ||
            strcmp(method_getTypeEncoding(method), terminationSignature()) != 0) return 7;
        terminationApplication = application;
        terminationDelegate = delegate;
        terminationContext = incoming;
        int ready = terminationReady(application);
        if (ready != 0) {
            terminationContext = nil;
            terminationApplication = nil;
            terminationDelegate = nil;
        }
        return ready;
    } @catch (NSException *exception) {
        (void)exception;
        if (!incoming && context) releaseContext(context);
        if (terminationContext == incoming) {
            terminationContext = nil;
            terminationApplication = nil;
            terminationDelegate = nil;
        }
        if (refreshing && delegate) {
            @try { [application setDelegate:delegate]; }
            @catch (NSException *restoreException) { (void)restoreException; }
        }
        return 5;
    }
}

int notes_ui_termination_ready(void) {
    if (!NSThread.isMainThread) return 1;
    @try { return terminationReady(NSApp); }
    @catch (NSException *exception) { (void)exception; return 5; }
}

int notes_ui_termination_drop(void) {
    if (!NSThread.isMainThread) return 1;
    terminationContext = nil;
    terminationApplication = nil;
    terminationDelegate = nil;
    // ObjC methods cannot be removed. The installed method remains a strict
    // cancel after teardown, rather than resuming unsafe native termination.
    return 0;
}
