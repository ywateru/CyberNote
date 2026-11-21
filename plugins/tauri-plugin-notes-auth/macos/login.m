// Host-only WKWebView containers. No Tauri/custom protocol/script-message/JS interfaces.
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <stdint.h>
#include <string.h>
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
      window.contentMinSize = NSMakeSize(420, 560);
      window.releasedWhenClosed = NO; window.delegate = entry;
      WKWebView *web = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
      web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
      web.navigationDelegate = entry; web.UIDelegate = entry;
      [window.contentView addSubview:web];
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

// ---- Generic cloud login (OneDrive / Baidu via OpenList) -------------------

@interface NotesCloudLogin : NSObject <NSWindowDelegate, WKNavigationDelegate, WKUIDelegate>
@property(nonatomic, strong) NSString *instance;
@property(nonatomic, strong) NSURL *initialURL;
@property(nonatomic, strong) NSString *title;
@property(nonatomic, strong) NSArray<NSString *> *allowedHosts;
@property(nonatomic, strong) NSString *callbackPrefix;
@property(nonatomic, strong) NSArray<NSDictionary *> *cookies;
@property(nonatomic) uint64_t generation;
@property(nonatomic) BOOL active;
@property(nonatomic) BOOL callbackSent;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *web;
@property(nonatomic, strong) WKWebsiteDataStore *dataStore;
@end
static NSMutableDictionary<NSString *, NotesCloudLogin *> *cloudEntries;
static uint64_t cloudRetiredGeneration;
static uint64_t cloudLatestGeneration;

