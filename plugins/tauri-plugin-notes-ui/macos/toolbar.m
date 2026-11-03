#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>

typedef void (*NotesUIEvent)(void *, const char *);
typedef void (*NotesUIRelease)(void *);
static NSMutableDictionary<NSString *, id> *controllers;
static NSString * const NotesUIActionKey = @"notes-ui-action";

static char *encoded(NSDictionary *value) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if(!data) return strdup("{\"ok\":false,\"error\":{\"code\":\"native\",\"message\":\"Native JSON encoding failed\"}}");
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
static char *failure(NSString *code,NSString *message) { return encoded(@{@"ok":@NO,@"error":@{@"code":code,@"message":message}}); }
static NSDictionary *decode(const char *json) {
    if(!json) return nil;
    return [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:json length:strlen(json)] options:0 error:nil];
}
static NSString *labelFor(NSString *action,BOOL tableFocused) {
    NSDictionary *labels=@{@"newFolder":@"新建文件夹",@"toggleSidebar":@"显示或隐藏文件夹",@"viewOptions":@"文件夹显示选项",
        @"backToGallery":@"返回画廊",@"newNote":@"新建备忘录",@"format":@"格式",@"checklist":@"核对清单",
        @"table":tableFocused?@"将表格转换为文本":@"插入表格",@"attachment":@"添加附件",@"share":@"共享备忘录",@"more":@"更多备忘录操作"};
    return labels[action];
}
static NSString *symbolFor(NSString *action,BOOL tableFocused) {
    NSDictionary *symbols=@{@"newFolder":@"folder.badge.plus",@"toggleSidebar":@"sidebar.left",@"viewOptions":@"ellipsis",
        @"backToGallery":@"chevron.left",@"newNote":@"square.and.pencil",@"format":@"textformat",@"checklist":@"checklist",
        @"table":tableFocused?@"tablecells.badge.ellipsis":@"tablecells",@"attachment":@"paperclip",@"share":@"square.and.arrow.up",@"more":@"ellipsis"};
    return symbols[action];
}

@interface NotesUIRoot : NSView
@property BOOL reserveTrafficLights;
@end
@implementation NotesUIRoot
- (BOOL)isFlipped {return YES;}
- (BOOL)acceptsFirstResponder {return NO;}
- (NSView *)hitTest:(NSPoint)point {
    NSPoint own=[self convertPoint:point fromView:self.superview];
    if(self.reserveTrafficLights && own.x<88) return nil;
    return [super hitTest:point];
}
- (void)mouseDown:(NSEvent *)event { [self.window performWindowDragWithEvent:event]; }
@end
@interface NotesUIButton : NSButton
@property NSString *notesAction;
@end
@implementation NotesUIButton
- (BOOL)acceptsFirstResponder {return NO;}
- (BOOL)acceptsFirstMouse:(NSEvent *)event {(void)event;return YES;}
@end

@interface NotesUISearchFormatter : NSFormatter
@end
@implementation NotesUISearchFormatter
- (NSString *)stringForObjectValue:(id)object {return [object isKindOfClass:NSString.class]?object:@"";}
- (BOOL)getObjectValue:(out id *)object forString:(NSString *)string errorDescription:(out NSString **)error {
    if(object)*object=string;(void)error;return YES;
}
- (BOOL)isPartialStringValid:(NSString *)partial newEditingString:(NSString **)replacement errorDescription:(NSString **)error {
    (void)replacement;(void)error;unichar zero=0;
    return [partial lengthOfBytesUsingEncoding:NSUTF32LittleEndianStringEncoding]/4<=4096
        && [partial rangeOfString:[NSString stringWithCharacters:&zero length:1]].location==NSNotFound;
}
@end

