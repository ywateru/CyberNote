#import <AppKit/AppKit.h>
// Both toolbar and content menus use exactly the same AppKit item builder.
static inline NSMenu *notesUIMenuEntries(NSArray *entries, id target, SEL action) {
    NSMenu *menu=[[NSMenu alloc] initWithTitle:@""];menu.autoenablesItems=NO;
    for(NSDictionary *entry in entries) {
        if([entry[@"kind"] isEqual:@"separator"]) {[menu addItem:NSMenuItem.separatorItem];continue;}
        NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:entry[@"label"]?:@"" action:nil keyEquivalent:@""];
        if([entry[@"kind"] isEqual:@"submenu"])item.submenu=notesUIMenuEntries(entry[@"items"],target,action);
        else {
            item.target=target;item.action=action;item.enabled=[entry[@"enabled"] boolValue];
            item.state=[entry[@"selected"] boolValue]?NSControlStateValueOn:NSControlStateValueOff;
            item.representedObject=entry;
            if([entry[@"symbol"] length])item.image=[NSImage imageWithSystemSymbolName:entry[@"symbol"] accessibilityDescription:nil];
        }
        if(!item.representedObject)item.representedObject=entry;
        // Toolbar and content menus share leading SF Symbols, including submenu parents.
        NSString *symbol=entry[@"symbol"];
        if(!symbol.length) {
            NSDictionary *commands=@{@"pinNote":@"pin",@"lockNote":@"lock",@"findInNote":@"magnifyingglass",@"moveNote":@"folder",
                @"recentNotes":@"clock",@"deleteNote":@"trash",@"viewAttachments":@"paperclip",@"viewList":@"list.bullet",@"viewGallery":@"square.grid.2x2",
                @"attachFile":@"paperclip",@"choosePhotoVideo":@"photo",@"recordAudio":@"mic",@"recognizeImageText":@"text.viewfinder",@"takePhoto":@"camera",@"scanDocument":@"doc.viewfinder",@"addSketch":@"pencil.tip"};
            symbol=commands[entry[@"command"]?:@""];
            if([entry[@"command"] isEqual:@"pinNote"] && [entry[@"selected"] boolValue])symbol=@"pin.slash";
            if([entry[@"kind"] isEqual:@"submenu"]) {
                NSDictionary *parents=@{@"移动到":@"folder",@"数学结果":@"equal.circle",@"附件视图":@"square.grid.2x2",@"排序方式":@"arrow.up.arrow.down",@"颜色":@"highlighter"};
                symbol=parents[entry[@"label"]];
            }
        }
        if(symbol.length)item.image=[NSImage imageWithSystemSymbolName:symbol accessibilityDescription:nil];
        [menu addItem:item];
    }
    return menu;
}
