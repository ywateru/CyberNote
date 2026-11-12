#import "../../plugins/tauri-plugin-notes-ui/macos/toolbar.m"
@interface PreviewTestWindow:NSWindow
@property NSInteger drags;
@property NSInteger zooms;
@end
@implementation PreviewTestWindow
- (void)performWindowDragWithEvent:(NSEvent *)event {self.drags++;}
- (void)zoom:(id)sender {self.zooms++;[super zoom:sender];}
@end
static NSDictionary *response(char *json){NSDictionary *value=decode(json);free(json);return value;}
static NSDictionary *stateWith(NSDictionary *base,NSUInteger revision,BOOL overlay){NSMutableDictionary *v=[base mutableCopy];v[@"revision"]=@(revision);v[@"contentOverlay"]=@(overlay);return v;}
static NSView *hitCenter(NSView *root,NSView *child){NSPoint point=[child convertPoint:NSMakePoint(NSMidX(child.bounds),NSMidY(child.bounds)) toView:root.superview];return [root hitTest:point];}
int main(int argc,const char **argv){@autoreleasepool {
 [NSApplication sharedApplication];
 PreviewTestWindow *w=[[PreviewTestWindow alloc] initWithContentRect:NSMakeRect(120,120,1000,600) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable|NSWindowStyleMaskFullSizeContentView backing:NSBackingStoreBuffered defer:NO];
 NSData *data=[NSData dataWithContentsOfFile:@"plugins/tauri-plugin-notes-ui/examples/state.json"];
 NSDictionary *base=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if(!base)return 2;
 NSDictionary *bound=response(notes_ui_bind((__bridge void *)w,"image80-isolated","image80-isolated",encoded(stateWith(base,1,NO)),NULL,NULL,NULL));
 if(![bound[@"ok"] boolValue]){puts(encoded(bound));return 3;}
 NotesUIController *c=controllers[@"image80-isolated"];NSSearchField *search=c.search;NSView *root=c.root;
 BOOL normalVisible=NO;for(NSView *group in c.groups.allValues)if(!group.hidden)normalVisible=YES;
 NSEvent *(^event)(NSInteger)=^NSEvent *(NSInteger clicks){return [NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:NSMakePoint(200,570) modifierFlags:0 timestamp:0 windowNumber:w.windowNumber context:nil eventNumber:1 clickCount:clicks pressure:1];};
 NSRect before=w.frame;[(NotesUIRoot *)root mouseDown:event(2)];NSRect zoomed=w.frame;[(NotesUIRoot *)root mouseDown:event(2)];NSRect restored=w.frame;[(NotesUIRoot *)root mouseDown:event(1)];
 // The retained group content uses the same production drag root. Controls must
 // win hit testing, while their surrounding blank surface supports double click.
 NotesUIRoot *group=(NotesUIRoot *)c.contents[@"edit"];[group mouseDown:event(2)];[group mouseDown:event(2)];
 NotesUIButton *button=c.buttons[@"format"];NSView *buttonHit=hitCenter(root,button);NSView *searchHit=hitCenter(root,search);
 BOOL controlsWin=(buttonHit==button||[buttonHit isDescendantOf:button])&&(searchHit==search||[searchHit isDescendantOf:search]);
 // Real field editor marked text and selection reproduce the native IME gate.
 c.search.stringValue=@"原生搜索中文";[w makeFirstResponder:search];NSTextView *editor=(NSTextView *)search.currentEditor;
 [editor setSelectedRange:NSMakeRange(2,2)];[editor setMarkedText:@"拼音" selectedRange:NSMakeRange(1,0) replacementRange:NSMakeRange(2,2)];
 NSString *actualSearch=[search.stringValue copy];BOOL marked=editor.hasMarkedText;c.searchSequence=7;
 NSMutableDictionary *overlay=[stateWith(base,2,YES) mutableCopy];NSMutableDictionary *staleSearch=[base[@"search"] mutableCopy];staleSearch[@"value"]=@"stale projected";staleSearch[@"acknowledgedEvent"]=@0;overlay[@"search"]=staleSearch;
 NSMutableDictionary *geometry=[NSMutableDictionary dictionary];for(NSString *key in c.groups)geometry[key]=@[@(c.groups[key].hidden),NSStringFromRect(c.groups[key].frame)];
 NSDictionary *hidden=response(notes_ui_update("image80-isolated",encoded(overlay)));
 BOOL stable=YES;for(NSString *key in geometry){NSView *group=c.groups[key];if(group.hidden!=[geometry[key][0] boolValue]||![NSStringFromRect(group.frame) isEqual:geometry[key][1]])stable=NO;}
 BOOL disabled=!search.enabled;for(NSButton *button in c.buttons.allValues)if(button.enabled)disabled=NO;
 BOOL previewSafe=[hidden[@"ok"] boolValue]&&stable&&disabled&&!c.title.hidden&&!c.count.hidden&&!root.hidden&&NSHeight(root.frame)==[hidden[@"native"][@"reservedTop"] doubleValue];
 NSString *preserved=[search.stringValue copy];NSDictionary *focusBlocked=[c focusSearch];
 NSDictionary *late=response(notes_ui_update("image80-isolated",encoded(stateWith(base,1,NO))));BOOL lateBlocked=![late[@"ok"] boolValue]&&[c.state[@"contentOverlay"] boolValue];
 [editor unmarkText];NSMutableDictionary *restoring=[stateWith(base,3,NO) mutableCopy];NSMutableDictionary *latestSearch=[base[@"search"] mutableCopy];latestSearch[@"value"]=preserved;latestSearch[@"acknowledgedEvent"]=@(c.searchSequence);restoring[@"search"]=latestSearch;
 NSDictionary *restore=response(notes_ui_update("image80-isolated",encoded(restoring)));BOOL groupsRestored=NO;for(NSView *v in c.groups.allValues)if(!v.hidden)groupsRestored=YES;
 BOOL retained=search==c.search&&[search.stringValue isEqual:preserved]&&[preserved isEqual:actualSearch];
 NSDictionary *result=@{@"scope":@"Isolated production ObjC bind/update/root, real NSWindow zoom geometry and real AppKit field editor/marked text. Drag overridden to count without blocking. No installed app or real input. Rust serialization/model tests run separately.",@"normalGroupsVisible":@(normalVisible),@"rootAboveContent":@(w.contentView.subviews.lastObject==root),@"drags":@(w.drags),@"zooms":@(w.zooms),@"frameChanged":@(!NSEqualRects(before,zoomed)),@"frameRestored":@(NSEqualRects(before,restored)),@"before":NSStringFromRect(before),@"zoomed":NSStringFromRect(zoomed),@"restored":NSStringFromRect(restored),@"controlsWinHitTest":@(controlsWin),@"realMarkedText":@(marked),@"overlayVisibleAndDisabledWithStaleAckAndMarkedText":@(previewSafe),@"reservedTop":hidden[@"native"][@"reservedTop"]?:@0,@"hiddenSearchFocusRefused":@([focusBlocked[@"code"] isEqual:@"search_disabled"]),@"lateNormalStateRejected":@(lateBlocked),@"restoredGroups":@(groupsRestored&&[restore[@"ok"] boolValue]),@"retainedSearchAndExactValue":@(retained)};
 puts(encoded(result));BOOL pass=normalVisible&&w.drags==1&&w.zooms==4&&!NSEqualRects(before,zoomed)&&NSEqualRects(before,restored)&&controlsWin&&marked&&previewSafe&&lateBlocked&&groupsRestored&&retained;
 [c dispose];[controllers removeObjectForKey:@"image80-isolated"];return pass?0:1;
}}
