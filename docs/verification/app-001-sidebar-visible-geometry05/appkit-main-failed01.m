// Full production controller, real AppKit views and controls, no NSWindow/NSApplication created.
@interface HarnessWindow : NSObject
@property NSView *contentView;
@property NSWindowStyleMask styleMask;
@end
@implementation HarnessWindow @end
static NSArray *r(NSRect f){return @[@(f.origin.x),@(f.origin.y),@(f.size.width),@(f.size.height)];}
static void check(BOOL pass,NSString *message){if(!pass)@throw [NSException exceptionWithName:@"HarnessAssertion" reason:message userInfo:nil];}
static NSDictionary *stateFor(NSDictionary *item) {
 NSMutableArray *actions=[NSMutableArray array];
 for(NSString *a in item[@"actions"])[actions addObject:@{@"action":a,@"enabled":@YES,@"selected":@([a isEqual:@"toggleSidebar"]&&[item[@"sidebarVisible"] boolValue])}];
 return @{@"revision":@1,@"layout":item[@"layout"],@"columns":@{@"sidebarVisible":item[@"sidebarVisible"],@"sidebarWidth":item[@"sidebarWidth"],@"listWidth":item[@"listWidth"]},@"folderTitle":@"搜索",@"folderCount":@0,@"tableFocused":@NO,@"actions":actions,@"menus":@[],@"search":@{@"value":@"controlled-query",@"enabled":@YES,@"acknowledgedEvent":@0},@"glassStyle":[item[@"phase"] isEqual:@"hidden"]?@"clear":@"regular"};
}
int main(void) {@autoreleasepool {@try {
 check(NSApp==nil,@"No existing application expected");
 NSArray *cases=[NSJSONSerialization JSONObjectWithData:[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile] options:0 error:nil];
 NSMutableArray *results=[NSMutableArray array];NSMutableDictionary *retained=[NSMutableDictionary dictionary];
 for(NSDictionary *item in cases) {
  NSMutableDictionary *entry=retained[item[@"chain"]];NotesUIController *c=entry[@"controller"];HarnessWindow *window=entry[@"window"];
  if(!c) {
   c=[NotesUIController new];window=[HarnessWindow new];window.contentView=[[NSView alloc] initWithFrame:NSMakeRect(0,0,[item[@"width"] doubleValue],900)];
   window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;c.window=(NSWindow *)(id)window;c.state=stateFor(item);[c build];
   entry=[@{@"controller":c,@"window":window,@"buttons":[c.buttons copy],@"contents":[c.contents copy],@"groups":[c.groups copy],@"search":c.search,@"title":c.title,@"count":c.count,@"root":c.root} mutableCopy];
#ifdef CANDIDATE
   entry[@"background"]=c.sidebarBackground;
#endif
   retained[item[@"chain"]]=entry;
  }
  window.contentView.frame=NSMakeRect(0,0,[item[@"width"] doubleValue],900);window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;
  window.contentView.appearance=[NSAppearance appearanceNamed:[item[@"phase"] isEqual:@"hidden"]?NSAppearanceNameDarkAqua:NSAppearanceNameAqua];
  NSDictionary *error=[c apply:stateFor(item)];check(error==nil,[NSString stringWithFormat:@"apply: %@",error]);
  for(NSString *a in c.buttons)check(c.buttons[a]==entry[@"buttons"][a],@"button identity changed");
  for(NSString *a in c.contents)check(c.contents[a]==entry[@"contents"][a],@"content identity changed");
  for(NSString *a in c.groups)check(c.groups[a]==entry[@"groups"][a],@"group identity changed");
  check(c.root==entry[@"root"]&&c.title==entry[@"title"]&&c.count==entry[@"count"]&&c.search==entry[@"search"],@"retained non-sidebar objects changed");
  check([c.search.stringValue isEqual:@"controlled-query"]&&c.search.currentEditor==nil,@"search value/editor state");
  BOOL visible=[item[@"sidebarVisible"] boolValue];BOOL independent=[item[@"layout"] isEqual:@"independentNote"];
  NSMutableDictionary *groups=[NSMutableDictionary dictionary];
  for(NSString *name in c.groups)if(!c.groups[name].hidden){NSMutableArray *aa=[NSMutableArray array];for(NSString *a in c.buttons)if(!c.buttons[a].hidden&&c.buttons[a].superview==c.contents[name])[aa addObject:a];[aa sortUsingComparator:^NSComparisonResult(NSString *a,NSString *b){CGFloat ax=c.buttons[a].frame.origin.x,bx=c.buttons[b].frame.origin.x;return ax<bx?NSOrderedAscending:ax>bx?NSOrderedDescending:NSOrderedSame;}];groups[name]=@{@"frame":r(c.groups[name].frame),@"actions":aa};}
#ifdef CANDIDATE
  check(c.sidebarBackground==entry[@"background"],@"background identity changed");
  check(c.sidebarBackground.hidden==visible,@"background visible state");
  check(c.contents[@"sidebar"].superview==c.groups[@"sidebar"]&&c.sidebarBackground.superview==c.groups[@"sidebar"],@"sidebar siblings");
  check(![c.contents[@"sidebar"] isDescendantOf:c.sidebarBackground],@"content incorrectly under background");
  check(NSEqualRects(c.sidebarBackground.frame,c.groups[@"sidebar"].bounds),@"background autoresize");
  check([c.buttons[@"toggleSidebar"].contentTintColor isEqual:NSColor.labelColor],@"toggle tint labelColor");
  if(@available(macOS 26.0,*))if([c.sidebarBackground isKindOfClass:NSClassFromString(@"NSGlassEffectView")])check(((NSGlassEffectView *)c.sidebarBackground).style==([item[@"phase"] isEqual:@"hidden"]?NSGlassEffectViewStyleClear:NSGlassEffectViewStyleRegular),@"background glassStyle");
#endif
  check(c.groups[@"sidebar"].hidden==independent,@"sidebar group availability");
  for(NSString *a in @[@"newFolder",@"toggleSidebar"]) {
   NSButton *b=c.buttons[a];if(b.hidden||c.groups[@"sidebar"].hidden)continue;
   check(b.enabled&&b.target==c&&b.action==@selector(buttonClicked:),@"button route/enable");
   check([b.accessibilityLabel isEqual:labelFor(a,NO)],@"button AX label");
   NSPoint center=[b convertPoint:NSMakePoint(NSMidX(b.bounds),NSMidY(b.bounds)) toView:c.root.superview];
   NSView *hit=[c.root hitTest:center];check(hit==b||[hit isDescendantOf:b],[NSString stringWithFormat:@"hit %@ %@",a,hit]);
  }
  check(NSApp==nil,@"No application or windows should be created");
  [results addObject:@{@"name":item[@"name"],@"groups":groups,@"overflow":c.overflow,@"titleFrame":r(c.title.frame),@"countFrame":r(c.count.frame),@"titleHidden":@(c.title.hidden),@"searchFieldFrame":r(c.search.frame),@"rootFrame":r(c.root.frame),@"backgroundClass":
#ifdef CANDIDATE
    NSStringFromClass(c.sidebarBackground.class)
#else
    NSStringFromClass(c.groups[@"sidebar"].class)
#endif
  }];
 }
 for(NSDictionary *entry in retained.allValues)[entry[@"controller"] dispose];
 NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"status":@"pass",@"states":@(cases.count),@"chains":@(retained.count),@"createdNSApplication":@NO,@"createdNSWindow":@NO,@"results":results} options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];[[NSFileHandle fileHandleWithStandardOutput] writeData:data];return 0;
 }@catch(NSException *e){fprintf(stderr,"%s: %s\n",e.name.UTF8String,e.reason.UTF8String);return 1;}
}}
