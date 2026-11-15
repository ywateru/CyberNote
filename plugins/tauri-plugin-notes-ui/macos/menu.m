#import "menu.h"
static NSMutableDictionary<NSString *, NSDictionary *> *contentMenus;
@interface NotesUIContentMenuTarget : NSObject
@property NSNumber *chosen;
@end
@implementation NotesUIContentMenuTarget
- (void)choose:(NSMenuItem *)item { if(item.enabled){self.chosen=item.representedObject[@"index"];[item.menu cancelTracking];} }
@end
static char *menuReply(NSDictionary *value) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
char *notes_ui_popup_menu(void *rawWindow,const char *json) {
    if(!NSThread.isMainThread)return menuReply(@{@"error":@"菜单必须在主线程打开"});
    NSWindow *window=(__bridge NSWindow *)rawWindow;
    NSDictionary *request=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:json length:strlen(json)] options:0 error:nil];
    NSString *token=request[@"token"];
    if(!window.contentView || !request || !token)return menuReply(@{@"error":@"菜单窗口已关闭"});
    if(!contentMenus)contentMenus=[NSMutableDictionary dictionary];
    if(contentMenus[token])return menuReply(@{@"error":@"菜单请求已存在"});
    NotesUIContentMenuTarget *target=[NotesUIContentMenuTarget new];
    NSMenu *menu=notesUIMenuEntries(request[@"items"],target,@selector(choose:));
    contentMenus[token]=@{@"window":window,@"menu":menu};
    NSView *view=window.contentView;
    CGFloat scale=NSWidth(view.bounds)/[request[@"viewportWidth"] doubleValue];
    CGFloat x=[request[@"x"] doubleValue]*scale, y=[request[@"y"] doubleValue]*scale;
    NSPoint point=NSMakePoint(x,view.flipped?y:NSHeight(view.bounds)-y);
    @try { [menu popUpMenuPositioningItem:nil atLocation:point inView:view]; }
    @catch(NSException *exception) { return menuReply(@{@"error":exception.reason?:@"菜单无法打开"}); }
    @finally { [contentMenus removeObjectForKey:token]; }
    return menuReply(@{@"index":target.chosen?:NSNull.null});
}
void notes_ui_cancel_popup_menu(void *rawWindow,const char *token) {
    if(!NSThread.isMainThread)return;
    NSDictionary *value=contentMenus[[NSString stringWithUTF8String:token]];
    if(value[@"window"]==(__bridge NSWindow *)rawWindow)[value[@"menu"] cancelTracking];
}
