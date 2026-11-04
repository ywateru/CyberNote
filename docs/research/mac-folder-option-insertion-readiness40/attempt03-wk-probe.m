#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

@interface Probe : NSObject <WKNavigationDelegate, WKScriptMessageHandler>
@property(nonatomic,strong) WKWebView *web;
@property(nonatomic,assign) BOOL finished;
@property(nonatomic,assign) BOOL failed;
@end
@implementation Probe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
  if (self.finished) return;
  self.finished=YES;
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
  if(argc!=2)return 2;
  NSApplication *app=[NSApplication sharedApplication];
  [app setActivationPolicy:NSApplicationActivationPolicyProhibited];
  Probe *probe=[Probe new];
  WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];
  [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
  configuration.websiteDataStore=[WKWebsiteDataStore nonPersistentDataStore];
  probe.web=[[WKWebView alloc]initWithFrame:NSMakeRect(0,0,640,300) configuration:configuration];
  probe.web.navigationDelegate=probe;
  NSURL *url=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
  [probe.web loadFileURL:url allowingReadAccessToURL:[url URLByDeletingLastPathComponent]];
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:25];
  while(!probe.finished&&deadline.timeIntervalSinceNow>0)
    [[NSRunLoop mainRunLoop]runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
  [probe.web stopLoading];
  [configuration.userContentController removeScriptMessageHandlerForName:@"result"];
  if(!probe.finished){fprintf(stderr,"Own WK deadline25s reached\n");return 3;}
  return probe.failed ? 4 : 0;
 }
}
