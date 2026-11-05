#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

@interface Probe : NSObject <WKNavigationDelegate, WKScriptMessageHandler>
@property(nonatomic,strong) WKWebView *web;
@property(nonatomic,strong) NSWindow *ownWindow;
@property(nonatomic,assign) BOOL finished;
@property(nonatomic,assign) BOOL failed;
@end
@implementation Probe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
  if (self.finished) return;
  if ([message.body isKindOfClass:NSDictionary.class] && message.body[@"progress"]) {
    fprintf(stderr,"TRACE %s\n",[message.body[@"progress"] description].UTF8String);return;
  }
  self.finished=YES;
  self.failed=![message.body[@"status"] isEqual:@"PASS"];
  NSData *data=[NSJSONSerialization dataWithJSONObject:message.body options:0 error:nil];
  fwrite(data.bytes,1,data.length,stdout);fputc('\n',stdout);fflush(stdout);
}
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {
  [web evaluateJavaScript:@"void window.runProbe()" completionHandler:^(id result,NSError *error) {
    if (error) {fprintf(stderr,"JS failure: %s\n",error.description.UTF8String);self.failed=YES;self.finished=YES;}
  }];
}
- (void)webView:(WKWebView *)web didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  fprintf(stderr,"Navigation failure: %s\n",error.description.UTF8String);self.failed=YES;self.finished=YES;
}
@end
int main(int argc,const char **argv) {
 @autoreleasepool {
  if(argc!=3)return 2;
  NSApplication *app=[NSApplication sharedApplication];
  [app setActivationPolicy:NSApplicationActivationPolicyProhibited];
  Probe *probe=[Probe new];
  WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];
  [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
  configuration.websiteDataStore=[WKWebsiteDataStore nonPersistentDataStore];
  probe.web=[[WKWebView alloc]initWithFrame:NSMakeRect(0,0,640,300) configuration:configuration];
  probe.web.navigationDelegate=probe;
  probe.ownWindow=[[NSWindow alloc]initWithContentRect:NSMakeRect(-20000,-20000,640,300) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
  probe.ownWindow.releasedWhenClosed=NO;
  probe.ownWindow.contentView=probe.web;
  [probe.ownWindow makeFirstResponder:probe.web];
  fprintf(stderr,"Own host visible=%d key=%d main=%d undoManager=%d\n",probe.ownWindow.visible,probe.ownWindow.keyWindow,probe.ownWindow.mainWindow,probe.web.undoManager!=nil);
  NSURL *url=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
  NSURLComponents *components=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
  components.queryItems=@[[NSURLQueryItem queryItemWithName:@"scenario" value:[NSString stringWithUTF8String:argv[2]]]];
  [probe.web loadFileURL:components.URL allowingReadAccessToURL:[url URLByDeletingLastPathComponent]];
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:25];
  while(!probe.finished&&deadline.timeIntervalSinceNow>0)
    [[NSRunLoop mainRunLoop]runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
  [probe.web stopLoading];
  [configuration.userContentController removeScriptMessageHandlerForName:@"result"];
  if(!probe.finished){fprintf(stderr,"Own WK deadline25s reached\n");return 3;}
  return probe.failed ? 4 : 0;
 }
}
