// Host-only WKWebView. No Tauri/custom protocol/script-message/JS interfaces.
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <stdint.h>
extern void notes_auth_event(const char *instance, int kind, const char *url);

static BOOL hosted(NSURL *url) {
  return [url.scheme.lowercaseString isEqualToString:@"https"] &&
    [url.host.lowercaseString isEqualToString:@"auth.x.aixgg.com"] &&
    (!url.port || url.port.integerValue == 443) && !url.user && !url.password;
}
static BOOL callback(NSURL *url) {
  return [url.scheme isEqualToString:@"http"] && [url.host isEqualToString:@"127.0.0.1"] &&
    url.port.integerValue == 17897 && [url.path isEqualToString:@"/callback"] &&
    url.query.length > 0 && !url.fragment && !url.user && !url.password;
}
@interface NotesLogin : NSObject <NSWindowDelegate, WKNavigationDelegate, WKUIDelegate>
@property(nonatomic, strong) NSString *instance;
@property(nonatomic, strong) NSURL *initialURL;
@property(nonatomic) uint64_t generation;
@property(nonatomic) BOOL active;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *web;
@end
static NSMutableDictionary<NSString *, NotesLogin *> *entries;
static uint64_t retiredGeneration;
static uint64_t latestGeneration;
static void emit(NotesLogin *entry, int kind) {
  if (entry.active) notes_auth_event(entry.instance.UTF8String, kind, NULL);
}
static void dispose(NotesLogin *entry, BOOL user) {
  BOOL notify = entry.active && user;
  entry.initialURL = nil;
  entry.active = NO; // Disarm before close/delegate callbacks.
  retiredGeneration = MAX(retiredGeneration, entry.generation);
  [entries removeObjectForKey:entry.instance];
  entry.web.navigationDelegate = nil;
  entry.web.UIDelegate = nil;
  [entry.web stopLoading];
  [entry.web removeFromSuperview];
  entry.web = nil;
  entry.window.delegate = nil;
  [entry.window close];
  entry.window = nil;
  if (notify) notes_auth_event(entry.instance.UTF8String, 1, NULL);
}
@implementation NotesLogin
- (void)windowWillClose:(NSNotification *)notification { dispose(self, YES); }
- (void)cancel:(id)sender { dispose(self, YES); }
- (void)continueInBrowser:(id)sender { emit(self, 2); }
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decision {
  // No target=_blank, arbitrary schemes, file/local app documents or federation.
  BOOL allowed = self.active && action.targetFrame &&
    (hosted(action.request.URL) || (action.targetFrame.isMainFrame && callback(action.request.URL)));
  if (action.shouldPerformDownload) allowed = NO;
  decision(allowed ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))decision {
  BOOL allowed = self.active && response.canShowMIMEType &&
    (hosted(response.response.URL) || callback(response.response.URL));
  decision(allowed ? WKNavigationResponsePolicyAllow : WKNavigationResponsePolicyCancel);
}
- (WKWebView *)webView:(WKWebView *)web createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features { return nil; }
- (void)webView:(WKWebView *)web runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSArray<NSURL *> *))completion { completion(nil); }
- (void)webView:(WKWebView *)web requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin initiatedByFrame:(WKFrameInfo *)frame type:(WKMediaCaptureType)type decisionHandler:(void (^)(WKPermissionDecision))decision { decision(WKPermissionDecisionDeny); }
- (void)webView:(WKWebView *)web didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  if (error.code != NSURLErrorCancelled) emit(self, 4);
}
- (void)webView:(WKWebView *)web didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  if (error.code != NSURLErrorCancelled) emit(self, 4);
}
- (void)webView:(WKWebView *)web didReceiveAuthenticationChallenge:(NSURLAuthenticationChallenge *)challenge completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *))completion {
  // System TLS validation only; never offer client certificates or HTTP credentials.
  completion([challenge.protectionSpace.authenticationMethod isEqualToString:NSURLAuthenticationMethodServerTrust] ? NSURLSessionAuthChallengePerformDefaultHandling : NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
}
- (void)webView:(WKWebView *)web authenticationChallenge:(NSURLAuthenticationChallenge *)challenge shouldAllowDeprecatedTLS:(void (^)(BOOL))decision { decision(NO); }
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)web { emit(self, 4); }
@end

