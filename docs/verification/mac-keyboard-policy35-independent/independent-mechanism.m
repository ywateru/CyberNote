#import "../../../plugins/tauri-plugin-notes-ui/macos/keyboard.m"
#import <objc/runtime.h>
#import <pthread.h>

// This program never activates/shows a window, loads a page, writes preferences,
// calls sendEvent:, or creates events via the WindowServer. Event ownership and
// notifications below are explicit controlled inputs, not actual input delivery.
@interface ReviewApplication : NSApplication
@property BOOL useFake;
@property BOOL fakeValue;
@property NSUInteger reads;
- (BOOL)realSystemValue;
@end
@implementation ReviewApplication
- (BOOL)isFullKeyboardAccessEnabled {
    self.reads += 1;
    return self.useFake ? self.fakeValue : [super isFullKeyboardAccessEnabled];
}
- (BOOL)realSystemValue { return [super isFullKeyboardAccessEnabled]; }
@end
@interface ReviewWindow : NSWindow
@property BOOL controlledKey;
@end
@implementation ReviewWindow
- (BOOL)isKeyWindow { return self.controlledKey; }
@end
@interface ReviewView : WKWebView
@property BOOL throwConfiguration;
@end
@implementation ReviewView
- (WKWebViewConfiguration *)configuration {
    if(self.throwConfiguration) @throw [NSException exceptionWithName:@"ControlledConfigurationFailure" reason:nil userInfo:nil];
    return [super configuration];
}
@end
@interface OwnedEvent : NSEvent
@property(weak) NSWindow *owner;
@property NSEventType ownedType;
@property unsigned short ownedCode;
@property NSEventModifierFlags ownedFlags;
@property NSUInteger modifierReads;
@end
@implementation OwnedEvent
- (NSWindow *)window { return self.owner; }
- (NSEventType)type { return self.ownedType; }
- (unsigned short)keyCode { return self.ownedCode; }
- (NSEventModifierFlags)modifierFlags { self.modifierReads += 1; return self.ownedFlags; }
@end
static NSUInteger count;
static void verify(BOOL value,NSString *name) {
    printf("%s %s\n",value?"PASS":"FAIL",name.UTF8String);
    if(!value) exit(1);
    count += 1;
}
static ReviewWindow *makePair(ReviewView **result) {
    ReviewWindow *w=[[ReviewWindow alloc] initWithContentRect:NSMakeRect(0,0,180,120)
        styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];
    configuration.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
    ReviewView *v=[[ReviewView alloc] initWithFrame:NSMakeRect(0,0,180,120) configuration:configuration];
    w.contentView=v;*result=v;return w;
}
static int attach(ReviewView *v,ReviewWindow *w,const char *vl,const char *wl) {
    return notes_ui_keyboard_attach((__bridge void *)v,(__bridge void *)w,vl,wl);
}
static OwnedEvent *event(NSWindow *owner,NSEventType type,unsigned short code,NSEventModifierFlags flags) {
    OwnedEvent *e=[OwnedEvent new];e.owner=owner;e.ownedType=type;e.ownedCode=code;e.ownedFlags=flags;return e;
}
static id denyMonitor(id cls,SEL selector,NSEventMask mask,NSEvent *(^handler)(NSEvent *)) {
    (void)cls;(void)selector;(void)mask;(void)handler;return nil;
}
static void *background(void *context) {
    int *status=context;status[0]=notes_ui_keyboard_attach(NULL,NULL,"background","background");
    status[1]=notes_ui_keyboard_destroy(NULL);return NULL;
}
int main(void) {
    @autoreleasepool {
        ReviewApplication *app=[ReviewApplication sharedApplication];
        __weak NotesUIKeyboardPolicy *releasedA=nil;
        __weak NotesUIKeyboardPolicy *releasedB=nil;
        @autoreleasepool {
        ReviewView *a=nil,*b=nil;ReviewWindow *wa=makePair(&a),*wb=makePair(&b);
        verify(NSThread.isMainThread && !app.active && !wa.visible && !wb.visible,@"main thread, inactive real offscreen pairs");
        BOOL realBefore=[app realSystemValue];NSUInteger reads=app.reads;
        a.configuration.preferences.tabFocusesLinks=!realBefore;
        verify(attach(a,wa,"review-A","window-A")==0 && app.reads==reads+1 && a.configuration.preferences.tabFocusesLinks==realBefore,@"actual system getter delegates to AppKit and changes real WK preference");
        NotesUIKeyboardPolicy *pa=keyboardPolicies[@"review-A"];
        a.configuration.preferences.tabFocusesLinks=!realBefore;reads=app.reads;
        verify([pa refresh]==0 && app.reads==reads+1 && a.configuration.preferences.tabFocusesLinks==[app realSystemValue],@"actual system getter reread rather than remembered WK value");
        BOOL realAfter=[app realSystemValue];
        printf("REAL_SYSTEM before=%d after=%d; read-only, not an actual toggle test\n",realBefore,realAfter);
        app.useFake=YES;app.fakeValue=NO;
        verify(attach(b,wb,"review-B","window-B")==0 && !b.configuration.preferences.tabFocusesLinks,@"second real WK receives controlled false independently");
        NotesUIKeyboardPolicy *pb=keyboardPolicies[@"review-B"];id originalMonitor=pa.monitor;
        verify(pa.monitor && pb.monitor && pa.monitor!=pb.monitor && pa.observers.count==3 && pb.observers.count==3,@"two independent real monitor registrations and observer sets");
        reads=app.reads;verify(attach(a,wa,"review-A","window-A")==0 && pa.monitor==originalMonitor && app.reads==reads+1 && keyboardPolicies.count==2,@"same identity rereads without another registration");
        app.fakeValue=YES;reads=app.reads;
        OwnedEvent *tab=event(wa,NSEventTypeKeyDown,48,NSEventModifierFlagShift|NSEventModifierFlagOption);
        verify([pa navigationEvent:tab]==tab && [pb navigationEvent:tab]==tab && app.reads==reads+1 && a.configuration.preferences.tabFocusesLinks && !b.configuration.preferences.tabFocusesLinks,@"owned Tab refreshes only its window and preserves exact identity");
        verify(tab.modifierReads==0 && tab.ownedFlags==(NSEventModifierFlagShift|NSEventModifierFlagOption),@"production does not inspect or invert modifiers");
        app.fakeValue=NO;reads=app.reads;
        verify([pa navigationEvent:tab]==tab && app.reads==reads+1 && !a.configuration.preferences.tabFocusesLinks,@"same-process controlled true-to-false reread on next owned Tab");
        OwnedEvent *letter=event(wa,NSEventTypeKeyDown,0,0),*up=event(wa,NSEventTypeKeyUp,48,0),*nilOwner=event(nil,NSEventTypeKeyDown,48,0);
        reads=app.reads;
        verify([pa navigationEvent:letter]==letter && [pa navigationEvent:up]==up && [pa navigationEvent:nilOwner]==nilOwner && app.reads==reads,@"non-Tab, keyUp and missing owner do not read provider");
        NSNotificationCenter *center=NSNotificationCenter.defaultCenter;
        app.fakeValue=YES;reads=app.reads;[center postNotificationName:NSWindowDidBecomeKeyNotification object:wb];
        verify(app.reads==reads+1 && b.configuration.preferences.tabFocusesLinks && !a.configuration.preferences.tabFocusesLinks,@"owned-window notification refreshes only B");
        wa.controlledKey=YES;wb.controlledKey=NO;app.fakeValue=NO;reads=app.reads;
        [center postNotificationName:NSApplicationDidBecomeActiveNotification object:app];
        verify(app.reads==reads+1 && !a.configuration.preferences.tabFocusesLinks && b.configuration.preferences.tabFocusesLinks,@"controlled app activation refreshes only controlled key window");
        verify(notes_ui_keyboard_attach(NULL,NULL,"empty","empty")==2,@"null native targets explicitly rejected");
        NSObject *wrong=[NSObject new];verify(notes_ui_keyboard_attach((__bridge void *)wrong,(__bridge void *)wa,"wrong","window-A")==2,@"wrong native view class rejected");
        verify(attach(a,wb,"mismatch","window-B")==2,@"real WK to wrong NSWindow rejected");
        verify(attach(a,wa,"review-A","other-label")==3 && attach(b,wb,"review-A","window-B")==3,@"duplicate identity cannot change window label or native target");
        const char invalidUtf8[]={(char)0xff,0};
        verify(attach(a,wa,invalidUtf8,"window-A")==2 && notes_ui_keyboard_destroy("")==2 && notes_ui_keyboard_destroy(invalidUtf8)==2,@"invalid labels fail without accepting cleanup-all");
        a.throwConfiguration=YES;reads=app.reads;
        verify([pa refresh]==5,@"native preference failure returned through status five");
        verify([pa navigationEvent:tab]==tab,@"refresh failure keeps original event identity");
        a.throwConfiguration=NO;
        int statuses[2]={0,0};pthread_t worker;int created=pthread_create(&worker,NULL,background,statuses);
        verify(created==0,@"background ownership check started");
        int joined=pthread_join(worker,NULL);
        verify(joined==0 && statuses[0]==1 && statuses[1]==1,@"off-main native attach and cleanup reject before target access");
        reads=app.reads;verify(notes_ui_keyboard_destroy("missing-window")==0 && keyboardPolicies.count==2 && app.reads==reads,@"unknown owner cleanup is harmless");
        [center postNotificationName:NSWindowWillCloseNotification object:wa];
        verify(keyboardPolicies.count==1 && pa.disposed && !pa.monitor && !pa.webview && !pa.window && pa.observers.count==0 && keyboardPolicies[@"review-B"]==pb && !pb.disposed,@"close notification disposes A while preserving B");
        reads=app.reads;[center postNotificationName:NSWindowDidBecomeKeyNotification object:wa];
        verify([pa navigationEvent:tab]==tab && app.reads==reads,@"disposed observer and navigation paths no longer read provider");
        verify(notes_ui_keyboard_destroy("window-B")==0 && pb.disposed && !pb.monitor && pb.observers.count==0 && keyboardPolicies.count==0,@"label cleanup disposes B");
        verify(notes_ui_keyboard_destroy(NULL)==0 && notes_ui_keyboard_destroy(NULL)==0,@"cleanup-all idempotent");
        releasedA=pa;releasedB=pb;pa=nil;pb=nil;originalMonitor=nil;
        printf("RELEASE_BOUNDARY before-pool-drain A=%d B=%d (temporary autorelease retention is not a leak conclusion)\n",releasedA!=nil,releasedB!=nil);
        Method monitorMethod=class_getClassMethod(NSEvent.class,@selector(addLocalMonitorForEventsMatchingMask:handler:));
        IMP original=method_setImplementation(monitorMethod,(IMP)denyMonitor);
        int monitorStatus=attach(a,wa,"monitor-denied","window-A");
        method_setImplementation(monitorMethod,original);
        verify(monitorStatus==4 && keyboardPolicies.count==0,@"controlled monitor registration failure returns four with no registry leak");
        a.throwConfiguration=YES;int exceptionStatus=attach(a,wa,"exception","window-A");a.throwConfiguration=NO;
        verify(exceptionStatus==5 && keyboardPolicies.count==0,@"initial refresh exception leaves no partial registration");
        verify(attach(a,wa,"reopen","window-A")==0 && notes_ui_keyboard_destroy(NULL)==0 && keyboardPolicies.count==0,@"fresh registration works after failures and cleanup");
        verify(!app.active && !wa.visible && !wb.visible && !a.URL && !b.URL,@"no activation, visible windows or page loads");
        }
        verify(!releasedA && !releasedB,@"controllers released after pool drain, no persistent block retain cycles");
        printf("RESULT %lu independent native checks; real getter first, controlled provider/events/notifications/errors afterwards; actual AppKit delivery and Option insertion remain untested\n",(unsigned long)count);
    }
    return 0;
}