static BOOL cloudHostAllowedList(NSArray<NSString *> *allowedHosts, NSURL *url) {
  if ([url.absoluteString isEqualToString:@"about:blank"]) return YES;
  if (![url.scheme.lowercaseString isEqualToString:@"https"] || url.user || url.password) return NO;
  if (url.port && url.port.integerValue != 443) return NO;
  NSString *host = url.host.lowercaseString;
  if (!host.length) return NO;
  for (NSString *rule in allowedHosts) {
    NSString *r = rule.lowercaseString;
    if ([r hasPrefix:@"."]) {
      NSString *root = [r substringFromIndex:1];
      if ([host isEqualToString:root] || [host hasSuffix:r]) return YES;
    } else if ([host isEqualToString:r]) {
      return YES;
    }
  }
  return NO;
}
static BOOL cloudHostAllowed(NotesCloudLogin *entry, NSURL *url) {
  return cloudHostAllowedList(entry.allowedHosts, url);
}
static BOOL cloudCallback(NotesCloudLogin *entry, NSURL *url) {
  return entry.callbackPrefix.length > 0 &&
    [url.absoluteString hasPrefix:entry.callbackPrefix] &&
    url.fragment.length > 0 && !url.user && !url.password;
}
static void cloudEmit(NotesCloudLogin *entry, int kind) {
  if (entry.active) notes_auth_event(entry.instance.UTF8String, kind, NULL);
}
static void cloudDispose(NotesCloudLogin *entry, BOOL user) {
  BOOL notify = entry.active && user;
  entry.initialURL = nil;
  entry.active = NO;
  cloudRetiredGeneration = MAX(cloudRetiredGeneration, entry.generation);
  [cloudEntries removeObjectForKey:entry.instance];
  entry.web.navigationDelegate = nil;
  entry.web.UIDelegate = nil;
  [entry.web stopLoading];
  [entry.web removeFromSuperview];
  entry.web = nil;
  entry.window.delegate = nil;
  [entry.window close];
  entry.window = nil;
  WKWebsiteDataStore *store = entry.dataStore;
  entry.dataStore = nil;
  if (store) {
    [store.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
      for (NSHTTPCookie *c in cookies) [store.httpCookieStore deleteCookie:c completionHandler:nil];
    }];
    [store removeDataOfTypes:[WKWebsiteDataStore allWebsiteDataTypes] modifiedSince:[NSDate distantPast] completionHandler:^{}];
  }
  if (notify) notes_auth_event(entry.instance.UTF8String, 1, NULL);
}
static NSString *cloudRules(NotesCloudLogin *entry) {
  NSMutableArray *rules = [NSMutableArray arrayWithObject:@{
    @"trigger": @{@"url-filter": @".*"},
    @"action": @{@"type": @"block"}
  }];
  for (NSString *host in entry.allowedHosts) {
    NSString *h = host.lowercaseString;
    NSString *filter;
    // Escape through Foundation, then let NSJSONSerialization escape the
    // backslash once more. Hand-written `\\.` becomes `\\\\.` in the JSON
    // string and the rule engine sees a literal backslash, so wildcard hosts
    // silently stop matching. Foundation keeps exactly one regex escape.
    if ([h hasPrefix:@"."]) {
      NSString *root = [NSRegularExpression escapedPatternForString:[h substringFromIndex:1]];
      NSString *dot = [NSRegularExpression escapedPatternForString:@"."];
      filter = [NSString stringWithFormat:@"^https://([a-z0-9-]+%@)*%@(:443)?/", dot, root];
    } else {
      NSString *exact = [NSRegularExpression escapedPatternForString:h];
      filter = [NSString stringWithFormat:@"^https://%@(:443)?/", exact];
    }
    [rules addObject:@{@"trigger": @{@"url-filter": filter}, @"action": @{@"type": @"ignore-previous-rules"}}];
  }
  NSData *data = [NSJSONSerialization dataWithJSONObject:rules options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : nil;
}
@implementation NotesCloudLogin
- (void)windowWillClose:(NSNotification *)notification { cloudDispose(self, YES); }
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decision {
  NSURL *url = action.request.URL;
  if (!self.active || !action.targetFrame || action.shouldPerformDownload) {
    decision(WKNavigationActionPolicyCancel); return;
  }
  if (action.targetFrame.isMainFrame && cloudCallback(self, url)) {
    // Intercept before the page loads. The fragment is the only token carrier.
    if (!self.callbackSent) {
      self.callbackSent = YES;
      notes_auth_event(self.instance.UTF8String, 3, url.absoluteString.UTF8String);
    }
    decision(WKNavigationActionPolicyCancel);
    return;
  }
  decision(cloudHostAllowed(self, url) ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))decision {
  decision(self.active && cloudHostAllowed(self, response.response.URL) ? WKNavigationResponsePolicyAllow : WKNavigationResponsePolicyCancel);
}
- (WKWebView *)webView:(WKWebView *)web createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features { return nil; }
- (void)webView:(WKWebView *)web runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSArray<NSURL *> *))completion { completion(nil); }
- (void)webView:(WKWebView *)web requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin initiatedByFrame:(WKFrameInfo *)frame type:(WKMediaCaptureType)type decisionHandler:(void (^)(WKPermissionDecision))decision { decision(WKPermissionDecisionDeny); }
- (void)webView:(WKWebView *)web didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  if (error.code != NSURLErrorCancelled) cloudEmit(self, 4);
}
- (void)webView:(WKWebView *)web didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  if (error.code != NSURLErrorCancelled) cloudEmit(self, 4);
}
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {
  if (self.active && !self.callbackSent && cloudCallback(self, web.URL)) {
    self.callbackSent = YES;
    notes_auth_event(self.instance.UTF8String, 3, web.URL.absoluteString.UTF8String);
  }
}
- (void)webView:(WKWebView *)web didReceiveAuthenticationChallenge:(NSURLAuthenticationChallenge *)challenge completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *))completion {
  completion([challenge.protectionSpace.authenticationMethod isEqualToString:NSURLAuthenticationMethodServerTrust] ? NSURLSessionAuthChallengePerformDefaultHandling : NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
}
- (void)webView:(WKWebView *)web authenticationChallenge:(NSURLAuthenticationChallenge *)challenge shouldAllowDeprecatedTLS:(void (^)(BOOL))decision { decision(NO); }
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)web { cloudEmit(self, 4); }
@end

