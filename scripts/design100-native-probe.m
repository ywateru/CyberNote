// Hidden NSWindow, actual production AppKit controller. No app bundle/activation,
// user window manipulation, NSMenu customization or device claims.
#import "../plugins/tauri-plugin-notes-ui/macos/toolbar.m"
#include <assert.h>
int main(int argc,char **argv) { @autoreleasepool {
  if(argc!=2)return 2;
  [NSApplication sharedApplication];
  NSDictionary *sample=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:@(argv[1])] options:0 error:nil];
  assert(sample);
  NSWindow *window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1280,800) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
  window.releasedWhenClosed=NO;
  NotesUIController *controller=[NotesUIController new];controller.window=window;controller.windowLabel=@"design100";controller.bindingId=@"probe";controller.state=sample;
  [controller build];assert(![controller apply:sample]);
  NotesUIButton *button=controller.buttons[@"checklist"];
  CGFloat font=button.font.pointSize, baseImage=button.image.size.height, baseHit=button.frame.size.height;
  NSMutableDictionary *next=[sample mutableCopy];next[@"revision"]=@2;next[@"iconScale"]=@1.2;next[@"hitScale"]=@1;
  assert(![controller apply:next]);assert(button==controller.buttons[@"checklist"]);
  assert(fabs(button.font.pointSize-font)<.01);assert(button.image.size.height>baseImage);assert(fabs(button.frame.size.height-baseHit)<.01);
  NSImage *retained=button.image;CGFloat iconSize=retained.size.height;
  next=[next mutableCopy];next[@"revision"]=@3;next[@"hitScale"]=@1.3;
  assert(![controller apply:next]);assert(button.image==retained);assert(button.image.size.height==iconSize);assert(button.frame.size.height>baseHit);assert(button.frame.size.width>=36.4);
  assert([[controller information][@"reservedTop"] doubleValue]==notesToolbarHeight(next));
  for(NSNumber *s in @[@(12.0/18),@(13.0/18),@(14.0/18),@(16.0/18),@1]) {
    next=[next mutableCopy];next[@"fontScale"]=s;next[@"revision"]=@4;
    assert(![controller apply:next]);
    for(NSUInteger i=0;i<2;i++) {
      [window setContentSize:NSMakeSize(i?760:1280,i?360:800)];[controller layout];
      for(NotesUIButton *control in controller.buttons.allValues)if(!control.hidden) {
        NSRect bounds=[control convertRect:control.bounds toView:controller.root];
        assert(bounds.size.width>=36.4-.01 && bounds.size.height>=36.4-.01);
        assert(bounds.origin.x>=-.01 && NSMaxX(bounds)<=controller.root.bounds.size.width+.01);
        assert(NSMinY(bounds)>=-.01 && NSMaxY(bounds)<=controller.root.bounds.size.height+.01);
      }
    }
  }
  printf("actual AppKit icon-only changes image independently of text/hit; hit-only retains image and expands frames; five font sizes x two windows preserve min-hit and toolbar bounds\n");
  [controller dispose];[window close];return 0;
} }
