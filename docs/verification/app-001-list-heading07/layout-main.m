// Retained production controller with real AppKit controls, no NSWindow or input.
@interface HarnessWindow : NSObject
@property NSView *contentView;
@property NSWindowStyleMask styleMask;
@end
@implementation HarnessWindow @end
static NSArray *rect(NSRect r){return @[@(r.origin.x),@(r.origin.y),@(r.size.width),@(r.size.height)];}
static void require(BOOL ok,NSString *message){if(!ok)@throw [NSException exceptionWithName:@"Assertion" reason:message userInfo:nil];}
static NSDictionary *stateFor(NSDictionary *item){
 NSMutableArray *actions=[NSMutableArray array];
 for(NSString *a in item[@"actions"])[actions addObject:@{@"action":a,@"enabled":@YES,@"selected":@NO}];
 NSMutableDictionary *s=[@{@"revision":@1,@"layout":item[@"layout"],@"columns":@{@"sidebarVisible":item[@"visible"],@"sidebarWidth":item[@"side"],@"listWidth":@280},@"folderTitle":[item[@"zero"] boolValue]?@"搜索":@"排版核对",@"folderCount":[item[@"zero"] boolValue]?@0:@4,@"tableFocused":@NO,@"actions":actions,@"menus":@[],@"glassStyle":@"regular"} mutableCopy];
 if(![item[@"missingSearch"] boolValue])s[@"search"]=@{@"value":[item[@"zero"] boolValue]?@"controlled-query":@"",@"enabled":@YES,@"acknowledgedEvent":@0};
 return s;
}
int main(void){@autoreleasepool{@try{
 NSArray *cases=[NSJSONSerialization JSONObjectWithData:[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile] options:0 error:nil];
 NSMutableDictionary *retained=[NSMutableDictionary dictionary];NSMutableArray *results=[NSMutableArray array];
 for(NSDictionary *item in cases){
  NSMutableDictionary *entry=retained[item[@"chain"]];NotesUIController *c=entry[@"controller"];HarnessWindow *window=entry[@"window"];
  if(!c){c=[NotesUIController new];window=[HarnessWindow new];window.contentView=[[NSView alloc] initWithFrame:NSMakeRect(0,0,[item[@"width"] doubleValue],900)];window.styleMask=[item[@"full"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;c.window=(id)window;c.state=stateFor(item);[c build];
   entry=[@{@"controller":c,@"window":window,@"root":c.root,@"title":c.title,@"count":c.count,@"search":c.search,@"groups":[c.groups copy],@"buttons":[c.buttons copy],@"contents":[c.contents copy],@"background":c.sidebarBackground} mutableCopy];retained[item[@"chain"]]=entry;}
  window.contentView.frame=NSMakeRect(0,0,[item[@"width"] doubleValue],900);window.styleMask=[item[@"full"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;
  require([c apply:stateFor(item)]==nil,@"production apply failed");for(int i=0;i<3;i++)[c layout];
  require(c.root==entry[@"root"]&&c.title==entry[@"title"]&&c.count==entry[@"count"]&&c.search==entry[@"search"]&&c.sidebarBackground==entry[@"background"],@"retained host identity");
  for(NSString *k in c.groups)require(c.groups[k]==entry[@"groups"][k]&&c.contents[k]==entry[@"contents"][k],@"retained groups/content identity");
  for(NSString *k in c.buttons)require(c.buttons[k]==entry[@"buttons"][k],@"retained button identity");
  require(c.title.font.pointSize==13&&c.count.font.pointSize==11,@"title/count font size");require(c.root.isFlipped,@"root must be flipped");require(NSApp.windows.count==0,@"no NSWindow allowed");
  NSMutableDictionary *groups=[NSMutableDictionary dictionary],*buttons=[NSMutableDictionary dictionary];
  for(NSString *k in c.groups)groups[k]=@{@"frame":rect(c.groups[k].frame),@"hidden":@(c.groups[k].hidden)};
  for(NSString *k in c.buttons)buttons[k]=@{@"frame":rect(c.buttons[k].frame),@"hidden":@(c.buttons[k].hidden)};
  [results addObject:@{@"name":item[@"name"],@"title":rect(c.title.frame),@"count":rect(c.count.frame),@"titleHidden":@(c.title.hidden),@"countHidden":@(c.count.hidden),@"titleText":c.title.stringValue,@"countText":c.count.stringValue,@"titleFont":c.title.font.fontDescriptor.fontAttributes,@"countFont":c.count.font.fontDescriptor.fontAttributes,@"root":rect(c.root.frame),@"groups":groups,@"buttons":buttons,@"overflow":c.overflow,@"search":rect(c.search.frame),@"searchValue":c.search.stringValue,@"backgroundHidden":@(c.sidebarBackground.hidden),@"windows":@(NSApp.windows.count)}];
 }
 NSData *data=[NSJSONSerialization dataWithJSONObject:results options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];require(data!=nil,@"JSON serialization");[[NSFileHandle fileHandleWithStandardOutput] writeData:data];return 0;
 }@catch(NSException *e){fprintf(stderr,"%s: %s\n",e.name.UTF8String,e.reason.UTF8String);return 1;}}}