int notes_cloud_auth_open(const char *rawConfig) {
  if (![NSThread isMainThread] || !rawConfig) return 1;
  NSData *data = [NSData dataWithBytes:rawConfig length:strlen(rawConfig)];
  NSDictionary *cfg = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![cfg isKindOfClass:[NSDictionary class]]) return 1;
  NSString *instance = cfg[@"instance"];
  NSNumber *generationNumber = cfg[@"generation"];
  NSString *urlString = cfg[@"url"];
  NSString *title = cfg[@"title"];
  NSArray *allowedHosts = cfg[@"allowedHosts"];
  NSString *callbackPrefix = cfg[@"callbackPrefix"];
  NSArray *cookies = cfg[@"cookies"];
  if (![instance isKindOfClass:[NSString class]] || ![instance hasPrefix:@"cloud-auth-"] ||
      ![generationNumber isKindOfClass:[NSNumber class]] || ![urlString isKindOfClass:[NSString class]] ||
      ![title isKindOfClass:[NSString class]] || ![allowedHosts isKindOfClass:[NSArray class]] ||
      ![callbackPrefix isKindOfClass:[NSString class]] || ![cookies isKindOfClass:[NSArray class]]) return 1;
  uint64_t generation = generationNumber.unsignedLongLongValue;
  if (generation <= cloudRetiredGeneration || generation <= cloudLatestGeneration) return 1;
  NSURL *url = [NSURL URLWithString:urlString];
  if (!cloudHostAllowedList(allowedHosts, url)) return 1;
  if (![callbackPrefix hasPrefix:@"https://"] || title.length > 120) return 1;
  if (!cloudEntries) cloudEntries = [NSMutableDictionary dictionary];
  for (NotesCloudLogin *old in cloudEntries.allValues.copy) cloudDispose(old, NO);
  cloudLatestGeneration = generation;
  NotesCloudLogin *entry = [NotesCloudLogin new];
  entry.instance = instance; entry.generation = generation; entry.active = YES;
  entry.initialURL = url; entry.title = title; entry.allowedHosts = allowedHosts;
  entry.callbackPrefix = callbackPrefix; entry.cookies = cookies;
  cloudEntries[instance] = entry;
  NSString *rules = cloudRules(entry);
  if (!rules) { cloudEmit(entry, 4); return 1; }
  NSString *identifier = [NSString stringWithFormat:@"cybernote-cloud-login-v1-%llu", generation];
  [[WKContentRuleListStore defaultStore] compileContentRuleListForIdentifier:identifier encodedContentRuleList:rules completionHandler:^(WKContentRuleList *list, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!entry.active || cloudEntries[instance] != entry || generation <= cloudRetiredGeneration) return;
      if (!list || error) { cloudEmit(entry, 4); return; }
      WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
      WKWebsiteDataStore *store = [WKWebsiteDataStore nonPersistentDataStore];
      configuration.websiteDataStore = store;
      entry.dataStore = store;
      configuration.userContentController = [WKUserContentController new];
      [configuration.userContentController addContentRuleList:list];
      configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
      // Inject only the two auth-state cookies returned by /requests.
      dispatch_group_t group = dispatch_group_create();
      __block BOOL cookieFailure = NO;
      for (NSDictionary *c in cookies) {
        NSString *name = c[@"name"]; NSString *value = c[@"value"];
        NSString *domain = c[@"domain"]; NSString *path = c[@"path"];
        if (![name isKindOfClass:[NSString class]] || ![value isKindOfClass:[NSString class]] ||
            ![domain isKindOfClass:[NSString class]] || ![path isKindOfClass:[NSString class]] ||
            !domain.length || !path.length) {
          cookieFailure = YES; break;
        }
        NSMutableDictionary *props = [@{
          NSHTTPCookieName: name, NSHTTPCookieValue: value,
          NSHTTPCookieDomain: domain, NSHTTPCookiePath: path,
          NSHTTPCookieSecure: [c[@"secure"] boolValue] ? @"TRUE" : @"FALSE",
          NSHTTPCookieDiscard: @"TRUE"
        } mutableCopy];
        NSString *sameSite = c[@"sameSite"];
        if ([sameSite isKindOfClass:[NSString class]] && sameSite.length) props[NSHTTPCookieSameSitePolicy] = sameSite;
        NSHTTPCookie *cookie = [NSHTTPCookie cookieWithProperties:props];
        if (!cookie) { cookieFailure = YES; break; }
        dispatch_group_enter(group);
        [store.httpCookieStore setCookie:cookie completionHandler:^{ dispatch_group_leave(group); }];
      }
      if (cookieFailure) { cloudEmit(entry, 4); return; }
      dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        if (!entry.active || cloudEntries[instance] != entry) return;
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 620, 780) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
        window.title = title; window.identifier = instance;
        window.contentMinSize = NSMakeSize(420, 560);
        window.releasedWhenClosed = NO; window.delegate = entry;
        WKWebView *web = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
        web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        web.navigationDelegate = entry; web.UIDelegate = entry;
        [window.contentView addSubview:web];
        entry.window = window; entry.web = web;
        [window center]; [window makeKeyAndOrderFront:nil];
        [web loadRequest:[NSURLRequest requestWithURL:entry.initialURL]];
        entry.initialURL = nil;
        cloudEmit(entry, 0);
      });
    });
  }];
  return 0;
}
void notes_cloud_auth_close(const char *rawInstance, uint64_t generation) {
  if (![NSThread isMainThread] || !rawInstance) return;
  cloudRetiredGeneration = MAX(cloudRetiredGeneration, generation);
  NSString *instance = [NSString stringWithUTF8String:rawInstance];
  NotesCloudLogin *entry = cloudEntries[instance];
  if (entry && entry.generation == generation) cloudDispose(entry, NO);
}
