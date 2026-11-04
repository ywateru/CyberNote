#import "../../../plugins/tauri-plugin-notes-ui/macos/keyboard.m"
int main(void) { @autoreleasepool {
    [NSApplication sharedApplication];
    __weak NotesUIKeyboardPolicy *weakA=nil,*weakB=nil;
    @autoreleasepool {
        NSWindow *wa=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,120,100) styleMask:0 backing:NSBackingStoreBuffered defer:NO];
        NSWindow *wb=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,120,100) styleMask:0 backing:NSBackingStoreBuffered defer:NO];
        WKWebViewConfiguration *c=[WKWebViewConfiguration new];c.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
        WKWebView *a=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,120,100) configuration:c];
        WKWebView *b=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,120,100) configuration:c];
        wa.contentView=a;wb.contentView=b;
        int sa=notes_ui_keyboard_attach((__bridge void *)a,(__bridge void *)wa,"a","a");
        int sb=notes_ui_keyboard_attach((__bridge void *)b,(__bridge void *)wb,"b","b");
        weakA=keyboardPolicies[@"a"];weakB=keyboardPolicies[@"b"];
        int da=notes_ui_keyboard_destroy("a"),db=notes_ui_keyboard_destroy("b");
        printf("attach=%d,%d destroy=%d,%d registry=%lu visible=%d,%d\n",sa,sb,da,db,(unsigned long)keyboardPolicies.count,wa.visible,wb.visible);
    }
    printf("afterPool A=%d B=%d\n",weakA!=nil,weakB!=nil);
    for(int i=0;i<3;i++) @autoreleasepool { [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.01]]; }
    printf("afterQueue A=%d B=%d\n",weakA!=nil,weakB!=nil);
    return weakA||weakB ? 1:0;
} }