int notes_auth_open(const char *rawInstance, uint64_t generation, const char *rawURL) {
  if (![NSThread isMainThread] || !rawInstance || !rawURL || generation <= retiredGeneration || generation <= latestGeneration) return 1;
  NSString *instance = [NSString stringWithUTF8String:rawInstance];
  NSURL *url = [NSURL URLWithString:[NSString stringWithUTF8String:rawURL]];
  if (![instance hasPrefix:@"account-auth-"] || !hosted(url) || ![url.path isEqualToString:@"/oidc/auth"] || url.fragment) return 1;
  if (!entries) entries = [NSMutableDictionary dictionary];
  // A newer owner supersedes only older presentation instances. This also
  // handles close being queued after the next open; a late old open/close can
  // neither block nor remove the newer window.
  for (NotesLogin *old in entries.allValues.copy) dispose(old, NO);
  latestGeneration = generation;
  NotesLogin *entry = [NotesLogin new];
  entry.instance = instance; entry.generation = generation; entry.active = YES; entry.initialURL = url;
  entries[instance] = entry;
  // The rule list contains fixed public origins only, never an authorization URL.
  // Additional fixed resource rules, not a claim of a whole-WebView network
  // firewall. The product origin boundary is native open + main navigation.
  NSString *rules = @"[{\"trigger\":{\"url-filter\":\".*\"},\"action\":{\"type\":\"block\"}},{\"trigger\":{\"url-filter\":\"^https://auth\\\\.x\\\\.aixgg\\\\.com(:443)?/\"},\"action\":{\"type\":\"ignore-previous-rules\"}},{\"trigger\":{\"url-filter\":\"^http://127\\\\.0\\\\.0\\\\.1:17897/callback\\\\?\"},\"action\":{\"type\":\"ignore-previous-rules\"}}]";
  [[WKContentRuleListStore defaultStore] compileContentRuleListForIdentifier:@"cybernote-hosted-login-v1" encodedContentRuleList:rules completionHandler:^(WKContentRuleList *list, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!entry.active || entries[instance] != entry || generation <= retiredGeneration) return;
      if (!list || error) { emit(entry, 4); return; }
      WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
      configuration.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
      configuration.userContentController = [WKUserContentController new];
      [configuration.userContentController addContentRuleList:list];
      configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
      NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 620, 760) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
      window.title = @"登录 CyberNote"; window.identifier = instance;
      window.releasedWhenClosed = NO; window.delegate = entry;
      WKWebView *web = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 620, 712) configuration:configuration];
      web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
      web.navigationDelegate = entry; web.UIDelegate = entry;
      NSButton *continueButton = [NSButton buttonWithTitle:@"在浏览器中继续" target:entry action:@selector(continueInBrowser:)];
      continueButton.frame = NSMakeRect(16, 722, 180, 28);
      continueButton.autoresizingMask = NSViewMinYMargin | NSViewMaxXMargin;
      NSButton *cancelButton = [NSButton buttonWithTitle:@"取消登录" target:entry action:@selector(cancel:)];
      cancelButton.frame = NSMakeRect(500, 722, 104, 28);
      cancelButton.autoresizingMask = NSViewMinYMargin | NSViewMinXMargin;
      [window.contentView addSubview:web]; [window.contentView addSubview:continueButton]; [window.contentView addSubview:cancelButton];
      entry.window = window; entry.web = web;
      [window center]; [window makeKeyAndOrderFront:nil];
      [web loadRequest:[NSURLRequest requestWithURL:entry.initialURL]];
      entry.initialURL = nil;
      emit(entry, 0);
    });
  }];
  return 0;
}
void notes_auth_close(const char *rawInstance, uint64_t generation) {
  if (![NSThread isMainThread] || !rawInstance) return;
  retiredGeneration = MAX(retiredGeneration, generation);
  NSString *instance = [NSString stringWithUTF8String:rawInstance];
  NotesLogin *entry = entries[instance];
  if (entry && entry.generation == generation) dispose(entry, NO);
}
