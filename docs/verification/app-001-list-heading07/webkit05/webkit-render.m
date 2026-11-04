#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
@interface Render : NSObject <WKNavigationDelegate>
@property WKWebView *web;
@property NSString *prefix;
@property NSString *script;
@property BOOL done;
@property BOOL failed;
@property NSString *stage;
@end
@implementation Render
- (void)finish:(NSDictionary *)result {
 NSMutableDictionary *r=[result mutableCopy];r[@"windows"]=@(NSApp.windows.count);r[@"stage"]=self.stage?:@"unknown";
 NSMutableArray *windows=[NSMutableArray array];for(NSWindow *w in NSApp.windows)[windows addObject:@{@"class":NSStringFromClass(w.class),@"visible":@(w.visible),@"key":@(w.keyWindow),@"main":@(w.mainWindow),@"frame":NSStringFromRect(w.frame)}];
 r[@"windowDiagnostics"]=windows;r[@"appActive"]=@(NSApp.active);r[@"webViewAttachedToWindow"]=@(self.web.window!=nil);
 NSData *data=[NSJSONSerialization dataWithJSONObject:r options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];
 [data writeToFile:[self.prefix stringByAppendingString:@".json"] atomically:YES];self.done=YES;
}
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {
 (void)navigation;
 self.stage=@"navigation-finished-evaluating";
 [web callAsyncJavaScript:self.script arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id value,NSError *error){
  if(error){self.failed=YES;[self finish:@{@"status":@"metric-error",@"error":error.description}];return;}
  self.stage=@"metrics-received-snapshotting";
  WKSnapshotConfiguration *config=[WKSnapshotConfiguration new];config.afterScreenUpdates=NO;
  [web takeSnapshotWithConfiguration:config completionHandler:^(NSImage *image,NSError *snapshotError){
   NSMutableDictionary *result=[@{@"status":@"metrics-ok",@"metrics":value?:@{}} mutableCopy];
   if(snapshotError||!image){result[@"snapshotError"]=snapshotError.description?:@"nil image";}
   else {NSBitmapImageRep *rep=[NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];NSData *png=[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    BOOL saved=[png writeToFile:[self.prefix stringByAppendingString:@".png"] atomically:YES];result[@"snapshotSaved"]=@(saved);result[@"snapshotPixels"]=@[@(rep.pixelsWide),@(rep.pixelsHigh)];}
   [self finish:result];
  }];
 }];
}
- (void)webView:(WKWebView *)web didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
 (void)web;(void)navigation;self.failed=YES;[self finish:@{@"status":@"navigation-error",@"error":error.description}];
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)web {
 (void)web;self.stage=@"webcontent-terminated";self.failed=YES;[self finish:@{@"status":@"process-terminated"}];
}
@end
int main(int argc,const char **argv){@autoreleasepool{
 if(argc!=4)return 2;
 [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
 Render *render=[Render new];render.prefix=[NSString stringWithUTF8String:argv[2]];render.script=[NSString stringWithContentsOfFile:[NSString stringWithUTF8String:argv[3]] encoding:NSUTF8StringEncoding error:nil];
 WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
 render.web=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,1394,500) configuration:config];render.web.navigationDelegate=render;
 NSString *html=[NSString stringWithContentsOfFile:[NSString stringWithUTF8String:argv[1]] encoding:NSUTF8StringEncoding error:nil];
 render.stage=@"load-html-requested";[render.web loadHTMLString:html baseURL:nil];NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:15];
 while(!render.done&&deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.05]];
 if(!render.done){render.failed=YES;[render finish:@{@"status":@"timeout",@"error":@"Offscreen WKWebView did not complete within 15s"}];}
 return render.failed?1:0;
}}
