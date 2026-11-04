#import "../../../plugins/tauri-plugin-notes-ui/macos/keyboard.m"
#import <pthread.h>
@interface ReviewApplication : NSApplication
@property(nonatomic) BOOL throwGetter;
@property(nonatomic) NSUInteger reads;
@end
@implementation ReviewApplication
-(BOOL)isFullKeyboardAccessEnabled { self.reads++; if(self.throwGetter) @throw [NSException exceptionWithName:@"IndependentGetterFailure" reason:@"controlled process-only exception" userInfo:nil]; return [super isFullKeyboardAccessEnabled]; }
@end
static NSUInteger tests;
static void check(BOOL yes,const char *name){if(!yes){fprintf(stderr,"FAIL %s\n",name);exit(1);}tests++;printf("PASS %s\n",name);}
struct OffMain { int code; int output; };
static void *threadQuery(void *raw){struct OffMain *p=raw;@autoreleasepool{p->code=notes_ui_keyboard_navigation(NULL,&p->output);}return NULL;}
int main(void){@autoreleasepool{
 ReviewApplication *app=[ReviewApplication sharedApplication];
 NSWindow *a=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,120,100) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
 NSWindow *b=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,120,100) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];a.releasedWhenClosed=NO;b.releasedWhenClosed=NO;
 WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;WKWebView *view=[[WKWebView alloc]initWithFrame:NSMakeRect(0,0,120,100) configuration:config];a.contentView=view;
 BOOL actual=app.isFullKeyboardAccessEnabled;NSUInteger before=app.reads;int output=77;
 check(notes_ui_keyboard_navigation((__bridge void*)a,&output)==0&&output==(actual?1:0)&&app.reads==before+1,"fresh production query directly reads real public getter once");printf("REAL_SYSTEM enabled=%d (read-only, no actual toggle)\n",output);
 id token=keyboardCloseObserver;NSHashTable *table=closedKeyboardWindows;
 before=app.reads;output=77;check(notes_ui_keyboard_navigation((__bridge void*)b,&output)==0&&app.reads==before+1&&keyboardCloseObserver==token&&closedKeyboardWindows==table,"second owned window query rereads, single process observer/table reused");
 // Probe actual collection ownership with an ephemeral sentinel; AppKit may itself retain NSWindows.
 __weak NSObject *weakSentinel=nil;
 @autoreleasepool { NSObject *sentinel=[NSObject new];weakSentinel=sentinel;[table addObject:sentinel]; }
 check(weakSentinel==nil,"actual closed identity collection does not retain ephemeral object");
 BOOL wkBefore=view.configuration.preferences.tabFocusesLinks;app.throwGetter=YES;output=77;check(notes_ui_keyboard_navigation((__bridge void*)a,&output)==5&&output==77&&keyboardPolicies.count==0&&view.configuration.preferences.tabFocusesLinks==wkBefore,"controlled getter exception is explicit and leaves output/WK/monitor unchanged");app.throwGetter=NO;
 [NSNotificationCenter.defaultCenter postNotificationName:NSWindowWillCloseNotification object:a];before=app.reads;output=77;
 check([closedKeyboardWindows containsObject:a]&&notes_ui_keyboard_navigation((__bridge void*)a,&output)==2&&output==77&&app.reads==before,"recorded closed identity rejects query before getter/output write");
 output=77;check(notes_ui_keyboard_navigation((__bridge void*)b,&output)==0&&output==(actual?1:0),"closed A does not poison other real window B");
 check(notes_ui_keyboard_attach((__bridge void*)view,(__bridge void*)a,"independent37-view","independent37-owner")==0&&keyboardPolicies.count==1,"final correction preserves35 attach after synthetic close while query stays closed");
 output=77;check(notes_ui_keyboard_navigation((__bridge void*)a,&output)==2&&output==77,"reattach does not silently clear closed-query record");
 check(notes_ui_keyboard_destroy("independent37-owner")==0&&keyboardPolicies.count==0&&keyboardCloseObserver==token,"policy cleanup owns monitors only; close observer remains constant process lifetime");
 struct OffMain probe={-1,77};pthread_t thread;pthread_create(&thread,NULL,threadQuery,&probe);pthread_join(thread,NULL);check(probe.code==1&&probe.output==77,"off-main guard precedes nil target and does not write output");
 check(!a.visible&&!b.visible&&!a.keyWindow&&!b.keyWindow&&view.URL==nil,"no visible/key windows or pages, no data backend");
 [a close];[b close];printf("RESULT %lu independent native boundary checks\n",(unsigned long)tests);
}return 0;}
