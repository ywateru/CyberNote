// No NSApplication is created. Only the production NSApp lookup is substituted
// with a Foundation-only host, including its cached delegate-selector behavior.
#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
static id syntheticApplication;
#define NSApp ((NSApplication *)syntheticApplication)
#import "/private/tmp/apple-notes-mac-recording-quit6869-independent-01/plugins/tauri-plugin-notes-ui/macos/termination.m"
#undef NSApp

static int delegateDestructions;
@interface TaoAppDelegateParent : NSResponder
- (int)retainedTaoMethod;
@end
@implementation TaoAppDelegateParent
- (int)retainedTaoMethod { return 69; }
- (void)dealloc { delegateDestructions++; }
@end
@interface ForeignDelegate69 : NSResponder @end
@implementation ForeignDelegate69 @end
@interface TerminationHost69 : NSObject {
    __weak id _delegate;
}
@property(nonatomic, weak) id delegate;
@property(nonatomic) int reads;
@property(nonatomic) int writes;
@property(nonatomic) int throwWrite;
@property(nonatomic) BOOL cachedShouldTerminate;
@property(nonatomic, copy) void (^betweenWrites)(void);
- (NSApplicationTerminateReply)ordinaryQuit;
@end
@implementation TerminationHost69
@synthesize delegate = _delegate;
- (id)delegate { _reads++; return _delegate; }
- (void)setDelegate:(id)value {
    _writes++;
    if (_writes == _throwWrite) [NSException raise:@"synthetic-setter" format:@"setter failure"];
    _delegate = value;
    _cachedShouldTerminate = [value respondsToSelector:@selector(applicationShouldTerminate:)];
    if (!value && _betweenWrites) _betweenWrites();
}
- (NSApplicationTerminateReply)ordinaryQuit {
    if (!_cachedShouldTerminate) return NSTerminateNow;
    return [(id<NSApplicationDelegate>)self.delegate applicationShouldTerminate:(NSApplication *)self];
}
@end
typedef struct {
    int references, releases, requests;
    int failure;
    BOOL throwing, nested, dropDuringRequest;
} Context69;
static int request69(void *raw) {
    Context69 *c = raw; assert(pthread_main_np()); assert(c->references > 0); c->requests++;
    if (c->throwing) [NSException raise:@"synthetic-request" format:@"callback failure"];
    if (c->nested) assert([(TerminationHost69 *)syntheticApplication ordinaryQuit] == NSTerminateCancel);
    if (c->dropDuringRequest) assert(notes_ui_termination_drop() == 0);
    return c->failure;
}
static void release69(void *raw) {
    Context69 *c = raw; assert(c->references > 0); c->references--; c->releases++;
}
static NSApplicationTerminateReply unknown69(id object, SEL selector, id app) {
    (void)object; (void)selector; (void)app; return NSTerminateNow;
}
static TerminationHost69 *host69(id delegate) {
    TerminationHost69 *host = [TerminationHost69 new]; host.delegate = delegate;
    syntheticApplication = host; return host;
}
static void released69(Context69 *c) { assert(c->references == 0 && c->releases > 0); }
static void *worker69(void *raw) {
    Context69 *c = raw;
    assert(notes_ui_termination_install(c, request69, release69) == 1);
    assert(notes_ui_termination_ready() == 1);
    assert(notes_ui_termination_drop() == 1);
    return NULL;
}
int main(int argc, char **argv) {
    assert(argc == 2); const char *name = argv[1];
    @autoreleasepool {
        Context69 c = {.references=1};
        __strong TaoAppDelegateParent *delegate = [TaoAppDelegateParent new];
        TerminationHost69 *host = host69(delegate);
        IMP previous = method_getImplementation(class_getInstanceMethod(TaoAppDelegateParent.class, @selector(retainedTaoMethod)));
        if (!strcmp(name,"missing-release")) {
            assert(notes_ui_termination_install(&c, request69, NULL) == 8);
            assert(c.references == 1 && c.releases == 0 && c.requests == 0);
            assert(![delegate respondsToSelector:@selector(applicationShouldTerminate:)]);
            release69(&c); released69(&c);
        } else if (!strcmp(name,"owned-wrong-signature")) {
            terminationClass = TaoAppDelegateParent.class;
            assert(class_addMethod(TaoAppDelegateParent.class, @selector(applicationShouldTerminate:), (IMP)notesShouldTerminate, "B@:@"));
            assert(notes_ui_termination_install(&c, request69, release69) == 4); released69(&c);
            Method method = class_getInstanceMethod(TaoAppDelegateParent.class, @selector(applicationShouldTerminate:));
            assert(method_getImplementation(method) == (IMP)notesShouldTerminate);
            assert(!strcmp(method_getTypeEncoding(method), "B@:@"));
        } else if (!strcmp(name,"inherited-unknown-method")) {
            assert(class_addMethod(NSResponder.class, @selector(applicationShouldTerminate:), (IMP)unknown69, terminationSignature()));
            assert(notes_ui_termination_install(&c, request69, release69) == 4); released69(&c);
            assert(method_getImplementation(class_getInstanceMethod(TaoAppDelegateParent.class, @selector(applicationShouldTerminate:))) == (IMP)unknown69);
        } else if (!strcmp(name,"first-refresh-exception")) {
            host.throwWrite = 2;
            assert(notes_ui_termination_install(&c, request69, release69) == 5); released69(&c);
            assert(host.delegate == delegate && notes_ui_termination_ready() == 6 && c.requests == 0);
            c.references = 1;
            assert(notes_ui_termination_install(&c, request69, release69) == 0);
            assert([host ordinaryQuit] == NSTerminateCancel && c.requests == 1);
            assert(notes_ui_termination_drop() == 0); released69(&c);
        } else if (!strcmp(name,"missing-app")) {
            syntheticApplication = nil;
            assert(notes_ui_termination_install(&c, request69, release69) == 2); released69(&c);
        } else if (!strcmp(name,"missing-delegate")) {
            host.delegate = nil;
            assert(notes_ui_termination_install(&c, request69, release69) == 2); released69(&c);
        } else if (!strcmp(name,"unknown-class")) {
            ForeignDelegate69 *foreign = [ForeignDelegate69 new]; host.delegate = foreign;
            assert(notes_ui_termination_install(&c, request69, release69) == 3); released69(&c);
            assert(![foreign respondsToSelector:@selector(applicationShouldTerminate:)]);
        } else if (!strcmp(name,"unknown-method") || !strcmp(name,"unknown-signature")) {
            const char *signature = !strcmp(name,"unknown-signature") ? "B@:@" : terminationSignature();
            assert(class_addMethod(TaoAppDelegateParent.class, @selector(applicationShouldTerminate:), (IMP)unknown69, signature));
            assert(notes_ui_termination_install(&c, request69, release69) == 4); released69(&c);
            Method method = class_getInstanceMethod(TaoAppDelegateParent.class, @selector(applicationShouldTerminate:));
            assert(method_getImplementation(method) == (IMP)unknown69 && !strcmp(method_getTypeEncoding(method),signature));
        } else if (!strcmp(name,"worker-thread")) {
            int reads=host.reads, writes=host.writes; pthread_t thread;
            assert(pthread_create(&thread,NULL,worker69,&c) == 0); assert(pthread_join(thread,NULL) == 0);
            assert(host.reads == reads && host.writes == writes); released69(&c);
        } else if (!strcmp(name,"missing-callback")) {
            assert(notes_ui_termination_install(&c,NULL,release69) == 8); released69(&c);
        } else if (!strcmp(name,"refresh-exception")) {
            host.throwWrite=3; // initial delegate setter was write 1; nil 2; restore 3 throws.
            assert(notes_ui_termination_install(&c,request69,release69) == 5); released69(&c);
            assert(host.delegate == delegate && notes_ui_termination_ready() == 6);
            Context69 retry={.references=1};
            assert(notes_ui_termination_install(&retry,request69,release69) == 0);
            assert([host ordinaryQuit] == NSTerminateCancel && retry.requests == 1);
            assert(notes_ui_termination_drop() == 0); released69(&retry);
        } else {
            assert(!host.cachedShouldTerminate && [host ordinaryQuit] == NSTerminateNow);
            __weak id lifetime = delegate;
            // Remove the test's strong owner during the nil interval. The
            // production install local MUST keep this same object alive.
            __block id owner = delegate; delegate = nil;
            host.betweenWrites = ^{ assert(owner == lifetime); owner = nil; assert(lifetime != nil); };
            assert(notes_ui_termination_install(&c,request69,release69) == 0);
            delegate = lifetime; host.betweenWrites = nil;
            assert(delegate != nil && delegateDestructions == 0 && host.delegate == delegate);
            assert(host.writes == 3 && host.cachedShouldTerminate && notes_ui_termination_ready() == 0);
            assert([delegate retainedTaoMethod] == 69 && method_getImplementation(class_getInstanceMethod(TaoAppDelegateParent.class,@selector(retainedTaoMethod))) == previous);
            if (!strcmp(name,"exact-repeat")) {
                c.references++;
                assert(notes_ui_termination_install(&c,request69,release69) == 0);
                assert(c.references == 1 && c.releases == 1 && host.writes == 3);
            } else if (!strcmp(name,"conflicting-context")) {
                Context69 other={.references=1};
                assert(notes_ui_termination_install(&other,request69,release69) == 7); released69(&other);
                assert(notes_ui_termination_ready() == 0);
            } else if (!strcmp(name,"changed-delegate")) {
                TaoAppDelegateParent *replacement = [TaoAppDelegateParent new]; host.delegate=replacement;
                assert(notes_ui_termination_ready() == 7);
                assert([host ordinaryQuit] == NSTerminateCancel && c.requests == 0);
                assert(notes_ui_termination_drop() == 0); released69(&c);
                goto complete;
            } else if (!strcmp(name,"changed-implementation")) {
                Method method=class_getInstanceMethod(TaoAppDelegateParent.class,@selector(applicationShouldTerminate:));
                IMP owned=method_setImplementation(method,(IMP)unknown69);
                assert(notes_ui_termination_ready() == 7);
                assert(((NSApplicationTerminateReply(*)(id,SEL,id))owned)(delegate,@selector(applicationShouldTerminate:),host) == NSTerminateCancel && c.requests == 0);
                c.references++;
                assert(notes_ui_termination_install(&c,request69,release69) == 4 && c.references == 1);
                assert(method_getImplementation(method) == (IMP)unknown69);
                assert(notes_ui_termination_drop() == 0); released69(&c);
                goto complete;
            } else if (!strcmp(name,"callback-exception")) c.throwing=YES;
            else if (!strcmp(name,"callback-error")) c.failure=1;
            else if (!strcmp(name,"nested-request")) c.nested=YES;
            else if (!strcmp(name,"drop-during-callback")) c.dropDuringRequest=YES;
            else assert(!strcmp(name,"install-route") || !strcmp(name,"repeated-quit") || !strcmp(name,"drop-and-reinstall"));
            assert([host ordinaryQuit] == NSTerminateCancel && c.requests == 1);
            if (!strcmp(name,"repeated-quit")) assert([host ordinaryQuit] == NSTerminateCancel && c.requests == 2);
            assert(notes_ui_termination_drop() == 0); released69(&c);
            assert(notes_ui_termination_ready() == 6 && [host ordinaryQuit] == NSTerminateCancel);
            if (!strcmp(name,"drop-and-reinstall")) {
                Context69 retry={.references=1};
                assert(notes_ui_termination_install(&retry,request69,release69) == 0);
                assert([host ordinaryQuit] == NSTerminateCancel && retry.requests == 1);
                assert(notes_ui_termination_drop() == 0); released69(&retry);
            }
        }
complete:
        syntheticApplication=nil;
        printf("{\"case\":\"%s\",\"status\":\"PASS\",\"realNSApplication\":false,\"realTerminate\":false}\n",name);
    }
    return 0;
}
