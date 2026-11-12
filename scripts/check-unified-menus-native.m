// Production menu builder and service; isolated windows, no application data.
#import "../plugins/tauri-plugin-notes-ui/macos/menu.m"
static void check(BOOL value, NSString *message) { if(!value){fprintf(stderr,"FAIL: %s\n",message.UTF8String);exit(1);} }
static NSDictionary *item(NSString *label, NSNumber *index, BOOL enabled) {return @{@"kind":@"item",@"label":label,@"index":index,@"command":label,@"enabled":@(enabled),@"selected":@NO,@"symbol":@"doc.on.doc"};}
static NSDictionary *popup(NSWindow *window, NSString *token, NSArray *items, dispatch_block_t action) {
    NSDictionary *request=@{@"token":token,@"x":@90,@"y":@110,@"viewportWidth":@800,@"items":items};
    NSData *data=[NSJSONSerialization dataWithJSONObject:request options:0 error:nil];
    NSString *json=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_main_queue(),action);
    char *raw=notes_ui_popup_menu((__bridge void *)window,json.UTF8String);
    NSDictionary *reply=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:raw length:strlen(raw)] options:0 error:nil];free(raw);return reply;
}
int main() {@autoreleasepool {
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSWindow *window=[[NSWindow alloc] initWithContentRect:NSMakeRect(100,100,800,600) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    window.title=@"CyberNote isolated menu verification";[window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
    NotesUIContentMenuTarget *target=[NotesUIContentMenuTarget new];
    NSDictionary *copy=item(@"拷贝",@7,YES), *disabled=item(@"剪切",@8,NO);
    NSMenu *built=notesUIMenuEntries(@[copy,@{@"kind":@"separator"},disabled,@{@"kind":@"submenu",@"label":@"子菜单",@"items":@[copy]}],target,@selector(choose:));
    check(built.numberOfItems==4 && !built.autoenablesItems,@"shared builder count and policy");
    check([built itemAtIndex:1].separatorItem && ![built itemAtIndex:2].enabled,@"separator and disabled state");
    check([built itemAtIndex:0].image!=nil && [built itemAtIndex:3].submenu.numberOfItems==1,@"native icons and recursive submenu");
    check([[built itemAtIndex:3].representedObject[@"items"] isEqual:@[copy]],@"submenu representation preserved for toolbar owner wrapping");
    NSString *token=NSUUID.UUID.UUIDString;
    NSDictionary *reply=popup(window,token,@[copy,disabled],^{
        NSMenu *active=contentMenus[token][@"menu"];[active performActionForItemAtIndex:0];
    });
    check([reply[@"index"] isEqual:@7] && !contentMenus[token],@"native selection returns only index and tears down");
    token=NSUUID.UUID.UUIDString;NSString *cancelToken=token;
    reply=popup(window,token,@[copy],^{notes_ui_cancel_popup_menu((__bridge void *)window,cancelToken.UTF8String);});
    check(reply[@"index"]==NSNull.null && !contentMenus[token],@"unmount/cancel returns no command");
    NSWindow *other=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,200,100) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    token=NSUUID.UUID.UUIDString;NSString *ownToken=token;
    reply=popup(window,token,@[copy],^{
        notes_ui_cancel_popup_menu((__bridge void *)other,ownToken.UTF8String);
        check(contentMenus[ownToken]!=nil,@"foreign window cannot cancel menu");
        notes_ui_cancel_popup_menu((__bridge void *)window,ownToken.UTF8String);
    });
    check(reply[@"index"]==NSNull.null && contentMenus.count==0,@"all native tracking references released");
    [window orderOut:nil];[other orderOut:nil];
    puts("Native shared menu builder/service: 8 groups passed");
}}
