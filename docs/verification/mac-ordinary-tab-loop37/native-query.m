// Finite native mechanism probe: production C entry, real NSApplication/NSWindow/WKWebView.
// First uses the actual getter, then temporarily substitutes only that getter in this process.
// No visible/key windows, no system preference writes, no page/backend/user data.
#import "../../../plugins/tauri-plugin-notes-ui/macos/keyboard.m"
#import <objc/runtime.h>
#import <pthread.h>
static NSUInteger checks,reads;
static BOOL controlled;
static void check(BOOL ok,const char *name){if(!ok){fprintf(stderr,"FAIL %s\n",name);exit(1);}checks++;printf("PASS %s\n",name);}
static BOOL fakeGetter(id self,SEL cmd){(void)self;(void)cmd;reads++;return controlled;}
struct ThreadProbe{void *window;int result;int value;};
static void *wrongThread(void *raw){struct ThreadProbe *p=raw;@autoreleasepool{p->result=notes_ui_keyboard_navigation(p->window,&p->value);}return NULL;}
int main(void){@autoreleasepool{
 NSApplication *app=[NSApplication sharedApplication];
 NSWindow *window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,320,200) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
 window.releasedWhenClosed=NO;
 WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
 WKWebView *view=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,320,200) configuration:config];window.contentView=view;
 check(NSThread.isMainThread&&!window.visible&&!window.keyWindow,"main thread and real offscreen non-key window");
 check([app.windows containsObject:window],"real live window identity registered in NSApplication");
 BOOL actual=app.isFullKeyboardAccessEnabled;int value=-1;
 check(notes_ui_keyboard_navigation((__bridge void*)window,&value)==0&&value==(actual?1:0),"production query equals actual public system getter");
 printf("OBSERVED actual policy=%d\n",value);
 BOOL before=view.configuration.preferences.tabFocusesLinks;
 Method method=class_getInstanceMethod(NSApplication.class,@selector(isFullKeyboardAccessEnabled));IMP original=method_setImplementation(method,(IMP)fakeGetter);
 controlled=NO;NSUInteger n=reads;value=-1;check(notes_ui_keyboard_navigation((__bridge void*)window,&value)==0&&value==0&&reads==n+1,"controlled false read once at query");
 controlled=YES;n=reads;value=-1;check(notes_ui_keyboard_navigation((__bridge void*)window,&value)==0&&value==1&&reads==n+1,"controlled true freshly read at query");
 check(view.configuration.preferences.tabFocusesLinks==before&&keyboardPolicies.count==0,"query does not alter WK preference or install policy monitor");
 value=77;n=reads;check(notes_ui_keyboard_navigation(NULL,&value)==2&&value==77&&reads==n,"nil window rejected without getter or output write");
 check(notes_ui_keyboard_navigation((__bridge void*)[NSObject new],&value)==2&&value==77,"wrong native object rejected");
 check(notes_ui_keyboard_navigation((__bridge void*)window,NULL)==2,"null result pointer rejected");
 struct ThreadProbe p={(__bridge void*)window,-1,77};pthread_t thread;pthread_create(&thread,NULL,wrongThread,&p);pthread_join(thread,NULL);
 check(p.result==1&&p.value==77,"off-main query rejected without writing result");
 [window close];value=77;n=reads;
 check([closedKeyboardWindows containsObject:window],"real close notification records weak closed identity");
 check(notes_ui_keyboard_navigation((__bridge void*)window,&value)==2&&value==77&&reads==n,"closed native window rejected without read/write");
 method_setImplementation(method,original);
 check(!window.visible&&!window.keyWindow,"probe never made window visible or key");
 printf("PASS total=%lu\n",(unsigned long)checks);
}return 0;}