@interface NotesUIController : NSObject <NSSearchFieldDelegate>
@property (weak) NSWindow *window;
@property NSString *windowLabel;
@property NSString *bindingId;
@property NSDictionary *state;
@property NotesUIRoot *root;
@property NSMutableDictionary<NSString *,NSView *> *groups;
@property NSMutableDictionary<NSString *,NSView *> *contents;
@property NSMutableDictionary<NSString *,NotesUIButton *> *buttons;
@property NSMutableDictionary<NSString *,NSDictionary *> *actionStates;
@property NSMutableDictionary<NSString *,NSMenu *> *menus;
@property NSMenu *activeMenu;
@property NSTextField *title;
@property NSTextField *count;
@property NSSearchField *search;
@property NSArray<NSString *> *overflow;
@property NSArray *symbolFallbacks;
@property NSMutableArray *observers;
@property NSString *material;
@property uint64_t sequence;
@property uint64_t searchSequence;
@property BOOL suppress;
@property BOOL disposed;
@property void *callbackContext;
@property NotesUIEvent callback;
@property NotesUIRelease releaseContext;
- (NSDictionary *)apply:(NSDictionary *)state;
- (NSDictionary *)information;
- (void)layout;
- (void)dispose;
@end

@implementation NotesUIController
- (NSView *)makeGroup:(NSString *)name {
    NSView *content=[[NotesUIRoot alloc] initWithFrame:NSZeroRect];
    NSView *effect=nil;
    if(@available(macOS 26.0,*)) {
        Class cls=NSClassFromString(@"NSGlassEffectView");
        if(cls && [cls instancesRespondToSelector:@selector(setContentView:)] && [cls instancesRespondToSelector:@selector(setStyle:)]
            && [cls instancesRespondToSelector:@selector(setCornerRadius:)]) {
            NSGlassEffectView *glass=[[cls alloc] initWithFrame:NSZeroRect];
            glass.contentView=content; glass.cornerRadius=17;
            glass.style=[self.state[@"glassStyle"] isEqual:@"clear"]?NSGlassEffectViewStyleClear:NSGlassEffectViewStyleRegular;
            effect=glass;
            self.material=[self.state[@"glassStyle"] isEqual:@"clear"]?@"glassClear":@"glassRegular";
        }
    }
    if(!effect) {
        NSVisualEffectView *legacy=[[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
        legacy.material=NSVisualEffectMaterialHeaderView;legacy.blendingMode=NSVisualEffectBlendingModeWithinWindow;
        legacy.state=NSVisualEffectStateFollowsWindowActiveState;legacy.wantsLayer=YES;
        legacy.layer.cornerRadius=17;legacy.layer.masksToBounds=YES;
        [legacy addSubview:content];effect=legacy;self.material=@"legacyHeader";
    }
    content.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    self.groups[name]=effect;self.contents[name]=content;[self.root addSubview:effect];return content;
}
- (void)build {
    self.root=[[NotesUIRoot alloc] initWithFrame:NSZeroRect];self.root.autoresizingMask=NSViewWidthSizable|NSViewMinYMargin;
    self.root.reserveTrafficLights=(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)!=0;
    self.groups=[NSMutableDictionary dictionary];self.contents=[NSMutableDictionary dictionary];self.buttons=[NSMutableDictionary dictionary];
    self.actionStates=[NSMutableDictionary dictionary];self.menus=[NSMutableDictionary dictionary];self.observers=[NSMutableArray array];
    for(NSString *name in @[@"sidebar",@"back",@"view",@"new",@"edit",@"share",@"overflow",@"search"]) [self makeGroup:name];
    NSDictionary *membership=@{@"newFolder":@"sidebar",@"toggleSidebar":@"sidebar",@"backToGallery":@"back",@"viewOptions":@"view",
        @"newNote":@"new",@"format":@"edit",@"checklist":@"edit",@"table":@"edit",@"attachment":@"edit",@"share":@"share",@"more":@"share",@"overflow":@"overflow"};
    for(NSString *action in membership) {
        NotesUIButton *button=[[NotesUIButton alloc] initWithFrame:NSZeroRect];button.notesAction=action;
        [button setButtonType:NSButtonTypeMomentaryPushIn];button.bordered=NO;button.imagePosition=NSImageOnly;
        button.refusesFirstResponder=YES;button.focusRingType=NSFocusRingTypeNone;button.target=self;button.action=@selector(buttonClicked:);
        self.buttons[action]=button;[self.contents[membership[action]] addSubview:button];
    }
    self.buttons[@"overflow"].image=[NSImage imageWithSystemSymbolName:@"ellipsis" accessibilityDescription:@"其他工具"];
    self.buttons[@"overflow"].toolTip=@"其他工具";[self.buttons[@"overflow"] setAccessibilityLabel:@"其他工具"];
    self.title=[NSTextField labelWithString:@""];self.title.font=[NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
    self.title.lineBreakMode=NSLineBreakByTruncatingTail;self.title.maximumNumberOfLines=1;
    self.count=[NSTextField labelWithString:@""];self.count.font=[NSFont systemFontOfSize:11];self.count.textColor=NSColor.secondaryLabelColor;
    [self.root addSubview:self.title];[self.root addSubview:self.count];
    self.search=[[NSSearchField alloc] initWithFrame:NSZeroRect];self.search.delegate=self;
    self.search.formatter=[NotesUISearchFormatter new];
    self.search.placeholderString=@"搜索";self.search.sendsSearchStringImmediately=YES;self.search.sendsWholeSearchString=NO;
    self.search.recentsAutosaveName=nil;self.search.maximumRecents=0;self.search.searchMenuTemplate=nil;
    self.search.bordered=NO;self.search.bezeled=NO;self.search.drawsBackground=NO;
    [self.search setAccessibilityLabel:@"搜索备忘录"];self.search.target=self;self.search.action=@selector(searchCommitted:);
    [self.contents[@"search"] addSubview:self.search];
    [self.window.contentView addSubview:self.root positioned:NSWindowAbove relativeTo:nil];
    __weak NotesUIController *weak=self;
    NSNotificationCenter *center=NSNotificationCenter.defaultCenter;
    for(NSNotificationName name in @[NSWindowDidResizeNotification,NSWindowDidChangeScreenNotification]) {
        [self.observers addObject:[center addObserverForName:name object:self.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;[weak layout];}]];
    }
    for(NSNotificationName name in @[NSWindowDidBecomeKeyNotification,NSWindowDidResignKeyNotification]) {
        [self.observers addObject:[center addObserverForName:name object:self.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;NotesUIController *strong=weak;
            if(strong && !strong.disposed) [strong send:@{@"kind":@"windowActivity",@"active":strong.window.keyWindow?@YES:@NO}];}]];
    }
    [self.observers addObject:[center addObserverForName:NSWindowWillCloseNotification object:self.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;
        NotesUIController *strong=weak;if(strong){[strong dispose];[controllers removeObjectForKey:strong.bindingId];}}]];
}
- (NSMenu *)menuEntries:(NSArray *)entries owner:(NSString *)owner {
    NSMenu *menu=[[NSMenu alloc] initWithTitle:@""];menu.autoenablesItems=NO;
    for(NSDictionary *entry in entries) {
        if([entry[@"kind"] isEqual:@"separator"]) {[menu addItem:NSMenuItem.separatorItem];continue;}
        NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:entry[@"label"] action:nil keyEquivalent:@""];
        if([entry[@"kind"] isEqual:@"submenu"]) {item.submenu=[self menuEntries:entry[@"items"] owner:owner];}
        else {item.target=self;item.action=@selector(menuClicked:);item.enabled=[entry[@"enabled"] boolValue];
            item.state=[entry[@"selected"] boolValue]?NSControlStateValueOn:NSControlStateValueOff;
            item.representedObject=@{@"owner":owner,@"command":entry[@"command"]};}
        [menu addItem:item];
    }
    return menu;
}
- (NSDictionary *)apply:(NSDictionary *)state {
    NSDictionary *searchState=state[@"search"];
    BOOL hasSearch=searchState && (id)searchState!=NSNull.null;
    if(hasSearch && [searchState[@"acknowledgedEvent"] unsignedLongLongValue]<self.searchSequence)
        return @{@"code":@"stale_search",@"message":@"请先合并最新原生搜索事件"};
    if(hasSearch && self.search.currentEditor && [self.search.currentEditor isKindOfClass:NSTextView.class]) {
        NSTextView *editor=(NSTextView *)self.search.currentEditor;
        if(editor.hasMarkedText && ![searchState[@"value"] isEqual:self.search.stringValue])
            return @{@"code":@"search_composition",@"message":@"搜索正在输入法组字，请等待提交后更新文字"};
    }
    // Resolve every symbol before changing existing controls. The only documented icon fallback is
    // the focused-table badge to tablecells on an older runtime where the badge does not exist.
    NSMutableDictionary *images=[NSMutableDictionary dictionary];NSMutableArray *fallbacks=[NSMutableArray array];
    for(NSDictionary *item in state[@"actions"]) {
        NSString *action=item[@"action"];NSString *symbol=symbolFor(action,[state[@"tableFocused"] boolValue]);
        NSString *label=labelFor(action,[state[@"tableFocused"] boolValue]);
        NSImage *image=[NSImage imageWithSystemSymbolName:symbol accessibilityDescription:label];
        if(!image && [symbol isEqual:@"tablecells.badge.ellipsis"]) {image=[NSImage imageWithSystemSymbolName:@"tablecells" accessibilityDescription:label];
            [fallbacks addObject:@{@"action":action,@"requested":symbol,@"used":@"tablecells"}];}
        if(!image) return @{@"code":@"symbol_unavailable",@"message":[@"系统符号不可用：" stringByAppendingString:symbol]};
        CGFloat point=([@[@"newNote",@"table",@"share"] containsObject:action])?16.5:17;
        image=[image imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:point weight:NSFontWeightRegular scale:NSImageSymbolScaleMedium]];
        if(!image) return @{@"code":@"symbol_unavailable",@"message":@"系统符号配置失败"};image.template=YES;images[action]=image;
    }
    self.suppress=YES;
    [self.activeMenu cancelTracking];
    for(NSMenu *menu in self.menus.allValues) [menu cancelTracking];
    self.state=state;self.symbolFallbacks=fallbacks;
    [self.actionStates removeAllObjects];[self.menus removeAllObjects];
    for(NSDictionary *item in state[@"actions"]) self.actionStates[item[@"action"]]=item;
    for(NSDictionary *menu in state[@"menus"]) self.menus[menu[@"owner"]]=[self menuEntries:menu[@"items"] owner:menu[@"owner"]];
    for(NSString *action in self.buttons) {
        if([action isEqual:@"overflow"])continue;
        NotesUIButton *button=self.buttons[action];NSDictionary *item=self.actionStates[action];button.hidden=item==nil;
        button.enabled=[item[@"enabled"] boolValue];button.state=[item[@"selected"] boolValue]?NSControlStateValueOn:NSControlStateValueOff;
        if(item) {button.image=images[action];NSString *label=labelFor(action,[state[@"tableFocused"] boolValue]);button.toolTip=label;[button setAccessibilityLabel:label];}
        button.contentTintColor=[item[@"selected"] boolValue]?NSColor.systemYellowColor:NSColor.labelColor;
    }
    self.title.stringValue=state[@"folderTitle"];[self.title setAccessibilityLabel:state[@"folderTitle"]];
    self.count.stringValue=[NSString stringWithFormat:@"%@ 个备忘录",state[@"folderCount"]];
    [self.count setAccessibilityLabel:self.count.stringValue];
    if(hasSearch) {self.search.enabled=[searchState[@"enabled"] boolValue];
        if(![self.search.stringValue isEqual:searchState[@"value"]]) self.search.stringValue=searchState[@"value"];}
    else {self.search.enabled=NO;}
    if(@available(macOS 26.0,*)) {
        for(NSView *view in self.groups.allValues) if([view isKindOfClass:NSClassFromString(@"NSGlassEffectView")]) {
            ((NSGlassEffectView *)view).style=[state[@"glassStyle"] isEqual:@"clear"]?NSGlassEffectViewStyleClear:NSGlassEffectViewStyleRegular;
            self.material=[state[@"glassStyle"] isEqual:@"clear"]?@"glassClear":@"glassRegular";
        }
    }
    [self layout];self.suppress=NO;return nil;
}
- (void)placeGroup:(NSString *)name x:(CGFloat)x width:(CGFloat)width actions:(NSArray<NSString *> *)actions {
    NSView *group=self.groups[name];group.hidden=width<=0;
    group.frame=NSMakeRect(x,9,MAX(0,width),34);self.contents[name].frame=NSMakeRect(0,0,MAX(0,width),34);
    CGFloat itemWidth=actions.count?width/actions.count:0;
    for(NSUInteger i=0;i<actions.count;i++) {NotesUIButton *button=self.buttons[actions[i]];button.hidden=NO;button.frame=NSMakeRect(i*itemWidth,0,itemWidth,34);}
}
- (CGFloat)widthFor:(NSArray *)visible search:(CGFloat)searchWidth overflow:(BOOL)overflow {
    CGFloat width=searchWidth;BOOL any=searchWidth>0;
    for(NSArray *group in @[@[@"newNote"],@[@"format",@"checklist",@"table",@"attachment"],@[@"share",@"more"]]) {
        NSUInteger count=0;for(NSString *a in group)if([visible containsObject:a])count++;
        if(count){width+=(any?14:0)+(group.count==1?34:40*count);any=YES;}
    }
    if(overflow)width+=(any?10:0)+34;return width;
}
- (void)layout {
    if(self.disposed || !self.window.contentView)return;
    NSView *parent=self.window.contentView;NSRect bounds=parent.bounds;CGFloat w=NSWidth(bounds);
    self.root.frame=NSMakeRect(NSMinX(bounds),parent.flipped?NSMinY(bounds):NSMaxY(bounds)-52,w,52);
    for(NSView *g in self.groups.allValues)g.hidden=YES;
    for(NotesUIButton *b in self.buttons.allValues)b.hidden=YES;
    BOOL full=(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)!=0;self.root.reserveTrafficLights=full;
    CGFloat traffic=full?94:12;NSDictionary *columns=self.state[@"columns"];
    BOOL sidebar=[columns[@"sidebarVisible"] boolValue];CGFloat side=sidebar?[columns[@"sidebarWidth"] doubleValue]:0;
    NSString *layout=self.state[@"layout"];BOOL three=[layout isEqual:@"threeColumn"];BOOL gallery=[layout isEqual:@"galleryExpanded"];
    CGFloat editorStart=three?side+[columns[@"listWidth"] doubleValue]:(gallery?side:traffic);
    CGFloat titleX=three?(side>0?side+16:traffic+8):0;
    NSMutableArray *specialHidden=[NSMutableArray array];
    if(sidebar && ![layout isEqual:@"independentNote"]) {
        NSMutableArray *sideActions=[NSMutableArray array];for(NSString *a in @[@"newFolder",@"toggleSidebar"])if(self.actionStates[a])[sideActions addObject:a];
        CGFloat sw=sideActions.count*36;
        if(traffic+sw<side-6) [self placeGroup:@"sidebar" x:traffic width:sw actions:sideActions]; else [specialHidden addObjectsFromArray:sideActions];
    } else for(NSString *a in @[@"newFolder",@"toggleSidebar"])if(self.actionStates[a])[specialHidden addObject:a];
    if(gallery) {
        CGFloat backX=MAX(side+12,traffic+8);
        if(self.actionStates[@"backToGallery"]) [self placeGroup:@"back" x:backX width:34 actions:@[@"backToGallery"]];
        titleX=backX+46;editorStart=titleX+140;
    }
    CGFloat baseStart=editorStart;
    editorStart=MIN(editorStart+12,MAX(traffic+8,w-180));
    CGFloat available=MAX(0,w-editorStart-12);
    NSDictionary *searchState=self.state[@"search"];BOOL hasSearch=searchState && (id)searchState!=NSNull.null;
    CGFloat searchWidth=hasSearch?MIN(210,MAX(90,available*.34)):0;
    NSMutableArray *visible=[NSMutableArray array];for(NSString *a in @[@"newNote",@"format",@"checklist",@"table",@"attachment",@"share",@"more"])if(self.actionStates[a])[visible addObject:a];
    NSMutableArray *hidden=[specialHidden mutableCopy];
    for(NSString *drop in @[@"share",@"attachment",@"table",@"checklist",@"format",@"newNote",@"more"]) {
        if([self widthFor:visible search:searchWidth overflow:hidden.count>0]<=available)break;
        if([visible containsObject:drop]){[visible removeObject:drop];[hidden addObject:drop];}
    }
    if(three && self.actionStates[@"viewOptions"]) {
        CGFloat viewX=MIN(baseStart-40,editorStart-42);
        if(viewX>titleX+30) [self placeGroup:@"view" x:viewX width:34 actions:@[@"viewOptions"]];else[hidden addObject:@"viewOptions"];
    } else if(self.actionStates[@"viewOptions"]) [hidden addObject:@"viewOptions"];
    self.overflow=hidden;
    CGFloat total=[self widthFor:visible search:searchWidth overflow:hidden.count>0];
    if(gallery)editorStart=MAX(editorStart,w-total-12);
    CGFloat right=w-12;
    if(hasSearch) {right-=searchWidth;[self placeGroup:@"search" x:right width:searchWidth actions:@[]];self.search.frame=NSMakeRect(10,3,MAX(1,searchWidth-20),28);right-=14;}
    if(hidden.count){right-=34;[self placeGroup:@"overflow" x:right width:34 actions:@[@"overflow"]];right-=10;}
    NSMutableArray *share=[NSMutableArray array];for(NSString *a in @[@"share",@"more"])if([visible containsObject:a])[share addObject:a];
    if(share.count){CGFloat width=share.count*40;right-=width;[self placeGroup:@"share" x:right width:width actions:share];right-=14;}
    CGFloat left=editorStart;
    if([visible containsObject:@"newNote"]){[self placeGroup:@"new" x:left width:34 actions:@[@"newNote"]];left+=48;}
    NSMutableArray *edit=[NSMutableArray array];for(NSString *a in @[@"format",@"checklist",@"table",@"attachment"])if([visible containsObject:a])[edit addObject:a];
    if(edit.count)[self placeGroup:@"edit" x:left width:edit.count*40 actions:edit];
    CGFloat titleRight=three?MIN(baseStart-46,editorStart-12):editorStart-12;
    CGFloat titleWidth=MAX(0,titleRight-titleX);
    self.title.hidden=self.count.hidden=(!three&&!gallery)||titleWidth<24;
    self.title.frame=NSMakeRect(titleX,9,titleWidth,18);self.count.frame=NSMakeRect(titleX,28,titleWidth,15);
}
- (NSDictionary *)information {
    [self layout];
    return @{@"material":self.material,@"reservedTop":@52,@"contentWidth":@(NSWidth(self.window.contentView.bounds)),
        @"active":self.window.keyWindow?@YES:@NO,@"overflowActions":self.overflow?:@[],@"searchSequence":@(self.searchSequence),
        @"fullSizeContent":(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)?@YES:@NO,@"symbolFallbacks":self.symbolFallbacks?:@[],
        @"windowNumber":@(self.window.windowNumber),@"scaleFactor":@(self.window.backingScaleFactor)};
}
- (void)send:(NSDictionary *)intent {
    if(self.disposed || self.suppress || !self.callback)return;
    self.sequence++;
    if([intent[@"kind"] isEqual:@"search"])self.searchSequence=self.sequence;
    NSDictionary *event=@{@"windowLabel":self.windowLabel,@"bindingId":self.bindingId,@"stateRevision":self.state[@"revision"],@"sequence":@(self.sequence),@"intent":intent};
    NSData *data=[NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    if(data){NSString *text=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];self.callback(self.callbackContext,text.UTF8String);}
}
- (void)buttonClicked:(NotesUIButton *)button {
    NSString *action=button.notesAction;
    if([action isEqual:@"overflow"]) {
        NSMenu *overflow=[[NSMenu alloc] initWithTitle:@"其他工具"];overflow.autoenablesItems=NO;
        for(NSString *a in self.overflow) {
            NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:labelFor(a,[self.state[@"tableFocused"] boolValue]) action:@selector(overflowClicked:) keyEquivalent:@""];
            item.target=self;item.representedObject=a;item.enabled=[self.actionStates[a][@"enabled"] boolValue];
            item.state=[self.actionStates[a][@"selected"] boolValue]?NSControlStateValueOn:NSControlStateValueOff;
            if(self.menus[a])item.submenu=self.menus[a];[overflow addItem:item];
        }
        NotesUIController *strong=self;strong.activeMenu=overflow;
        [overflow popUpMenuPositioningItem:nil atLocation:NSMakePoint(0,34) inView:button];strong.activeMenu=nil;return;
    }
    if(![self.actionStates[action][@"enabled"] boolValue])return;
    NSMenu *menu=self.menus[action];
    if(menu){NotesUIController *strong=self;strong.activeMenu=menu;[menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(0,34) inView:button];strong.activeMenu=nil;}
    else[self send:@{@"kind":@"action",@"action":action}];
}
- (void)overflowClicked:(NSMenuItem *)item {
    NSString *a=item.representedObject;if([self.actionStates[a][@"enabled"] boolValue])[self send:@{@"kind":@"action",@"action":a}];
}
- (void)menuClicked:(NSMenuItem *)item {
    if(!item.enabled)return;NSDictionary *represented=item.representedObject;
    [self send:@{@"kind":@"menu",@"owner":represented[@"owner"],@"command":represented[@"command"]}];
}
- (void)controlTextDidChange:(NSNotification *)notification {
    if(notification.object!=self.search||!self.search.enabled)return;
    NSTextView *editor=(NSTextView *)self.search.currentEditor;
    // Marked text is not a committed query. AppKit sends another change on composition commit.
    if([editor isKindOfClass:NSTextView.class]&&editor.hasMarkedText)return;
    [self send:@{@"kind":@"search",@"phase":@"change",@"value":self.search.stringValue}];
}
- (void)searchCommitted:(NSSearchField *)sender {
    if(!sender.enabled)return;
    if([sender.currentEditor isKindOfClass:NSTextView.class]&&[(NSTextView *)sender.currentEditor hasMarkedText])return;
    // NSSearchField also invokes action during immediate typing; only Return is a commit.
    NSEvent *event=NSApp.currentEvent;
    if(event.type==NSEventTypeKeyDown && (event.keyCode==36||event.keyCode==76))
        [self send:@{@"kind":@"search",@"phase":@"commit",@"value":sender.stringValue}];
}
- (BOOL)control:(NSControl *)control textView:(NSTextView *)textView doCommandBySelector:(SEL)selector {
    (void)textView;
    if(control==self.search && selector==@selector(cancelOperation:)) {
        if(textView.hasMarkedText)return NO;
        [self send:@{@"kind":@"search",@"phase":@"cancel",@"value":self.search.stringValue}];return YES;
    }return NO;
}
- (void)dispose {
    if(self.disposed)return;self.disposed=YES;self.suppress=YES;
    for(id observer in self.observers)[NSNotificationCenter.defaultCenter removeObserver:observer];[self.observers removeAllObjects];
    for(NSMenu *menu in self.menus.allValues)[menu cancelTracking];
    [self.activeMenu cancelTracking];self.activeMenu=nil;
    for(NSButton *button in self.buttons.allValues){button.target=nil;button.action=NULL;}
    self.search.delegate=nil;self.search.target=nil;self.search.action=NULL;
    [self.root removeFromSuperview];self.root=nil;
    if(self.releaseContext && self.callbackContext){void *context=self.callbackContext;self.callbackContext=NULL;self.releaseContext(context);}
    self.callback=NULL;self.releaseContext=NULL;
}
- (void)dealloc {[self dispose];}
@end

