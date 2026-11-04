// Independent focused review. Full production source precedes this file.
// Uses real AppKit views, but a window-shaped NSObject; never constructs NSWindow.
@interface ReviewWindow : NSObject
@property NSView *contentView;
@property NSWindowStyleMask styleMask;
@end
@implementation ReviewWindow @end
static void demand(BOOL ok,NSString *message) {if(!ok)@throw [NSException exceptionWithName:@"ReviewFailure" reason:message userInfo:nil];}
static NSArray *frame(NSRect f){return @[@(f.origin.x),@(f.origin.y),@(f.size.width),@(f.size.height)];}
static NSArray *rgba(NSColor *c){NSColor *s=[c colorUsingColorSpace:NSColorSpace.sRGBColorSpace];return @[@(s.redComponent),@(s.greenComponent),@(s.blueComponent),@(s.alphaComponent)];}
static BOOL closeColor(NSArray *a,NSArray *b){for(NSUInteger i=0;i<4;i++)if(fabs([a[i] doubleValue]-[b[i] doubleValue])>1e-7)return NO;return YES;}
static NSDictionary *reviewState(NSDictionary *test) {
 NSMutableArray *actions=[NSMutableArray array];
 for(NSString *a in @[@"newFolder",@"toggleSidebar",@"viewOptions",@"backToGallery",@"newNote",@"format",@"checklist",@"table",@"attachment",@"share",@"more"])
  [actions addObject:@{@"action":a,@"enabled":@(!([test[@"disable"] boolValue]&&([a isEqual:@"newFolder"]||[a isEqual:@"toggleSidebar"]))),@"selected":@([a isEqual:test[@"selected"]]||([a isEqual:@"toggleSidebar"]&&[test[@"visible"] boolValue]))}];
 return @{@"revision":@1,@"layout":test[@"layout"],@"columns":@{@"sidebarVisible":test[@"visible"],@"sidebarWidth":test[@"side"],@"listWidth":@360},@"folderTitle":@"Review local note",@"folderCount":@7,@"tableFocused":@NO,@"actions":actions,@"menus":@[],@"search":@{@"value":@"preserved-value",@"enabled":@YES,@"acknowledgedEvent":@0},@"glassStyle":@"regular"};
}
int main(void){@autoreleasepool{@try{
 NSArray *cases=[NSJSONSerialization JSONObjectWithData:[NSFileHandle.fileHandleWithStandardInput readDataToEndOfFile] options:0 error:nil];
 demand(NSApp.windows.count==0,@"Unexpected existing window");ReviewWindow *w=[ReviewWindow new];w.contentView=[[NSView alloc] initWithFrame:NSMakeRect(0,0,1394,900)];
 NotesUIController *c=[NotesUIController new];c.window=(NSWindow *)(id)w;c.state=reviewState(cases[0]);[c build];
 NSDictionary *buttons=[c.buttons copy],*groups=[c.groups copy],*contents=[c.contents copy];id root=c.root,search=c.search,title=c.title,count=c.count,background=c.sidebarBackground;
 NSMutableArray *results=[NSMutableArray array];
 for(NSDictionary *test in cases){
  BOOL visible=[test[@"visible"] boolValue],full=[test[@"full"] boolValue],three=[test[@"layout"] isEqual:@"threeColumn"],independent=[test[@"layout"] isEqual:@"independentNote"];
  w.styleMask=full?NSWindowStyleMaskFullSizeContentView:0;demand([c apply:reviewState(test)]==nil,@"Production apply failed");
  NSRect firstFrame=c.groups[@"sidebar"].frame;NSPoint firstOffset=((NotesUIButtonCell *)c.buttons[@"toggleSidebar"].cell).notesContentOffset;
  for(NSUInteger i=0;i<7;i++)[c layout];
  demand(NSEqualRects(firstFrame,c.groups[@"sidebar"].frame)&&NSEqualPoints(firstOffset,((NotesUIButtonCell *)c.buttons[@"toggleSidebar"].cell).notesContentOffset),@"Layout accumulated changes");
  for(NSString *a in buttons)demand(buttons[a]==c.buttons[a],@"Button replaced");for(NSString *g in groups)demand(groups[g]==c.groups[g]&&contents[g]==c.contents[g],@"Group/content replaced");
  demand(root==c.root&&search==c.search&&title==c.title&&count==c.count&&background==c.sidebarBackground,@"Retained object replaced");
  demand([c.search.stringValue isEqual:@"preserved-value"]&&c.search.currentEditor==nil,@"Search value/fixture editor changed");
  NSPoint want=visible?NSMakePoint(.75,-.25):(three&&full?NSMakePoint(.5,-.25):NSZeroPoint);
  demand(NSEqualPoints(firstOffset,want),@"State-specific toggle optical offset wrong");
  demand(NSEqualPoints(((NotesUIButtonCell *)c.buttons[@"newFolder"].cell).notesContentOffset,NSMakePoint(1.5,-1)),@"Folder optical offset wrong");
  demand(c.sidebarBackground.hidden==visible,@"Background visibility wrong");
  demand(c.groups[@"sidebar"].hidden==independent,@"Sidebar absent/present wrong");
  if(!independent){NSRect g=c.groups[@"sidebar"].frame;CGFloat traffic=full?94:12;
   if(visible){CGFloat side=[test[@"side"] doubleValue];demand(fabs(NSMaxX(g)-side)<1e-8,@"Visible right anchor moved");demand(c.buttons[@"toggleSidebar"].frame.size.width==44,@"Visible slot width moved");demand([c.overflow containsObject:@"newFolder"]==(traffic+88>side),@"Folder threshold changed");}
   else{BOOL target=three&&full;demand(g.origin.x==traffic+(target?2:0)&&g.size.width==(target?40:36),@"Hidden frame scope wrong");if(target)demand(c.title.frame.origin.x==154,@"Hidden title moved");}
   demand(g.origin.y==8&&g.size.height==36,@"Group vertical geometry changed");demand(![c.overflow containsObject:@"toggleSidebar"],@"Restore overflowed");
   demand(NSEqualRects(c.sidebarBackground.frame,c.contents[@"sidebar"].bounds),@"Background frame wrong");
   for(NSString *a in @[@"newFolder",@"toggleSidebar"]){NSButton *b=c.buttons[a];if(b.hidden)continue;
    demand(b.target==c&&b.action==@selector(buttonClicked:)&&[b.accessibilityLabel isEqual:labelFor(a,NO)],@"Route/AX changed");
    demand(b.enabled==![test[@"disable"] boolValue],@"Enabled state changed");
    for(NSNumber *x in @[@0.001,@0.5,@0.999]){NSPoint local=NSMakePoint(b.bounds.size.width*x.doubleValue,b.bounds.size.height/2);NSPoint parent=[b convertPoint:local toView:b.superview];demand([b hitTest:parent]==b,@"Local hit boundary wrong");NSPoint rp=[b convertPoint:local toView:c.root.superview];NSView *hit=[c.root hitTest:rp];demand(hit==b||[hit isDescendantOf:b],@"Root hit boundary wrong");}
   }
  }
  NSMutableArray *colors=[NSMutableArray array];
  for(NSString *requested in @[NSAppearanceNameAqua,NSAppearanceNameDarkAqua,NSAppearanceNameAccessibilityHighContrastAqua,NSAppearanceNameAccessibilityHighContrastDarkAqua,NSAppearanceNameAqua]){
   NSAppearance *appearance=[NSAppearance appearanceNamed:requested];[appearance performAsCurrentDrawingAppearance:^{
    NSArray *label=rgba(NSColor.labelColor);NSMutableArray *expected=[label mutableCopy];if([appearance.name isEqual:NSAppearanceNameAqua]&&!NSWorkspace.sharedWorkspace.accessibilityDisplayShouldIncreaseContrast)expected[3]=@.70;
    NSArray *toggle=rgba(c.buttons[@"toggleSidebar"].contentTintColor),*folder=rgba(c.buttons[@"newFolder"].contentTintColor);
    demand(closeColor(toggle,expected),@"Toggle appearance tint wrong");demand(closeColor(folder,[test[@"selected"] isEqual:@"newFolder"]?rgba(NSColor.systemYellowColor):expected),@"Folder selected/dynamic tint wrong");
    for(NSString *a in @[@"newNote",@"format",@"checklist",@"table",@"attachment",@"share",@"more"])
     demand(closeColor(rgba(c.buttons[a].contentTintColor),[test[@"selected"] isEqual:a]?rgba(NSColor.systemYellowColor):label),@"Unrelated action tint changed");
    [colors addObject:@{@"requested":requested,@"actual":appearance.name,@"label":label,@"toggle":toggle,@"folder":folder}];
   }];
  }
  [results addObject:@{@"case":test,@"sidebarFrame":frame(c.groups[@"sidebar"].frame),@"titleFrame":frame(c.title.frame),@"offset":@[@(firstOffset.x),@(firstOffset.y)],@"backgroundClass":NSStringFromClass(c.sidebarBackground.class),@"colors":colors}];
  demand(NSApp.windows.count==0,@"Fixture created real window");
 }
#ifdef REVIEW_MUTABLE_CONTRAST
 // Reuse one dynamic color while changing only the public-property seam.
 NSColor *retainedColor=sidebarTintColor();NSMutableArray *contrastResults=[NSMutableArray array];
 for(NSNumber *v in @[@NO,@YES,@NO,@YES,@NO]){reviewContrast=v.boolValue;NSAppearance *a=[NSAppearance appearanceNamed:NSAppearanceNameAqua];[a performAsCurrentDrawingAppearance:^{NSArray *actual=rgba(retainedColor);NSMutableArray *want=[rgba(NSColor.labelColor) mutableCopy];if(!reviewContrast)want[3]=@.70;demand(closeColor(actual,want),@"Retained dynamic color stale after contrast policy change");[contrastResults addObject:@{@"contrast":v,@"actual":actual}];}];}
#else
 NSArray *contrastResults=@[];
#endif
 [c dispose];NSDictionary *result=@{@"status":@"pass",@"states":@(results.count),@"windows":@(NSApp.windows.count),@"results":results,@"retainedContrastRoundtrip":contrastResults};NSData *data=[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];[NSFileHandle.fileHandleWithStandardOutput writeData:data];return 0;
 }@catch(NSException *e){fprintf(stderr,"%s: %s\n",e.name.UTF8String,e.reason.UTF8String);return 1;}}}
