// Isolated AppKit rendering harness. Uses production toolbar and no app/user data.
#import "../plugins/tauri-plugin-notes-ui/macos/toolbar.m"
static void check(BOOL ok, NSString *message) { if(!ok) {fprintf(stderr,"FAIL: %s\n",message.UTF8String);exit(1);} }
static void releaseTest(void *context) {(void)context;}
static NSMutableArray *events;
static void eventTest(void *context,const char *json) {(void)context;[events addObject:decode(json)];}
static NSDictionary *rectJSON(NSRect r) {return @{@"x":@(r.origin.x),@"y":@(r.origin.y),@"width":@(r.size.width),@"height":@(r.size.height)};}
static NSRect rootRect(NotesUIController *c,NSView *v) {return [c.root convertRect:v.bounds fromView:v];}
static NSBitmapImageRep *snapshot(NSView *view,NSString *path,CGFloat dpr) {
    [view.window.contentView layoutSubtreeIfNeeded];[view displayIfNeeded];
    NSInteger w=ceil(NSWidth(view.bounds)*dpr),h=ceil(NSHeight(view.bounds)*dpr);
    NSBitmapImageRep *rep=[[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:w pixelsHigh:h bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    rep.size=view.bounds.size;[view cacheDisplayInRect:view.bounds toBitmapImageRep:rep];
    check([[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:path atomically:YES],path);return rep;
}
// Compare actual layer-backed ink with the configured SF Symbol drawn directly.
// Frame checks alone miss glyphs clipped inside otherwise-correct NSButton bounds.
static NSRect inkBounds(NSBitmapImageRep *rep,NSRect region,BOOL dark,BOOL alpha) {
    NSInteger left=rep.pixelsWide,top=rep.pixelsHigh,right=-1,bottom=-1;
    for(NSInteger y=MAX(0,floor(NSMinY(region)));y<MIN(rep.pixelsHigh,ceil(NSMaxY(region)));y++)for(NSInteger x=MAX(0,floor(NSMinX(region)));x<MIN(rep.pixelsWide,ceil(NSMaxX(region)));x++) {
        NSColor *color=[[rep colorAtX:x y:y] colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
        CGFloat light=(color.redComponent+color.greenComponent+color.blueComponent)/3;
        BOOL ink=alpha?color.alphaComponent>.2:color.alphaComponent>.2&&(dark?light>.55:light<.65);
        if(ink){left=MIN(left,x);top=MIN(top,y);right=MAX(right,x);bottom=MAX(bottom,y);}
    }
    return right<left?NSZeroRect:NSMakeRect(left,top,right-left+1,bottom-top+1);
}
static NSRect symbolInk(NSImage *image) {
    NSSize size=image.size;NSInteger w=ceil((size.width+16)*2),h=ceil((size.height+16)*2);
    NSBitmapImageRep *rep=[[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:w pixelsHigh:h bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    [NSGraphicsContext saveGraphicsState];NSGraphicsContext.currentContext=[NSGraphicsContext graphicsContextWithBitmapImageRep:rep];
    CGContextScaleCTM(NSGraphicsContext.currentContext.CGContext,2,2);
    [image drawInRect:NSMakeRect(8,8,size.width,size.height) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:NO hints:nil];
    [NSGraphicsContext restoreGraphicsState];return inkBounds(rep,NSMakeRect(0,0,w,h),NO,YES);
}
static NSDictionary *verifySymbolInk(NotesUIController *c,NSBitmapImageRep *pixels,NSString *key,BOOL dark) {
    NSMutableDictionary *metrics=[NSMutableDictionary dictionary];
    for(NSString *action in c.buttons) {
        NotesUIButton *b=c.buttons[action];if(b.hiddenOrHasHiddenAncestor || !b.image || b.imagePosition!=NSImageOnly)continue;
        NSRect frame=rootRect(c,b);NSRect actual=inkBounds(pixels,NSMakeRect(frame.origin.x*2,frame.origin.y*2,frame.size.width*2,frame.size.height*2),dark,NO),expected=symbolInk(b.image);
        check(expected.size.height>0,@"configured symbol reference has ink");
        check(actual.size.height>=expected.size.height*.9-2,[key stringByAppendingFormat:@" %@ vertical symbol clipping: %.0f / %.0f",action,actual.size.height,expected.size.height]);
        check(actual.size.width>=expected.size.width*.9-2,[key stringByAppendingFormat:@" %@ horizontal symbol clipping: %.0f / %.0f",action,actual.size.width,expected.size.width]);
        metrics[action]=@{@"actual":rectJSON(actual),@"reference":rectJSON(expected)};
    }
    return metrics;
}
#import <objc/runtime.h>
static NSMutableArray<NSString *> *retainedMutations;
@interface ObservedNotesUIButton : NotesUIButton
@end
@implementation ObservedNotesUIButton
- (void)record:(NSString *)key {[retainedMutations addObject:[NSString stringWithFormat:@"%@.%@",self.notesAction,key]];}
- (void)setImage:(NSImage *)value {[self record:@"image"];[super setImage:value];}
- (void)setFont:(NSFont *)value {[self record:@"font"];[super setFont:value];}
- (void)setSymbolConfiguration:(NSImageSymbolConfiguration *)value {[self record:@"symbolConfiguration"];[super setSymbolConfiguration:value];}
- (void)setHidden:(BOOL)value {[self record:@"hidden"];[super setHidden:value];}
- (void)setFrame:(NSRect)value {[self record:@"frame"];[super setFrame:value];}
- (void)setEnabled:(BOOL)value {[self record:@"enabled"];[super setEnabled:value];}
- (void)setState:(NSControlStateValue)value {[self record:@"state"];[super setState:value];}
- (void)setNotesSelected:(BOOL)value {[self record:@"notesSelected"];[super setNotesSelected:value];}
- (void)setContentTintColor:(NSColor *)value {[self record:@"contentTintColor"];[super setContentTintColor:value];}
@end
static NSDictionary *verifyRetainedFeedback(NotesUIController *c,NSDictionary *state,NSString *output,NSString *theme) {
    retainedMutations=[NSMutableArray array];
    for(NSButton *button in c.buttons.allValues)object_setClass(button,ObservedNotesUIButton.class);
    c.buttons[@"format"].notesHovered=YES;
    NSMutableDictionary *next=[state mutableCopy];next[@"revision"]=@900;
    check([c apply:next]==nil,@"context revision accepted");[c information];
    check(retainedMutations.count==0,[NSString stringWithFormat:@"revision/inspect mutated retained buttons: %@",retainedMutations]);
    check(c.buttons[@"format"].notesHovered,@"revision preserves hover");
    next=[next mutableCopy];next[@"folderCount"]=@124;next[@"revision"]=@901;check([c apply:next]==nil,@"count update accepted");
    check(retainedMutations.count==0,@"count-only update must not refresh buttons");
    next=[next mutableCopy];next[@"tableFocused"]=@YES;next[@"revision"]=@902;check([c apply:next]==nil,@"table focus accepted");
    check(retainedMutations.count==1 && [retainedMutations.firstObject isEqual:@"table.image"],[NSString stringWithFormat:@"only table symbol should update: %@",retainedMutations]);
    for(NSButton *button in c.buttons.allValues)object_setClass(button,NotesUIButton.class);
    retainedMutations=nil;
    check([c apply:state]==nil,@"restore retained baseline");
    NSMutableArray *captures=[NSMutableArray array];
    for(NSString *action in @[@"format",@"settings"]) {
        NotesUIButton *button=c.buttons[action];button.notesHovered=NO;
        for(NSString *phase in @[@"idle",@"hover",@"pressed",@"open",@"selected",@"disabled"]) {
            // NSMenu keeps the triggering cell highlighted while tracking.
            button.cell.highlighted=[phase isEqual:@"pressed"] || [phase isEqual:@"open"];
            button.notesHovered=[phase isEqual:@"hover"];
            button.notesMenuOpen=[phase isEqual:@"open"];
            button.state=[phase isEqual:@"selected"]?NSControlStateValueOn:NSControlStateValueOff;
            button.notesSelected=[phase isEqual:@"selected"];
            button.enabled=![phase isEqual:@"disabled"];
            check([button.notesFeedbackState isEqual:phase],@"shared native button feedback state");
            NSString *name=[NSString stringWithFormat:@"feedback-%@-%@-%@.png",theme,action,phase];
            snapshot(c.root,[output stringByAppendingPathComponent:name],2);[captures addObject:name];
        }
        button.enabled=YES;button.state=NSControlStateValueOff;button.notesSelected=NO;button.notesHovered=NO;
        button.cell.state=NSControlStateValueOn;
        check([button.notesFeedbackState isEqual:@"idle"],@"momentary tracking state must not become semantic selection");
        button.cell.state=NSControlStateValueOff;
        check([button sendAction:button.action to:button.target],@"button activation delivered");
        check([button.notesFeedbackState isEqual:@"activated"],@"post-activation acknowledgment visible");
        snapshot(c.root,[output stringByAppendingPathComponent:[NSString stringWithFormat:@"feedback-%@-%@-activated.png",theme,action]],2);
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.21]];
        check([button.notesFeedbackState isEqual:@"idle"],@"activation feedback expires");
    }
    return @{@"theme":theme,@"revisionAndInspectMutations":@0,@"countOnlyMutations":@0,@"tableFocusMutations":@[@"table.image"],@"captures":captures};
}
int main(int argc,const char **argv) {@autoreleasepool {
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
    NSString *output=argc>1?[NSString stringWithUTF8String:argv[1]]:@"artifacts/appearance-density/native";
    [NSFileManager.defaultManager createDirectoryAtPath:output withIntermediateDirectories:YES attributes:nil error:nil];
    events=[NSMutableArray array];NSMutableArray *results=[NSMutableArray array],*layoutResults=[NSMutableArray array],*transitions=[NSMutableArray array],*feedback=[NSMutableArray array];
    NSArray *sizes=@[@12,@13,@14,@16,@18],*names=@[@"tiny",@"small",@"medium",@"large",@"huge"];
    for(NSString *theme in @[@"light",@"dark"])for(NSNumber *width in @[@1000,@1280,@1560,@1920])for(NSUInteger i=0;i<sizes.count;i++) {
        @autoreleasepool {
        CGFloat s=[sizes[i] doubleValue]/18.,w=width.doubleValue;
        NSString *key=[NSString stringWithFormat:@"%@-%@-%@",theme,width,names[i]];
        NSWindow *window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,w,720) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable|NSWindowStyleMaskFullSizeContentView backing:NSBackingStoreBuffered defer:NO];
        window.contentView.wantsLayer=YES;window.releasedWhenClosed=NO;window.titlebarAppearsTransparent=YES;window.titleVisibility=NSWindowTitleHidden;
        NSMutableArray *actions=[NSMutableArray array];
        for(NSString *action in @[@"newFolder",@"toggleSidebar",@"viewOptions",@"newNote",@"format",@"checklist",@"table",@"attachment",@"recordAudio",@"insertTag",@"share",@"more",@"settings"])[actions addObject:@{@"action":action,@"enabled":@YES,@"selected":@NO}];
        NSDictionary *state=@{@"revision":@1,@"layout":@"threeColumn",@"appearance":theme,@"fontScale":@(s),@"folderTitle":@"iCloud 全部",@"folderCount":@123,@"columns":@{@"sidebarVisible":@YES,@"sidebarWidth":@(round((w<=1100?220:272)*s)),@"listWidth":@(round((w<=1100?280:390)*s))},@"actions":actions,@"menus":@[],@"search":@{@"enabled":@YES,@"value":@"",@"acknowledgedEvent":@0}};
        char *json=encoded(state),*reply=notes_ui_bind((__bridge void *)window,"isolated",key.UTF8String,json,NULL,eventTest,releaseTest);free(json);
        NSDictionary *bound=decode(reply);notes_ui_free(reply);check([bound[@"ok"] boolValue],[key stringByAppendingFormat:@" bind: %@",bound]);
        NotesUIController *c=controllers[key];NotesUISearchSurface *surface=(id)c.groups[@"search"];
        if(w==1280 && i==2)[feedback addObject:verifyRetainedFeedback(c,state,output,theme)];
        check(fabs(NSHeight(c.root.bounds)-round(68*s))<0.01,@"header height");
        check(c.search.focusRingType==NSFocusRingTypeNone && c.search.cell.focusRingType==NSFocusRingTypeNone,@"inner focus rings disabled");
        check(fabs(NSHeight(surface.frame)-40*s)<.01,@"search height follows density");
        NSMutableDictionary *frames=[NSMutableDictionary dictionary];NSMutableArray *occupied=[NSMutableArray array];
        for(NSString *action in c.buttons) {
            NotesUIButton *b=c.buttons[action];if(b.hiddenOrHasHiddenAncestor)continue;
            NSRect r=rootRect(c,b);check(NSMinX(r)>=-0.1 && NSMaxX(r)<=w+.1,[key stringByAppendingFormat:@" %@ outside window",action]);
            for(NSDictionary *prev in occupied)check(!NSIntersectsRect(NSInsetRect(r,.1,.1),NSRectFromString(prev[@"rect"])),[key stringByAppendingFormat:@" overlap: %@ / %@",action,prev[@"action"]]);
            [occupied addObject:@{@"action":action,@"rect":NSStringFromRect(r)}];frames[action]=rectJSON(r);
        }
        for(NSString *action in @[@"toggleSidebar",@"newFolder"])if(frames[action])check([frames[action][@"x"] doubleValue]>=c.root.trafficWidth-.1,@"traffic light hit area remains free");
        NSButton *close=[window standardWindowButton:NSWindowCloseButton];NSRect closeRect=[c.root convertRect:close.bounds fromView:close];
        check(fabs(NSMidY(closeRect)-NSHeight(c.root.bounds)/2)<.1,@"traffic lights vertically centered");
        NSRect searchRect=rootRect(c,surface);
        check(NSWidth(searchRect)>=110*s-1,[key stringByAppendingFormat:@" search too small: %@",NSStringFromRect(searchRect)]);
        for(NSDictionary *prev in occupied)check(!NSIntersectsRect(NSInsetRect(searchRect,.1,.1),NSRectFromString(prev[@"rect"])),[key stringByAppendingFormat:@" search overlaps %@",prev[@"action"]]);
        for(NSString *action in @[@"format",@"checklist",@"table",@"attachment",@"recordAudio",@"insertTag",@"share",@"more"])check(frames[action]!=nil || [c.overflow containsObject:action],@"all tools reachable");
        NSRect text=c.search.searchTextBounds,searchButton=c.search.searchButtonBounds;
        check(NSMinX(text)>NSMaxX(searchButton),@"search icon / text separation");
        NSBitmapImageRep *pixels=nil;
        for(NSNumber *dpr in @[@1,@2])pixels=snapshot(c.root,[output stringByAppendingPathComponent:[key stringByAppendingFormat:@"-normal-%@x.png",dpr]],dpr.doubleValue);
        NSDictionary *symbolMetrics=verifySymbolInk(c,pixels,key,[theme isEqual:@"dark"]);
        for(NotesUIButton *button in c.buttons.allValues)check(button.symbolConfiguration!=nil&&button.imageScaling==NSImageScaleProportionallyDown,@"explicit button symbol configuration and scaling");
        // Exercise the production focus entry point and real AppKit field editor.
        reply=notes_ui_focus_search(key.UTF8String);NSDictionary *focused=decode(reply);notes_ui_free(reply);check([focused[@"ok"] boolValue],@"focus API");
        check(c.search.currentEditor!=nil,@"real AppKit field editor");
        // AppKit emits begin-editing only once editing starts; caret focus must still be drawn.
        check(surface.focused,[key stringByAppendingString:@" empty focus border missing"]);
        check(NSEqualRects(searchRect,rootRect(c,surface)),@"focus must preserve bounds");
        snapshot(c.root,[output stringByAppendingPathComponent:[key stringByAppendingString:@"-focus-2x.png"]],2);
        NSTextView *editor=(id)c.search.currentEditor;[editor insertText:@"产品设计" replacementRange:NSMakeRange(0,editor.string.length)];
        check([c.search.stringValue isEqual:@"产品设计"],@"native search typing");
        check(NSMaxX(c.search.searchTextBounds)<=NSMinX(c.search.cancelButtonBounds),@"search text / clear separation");
        snapshot(c.root,[output stringByAppendingPathComponent:[key stringByAppendingString:@"-typed-2x.png"]],2);
        [window makeFirstResponder:nil];check(!surface.focused,@"blur clears border");
        surface.hovered=YES;surface.needsDisplay=YES;
        snapshot(c.root,[output stringByAppendingPathComponent:[key stringByAppendingString:@"-hover-2x.png"]],2);
        [results addObject:@{@"case":key,@"scale":@(s),@"headerHeight":@(NSHeight(c.root.bounds)),@"search":rectJSON(searchRect),@"textBounds":rectJSON(text),@"controls":frames,@"symbolInk":symbolMetrics,@"overflow":c.overflow,@"focus":@"passed",@"renderDPR":@[@1,@2]}];
        NSUInteger revision=1;
        for(NSString *layout in @[@"galleryBrowse",@"galleryExpanded",@"independentNote",@"threeColumn"]) {
            NSMutableDictionary *next=[state mutableCopy];next[@"revision"]=@(++revision);next[@"layout"]=layout;next[@"search"]=@{@"enabled":@YES,@"value":c.search.stringValue,@"acknowledgedEvent":@(c.searchSequence)};
            if([layout isEqual:@"independentNote"])next[@"search"]=NSNull.null;
            if([layout isEqual:@"threeColumn"]) {NSMutableDictionary *columns=[state[@"columns"] mutableCopy];columns[@"sidebarVisible"]=@NO;next[@"columns"]=columns;}
            json=encoded(next);reply=notes_ui_update(key.UTF8String,json);free(json);NSDictionary *updated=decode(reply);notes_ui_free(reply);check([updated[@"ok"] boolValue],@"alternate layouts apply");
            NSMutableArray *controlRects=[NSMutableArray array];
            for(NotesUIButton *b in c.buttons.allValues)if(!b.hiddenOrHasHiddenAncestor) {
                NSRect rect=rootRect(c,b);check(NSMinX(rect)>=-.1&&NSMaxX(rect)<=w+.1,[key stringByAppendingFormat:@" %@ %@ outside window",layout,b.notesAction]);
                for(NSString *previous in controlRects)check(!NSIntersectsRect(NSInsetRect(rect,.1,.1),NSRectFromString(previous)),[key stringByAppendingFormat:@" %@ overlapping tools",layout]);
                [controlRects addObject:NSStringFromRect(rect)];
            }
            if(!surface.hiddenOrHasHiddenAncestor)for(NSString *previous in controlRects)check(!NSIntersectsRect(NSInsetRect(rootRect(c,surface),.1,.1),NSRectFromString(previous)),@"alternate layout search overlaps");
            if(!c.title.hidden)for(NSString *previous in controlRects)check(!NSIntersectsRect(NSInsetRect(c.title.frame,.1,.1),NSRectFromString(previous)),@"alternate layout title overlaps");
            [layoutResults addObject:@{@"case":key,@"layout":layout,@"overflow":c.overflow}];
            if([names[i] isEqual:@"medium"]&&width.intValue==1280)snapshot(c.root,[output stringByAppendingPathComponent:[key stringByAppendingFormat:@"-%@-2x.png",layout]],2);
        }
        if(i==2)for(NSNumber *target in @[@4,@0,@1,@2,@3,@1,@4,@2]) {
            NSUInteger targetIndex=target.unsignedIntegerValue;CGFloat targetScale=[sizes[targetIndex] doubleValue]/18.;
            NSMutableDictionary *next=[state mutableCopy];next[@"revision"]=@(++revision);next[@"fontScale"]=@(targetScale);next[@"columns"]=@{@"sidebarVisible":@YES,@"sidebarWidth":@(round((w<=1100?220:272)*targetScale)),@"listWidth":@(round((w<=1100?280:390)*targetScale))};
            next[@"search"]=@{@"enabled":@YES,@"value":@"",@"acknowledgedEvent":@(c.searchSequence)};
            json=encoded(next);reply=notes_ui_update(key.UTF8String,json);free(json);NSDictionary *updated=decode(reply);notes_ui_free(reply);check([updated[@"ok"] boolValue],@"retained density change");
            NSString *transitionKey=[key stringByAppendingFormat:@"-switch-%lu-%@",(unsigned long)revision,names[targetIndex]];
            pixels=snapshot(c.root,[output stringByAppendingPathComponent:[transitionKey stringByAppendingString:@"-2x.png"]],2);
            [transitions addObject:@{@"case":transitionKey,@"symbolInk":verifySymbolInk(c,pixels,transitionKey,[theme isEqual:@"dark"])}];
        }
        notes_ui_destroy(key.UTF8String);[window close];
        }
    }
    check(events.count>0,@"search callbacks delivered");
    NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"cases":results,@"alternateLayouts":layoutResults,@"densityTransitions":transitions,@"layerBacked":@YES,@"feedback":feedback,@"events":@(events.count),@"failures":@0} options:NSJSONWritingPrettyPrinted error:nil];
    [data writeToFile:[output stringByAppendingPathComponent:@"native-check.json"] atomically:YES];
    printf("Passed %lu isolated native geometry, focus, typing and 1x/2x render cases\n",(unsigned long)results.count);
}return 0;}