char *notes_ui_bind(void *rawWindow,const char *label,const char *binding,const char *json,void *context,NotesUIEvent callback,NotesUIRelease release) {
    if(!NSThread.isMainThread){release(context);return failure(@"thread",@"AppKit 必须在主线程执行");}
    if(!controllers)controllers=[NSMutableDictionary dictionary];
    NotesUIController *controller=nil;
    @try {
        NSWindow *window=(__bridge NSWindow *)rawWindow;
        if(!window || !window.contentView){release(context);return failure(@"window",@"窗口内容视图不存在");}
        NSDictionary *state=decode(json);if(!state){release(context);return failure(@"invalid_state",@"顶部状态解析失败");}
        controller=[NotesUIController new];controller.callbackContext=context;controller.callback=callback;controller.releaseContext=release;
        controller.window=window;controller.windowLabel=[NSString stringWithUTF8String:label];controller.bindingId=[NSString stringWithUTF8String:binding];controller.state=state;
        [controller build];NSDictionary *error=[controller apply:state];
        if(error){[controller dispose];return encoded(@{@"ok":@NO,@"error":error});}
        controllers[controller.bindingId]=controller;return encoded(@{@"ok":@YES,@"native":[controller information]});
    }@catch(NSException *exception){if(controller)[controller dispose];else release(context);return failure(@"native",exception.reason?:@"创建原生顶部失败");}
}
char *notes_ui_update(const char *binding,const char *json) {
    if(!NSThread.isMainThread)return failure(@"thread",@"AppKit 必须在主线程执行");
    @try {NotesUIController *controller=controllers[[NSString stringWithUTF8String:binding]];
        if(!controller||controller.disposed)return failure(@"stale_binding",@"原生顶部绑定不存在");
        NSDictionary *state=decode(json);if(!state)return failure(@"invalid_state",@"顶部状态解析失败");
        NSDictionary *error=[controller apply:state];if(error)return encoded(@{@"ok":@NO,@"error":error});
        return encoded(@{@"ok":@YES,@"native":[controller information]});
    }@catch(NSException *exception){return failure(@"native",exception.reason?:@"更新原生顶部失败");}
}
char *notes_ui_inspect(const char *binding) {
    if(!NSThread.isMainThread)return failure(@"thread",@"AppKit 必须在主线程执行");
    NotesUIController *controller=controllers[[NSString stringWithUTF8String:binding]];
    if(!controller||controller.disposed)return failure(@"stale_binding",@"原生顶部绑定不存在");
    return encoded(@{@"ok":@YES,@"native":[controller information]});
}
void notes_ui_destroy(const char *binding) {
    if(!NSThread.isMainThread)return;
    NSString *key=[NSString stringWithUTF8String:binding];NotesUIController *controller=controllers[key];[controller dispose];[controllers removeObjectForKey:key];
}
void notes_ui_free(char *value){free(value);}
