#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import "format.h"
#import "menu.h"

typedef void (*NotesUIEvent)(void *, const char *);
typedef void (*NotesUIRelease)(void *);
static NSMutableDictionary<NSString *, id> *controllers;
static NSString * const NotesUIActionKey = @"notes-ui-action";

// Independent symbol and interaction geometry. System menus remain AppKit-owned.
static CGFloat notesFontScale(NSDictionary *state) { return state[@"fontScale"]?[state[@"fontScale"] doubleValue]:1; }
static CGFloat notesIconScale(NSDictionary *state) { return state[@"iconScale"]?[state[@"iconScale"] doubleValue]:1; }
static CGFloat notesHitScale(NSDictionary *state) { return state[@"hitScale"]?[state[@"hitScale"] doubleValue]:1; }
static CGFloat notesButtonSize(NSDictionary *state) {
    CGFloat s=notesFontScale(state), hit=notesHitScale(state);
    return MAX(MAX(42*s*hit,28*hit),21*s*notesIconScale(state)+8);
}
static CGFloat notesToolbarHeight(NSDictionary *state) { return ceil(MAX(68*notesFontScale(state),notesButtonSize(state)+12)); }
static CGFloat notesSlot(NSDictionary *state, CGFloat base) { return MAX(base*notesFontScale(state)*notesHitScale(state),notesButtonSize(state)); }

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
        @"table":@"表格",@"attachment":@"添加附件",@"share":@"共享备忘录",@"more":@"更多备忘录操作",@"settings":@"设置",@"recordAudio":@"录音",@"insertTag":@"标签"};
    return labels[action];
}
static NSString *symbolFor(NSString *action,BOOL tableFocused) {
    NSDictionary *symbols=@{@"newFolder":@"folder.badge.plus",@"toggleSidebar":@"sidebar.left",@"viewOptions":@"ellipsis",
        @"backToGallery":@"chevron.left",@"newNote":@"square.and.pencil",@"checklist":@"checklist",
        @"table":tableFocused?@"tablecells.badge.ellipsis":@"tablecells",@"attachment":@"paperclip",@"share":@"square.and.arrow.up",@"more":@"ellipsis",@"settings":@"gearshape",@"recordAudio":@"mic",@"insertTag":@"number"};
    return symbols[action];
}
static NSColor *sidebarTintColor(void) {
    return [NSColor colorWithName:@"NotesSidebarSymbol" dynamicProvider:^NSColor *(NSAppearance *appearance) {
        __block NSColor *label;
        [appearance performAsCurrentDrawingAppearance:^{label=[NSColor.labelColor colorUsingColorSpace:NSColorSpace.sRGBColorSpace];}];
        // Only ordinary light appearance has a measured Notes reference.
        return !NSWorkspace.sharedWorkspace.accessibilityDisplayShouldIncreaseContrast && [appearance.name isEqual:NSAppearanceNameAqua]?
            [label colorWithAlphaComponent:0.70]:label;
    }];
}

@interface NotesUIRoot : NSView
@property BOOL reserveTrafficLights;
@property BOOL toolbarSurface;
@property CGFloat density;
@property CGFloat trafficWidth;
@property CGFloat sidebarBoundary;
@property NSArray<NSNumber *> *separatorPositions;
@end
@implementation NotesUIRoot
- (BOOL)isFlipped {return YES;}
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];if(!self.toolbarSurface)return;
    BOOL dark=[[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua,NSAppearanceNameDarkAqua]] isEqualToString:NSAppearanceNameDarkAqua];
    [(dark?[NSColor colorWithWhite:0.165 alpha:1]:[NSColor colorWithSRGBRed:0.953 green:0.953 blue:0.965 alpha:1]) setFill];NSRectFill(self.bounds);
    [(dark?[NSColor colorWithWhite:0.235 alpha:1]:[NSColor colorWithSRGBRed:0.878 green:0.882 blue:0.91 alpha:1]) setFill];
    NSRectFill(NSMakeRect(0,NSHeight(self.bounds)-1,NSWidth(self.bounds),1));
    if(self.sidebarBoundary>0)NSRectFill(NSMakeRect(self.sidebarBoundary-1,0,1,NSHeight(self.bounds)));
    for(NSNumber *x in self.separatorPositions)NSRectFill(NSMakeRect(x.doubleValue,(NSHeight(self.bounds)-27*self.density)/2,1,27*self.density));
}

- (void)viewDidChangeEffectiveAppearance {[super viewDidChangeEffectiveAppearance];self.needsDisplay=YES;}
- (BOOL)acceptsFirstResponder {return NO;}
- (NSView *)hitTest:(NSPoint)point {
    NSPoint own=[self convertPoint:point fromView:self.superview];
    if(self.reserveTrafficLights && own.x<self.trafficWidth) return nil;
    return [super hitTest:point];
}
- (void)mouseDown:(NSEvent *)event { if(event.clickCount==2)[self.window zoom:self];else [self.window performWindowDragWithEvent:event]; }
@end
// These offsets calibrate visible content only; the control frames and menu anchors stay put.
// Values use the top-left coordinate convention of the retained 2x toolbar measurements.
static NSPoint contentOffsetFor(NSString *action) {
    (void)action;return NSZeroPoint;
}
@interface NotesUIButtonCell : NotesUIFeedbackButtonCell
@property NSPoint notesContentOffset;
@end
@implementation NotesUIButtonCell
- (NSRect)contentFrame:(NSRect)frame inView:(NSView *)view {
    return NSOffsetRect(frame,self.notesContentOffset.x,view.isFlipped?self.notesContentOffset.y:-self.notesContentOffset.y);
}
- (void)drawImage:(NSImage *)image withFrame:(NSRect)frame inView:(NSView *)view {
    [super drawImage:image withFrame:[self contentFrame:frame inView:view] inView:view];
}
- (NSRect)drawTitle:(NSAttributedString *)title withFrame:(NSRect)frame inView:(NSView *)view {
    return [super drawTitle:title withFrame:[self contentFrame:frame inView:view] inView:view];
}
@end
@interface NotesUIButton : NotesUIFeedbackButton
@property NSString *notesAction;
@end
@implementation NotesUIButton
+ (Class)cellClass {return NotesUIButtonCell.class;}
- (BOOL)acceptsFirstResponder {return NO;}
- (BOOL)acceptsFirstMouse:(NSEvent *)event {(void)event;return YES;}
@end

@interface NotesUISearchCell : NSSearchFieldCell
@end
@implementation NotesUISearchCell
- (NSRect)editorFrame:(NSRect)rect inView:(NSView *)view {
    if(![view isKindOfClass:NSSearchField.class])return rect;
    // A borderless search cell receives the full control frame for editing.
    // Feed AppKit the same public text bounds used to draw the idle field,
    // retaining its own field editor, selection, input method and clip view.
    NSRect text=((NSSearchField *)view).searchTextBounds;
    return NSOffsetRect(text,NSMinX(rect)-NSMinX(view.bounds),NSMinY(rect)-NSMinY(view.bounds));
}
- (void)selectWithFrame:(NSRect)rect inView:(NSView *)view editor:(NSText *)editor delegate:(id)delegate start:(NSInteger)start length:(NSInteger)length {
    [super selectWithFrame:[self editorFrame:rect inView:view] inView:view editor:editor delegate:delegate start:start length:length];
}
- (void)editWithFrame:(NSRect)rect inView:(NSView *)view editor:(NSText *)editor delegate:(id)delegate event:(NSEvent *)event {
    [super editWithFrame:[self editorFrame:rect inView:view] inView:view editor:editor delegate:delegate event:event];
}
@end
@interface NotesUISearchField : NSSearchField
@property CGFloat density;
@end
@implementation NotesUISearchField
+ (Class)cellClass {return NotesUISearchCell.class;}
- (BOOL)becomeFirstResponder {
    BOOL accepted=[super becomeFirstResponder];self.superview.superview.needsDisplay=YES;return accepted;
}
- (BOOL)resignFirstResponder {
    BOOL accepted=[super resignFirstResponder];self.superview.superview.needsDisplay=YES;return accepted;
}
- (NSRect)searchButtonBounds {
    CGFloat size=20*self.density;
    return NSMakeRect(4*self.density,(NSHeight(self.bounds)-size)/2,size,size);
}
- (NSRect)cancelButtonBounds {
    CGFloat size=14*self.density;
    return NSMakeRect(NSWidth(self.bounds)-size-4*self.density,(NSHeight(self.bounds)-size)/2,size,size);
}
- (NSRect)searchTextBounds {
    CGFloat lineHeight=ceil(self.font.ascender-self.font.descender+self.font.leading);
    CGFloat left=30*self.density,right=(self.stringValue.length?22:4)*self.density;
    return NSMakeRect(left,MAX(0,(NSHeight(self.bounds)-lineHeight)/2),MAX(1,NSWidth(self.bounds)-left-right),lineHeight);
}
@end

// This view alone owns every search border. The field and its field editor
// never draw an additional, differently-sized AppKit focus-ring capsule.
@interface NotesUISearchSurface : NSView
@property BOOL focused;
@property BOOL hovered;
@property (weak) NSSearchField *field;
@property NSTrackingArea *hoverTracking;
@end
@implementation NotesUISearchSurface
- (BOOL)isFlipped {return YES;}
- (BOOL)focused {
    NSResponder *responder=self.window.firstResponder;
    return self.field && responder && (responder==self.field || responder==self.field.currentEditor);
}
- (void)updateTrackingAreas {
    [super updateTrackingAreas];if(self.hoverTracking)[self removeTrackingArea:self.hoverTracking];
    self.hoverTracking=[[NSTrackingArea alloc] initWithRect:NSZeroRect options:NSTrackingMouseEnteredAndExited|NSTrackingActiveInKeyWindow|NSTrackingInVisibleRect owner:self userInfo:nil];
    [self addTrackingArea:self.hoverTracking];
}
- (void)setFocused:(BOOL)value {(void)value;self.needsDisplay=YES;}
- (void)mouseEntered:(NSEvent *)event {(void)event;self.hovered=YES;self.needsDisplay=YES;}
- (void)mouseExited:(NSEvent *)event {(void)event;self.hovered=NO;self.needsDisplay=YES;}
- (void)mouseDown:(NSEvent *)event {(void)event;if(self.field.enabled)[self.window makeFirstResponder:self.field];}
- (void)viewDidChangeEffectiveAppearance {[super viewDidChangeEffectiveAppearance];self.needsDisplay=YES;}
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    BOOL dark=[[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua,NSAppearanceNameDarkAqua]] isEqualToString:NSAppearanceNameDarkAqua];
    CGFloat line=self.focused?2:1,inset=line/2;
    NSRect rect=NSInsetRect(self.bounds,inset,inset);
    NSBezierPath *path=[NSBezierPath bezierPathWithRoundedRect:rect xRadius:NSHeight(rect)/2 yRadius:NSHeight(rect)/2];
    NSColor *fill=dark?[NSColor colorWithSRGBRed:0.133 green:0.133 blue:0.145 alpha:1]:[NSColor colorWithSRGBRed:0.980 green:0.980 blue:0.992 alpha:1];
    NSColor *border=self.focused?(dark?[NSColor colorWithSRGBRed:0.929 green:0.675 blue:0.129 alpha:1]:[NSColor colorWithSRGBRed:0.851 green:0.576 blue:0 alpha:1]):
        self.hovered?(dark?[NSColor colorWithSRGBRed:0.443 green:0.443 blue:0.490 alpha:1]:[NSColor colorWithSRGBRed:0.714 green:0.718 blue:0.761 alpha:1]):
        dark?[NSColor colorWithSRGBRed:0.235 green:0.235 blue:0.259 alpha:1]:[NSColor colorWithSRGBRed:0.878 green:0.882 blue:0.910 alpha:1];
    [fill setFill];[path fill];[border setStroke];path.lineWidth=line;[path stroke];
}
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

@interface NotesUIController : NSObject <NSSearchFieldDelegate, NSPopoverDelegate>
@property (weak) NSWindow *window;
@property NSString *windowLabel;
@property NSString *bindingId;
@property NSDictionary *state;
@property NotesUIRoot *root;
@property NSMutableDictionary<NSString *,NSView *> *groups;
@property NSMutableSet<NSString *> *layoutGroups;
@property NSMutableSet<NSString *> *layoutButtons;
@property NSMutableDictionary<NSString *,NSView *> *contents;
@property NSView *sidebarBackground;
@property NSMutableDictionary<NSString *,NotesUIButton *> *buttons;
@property NSMutableDictionary<NSString *,NSDictionary *> *actionStates;
@property NSMutableDictionary<NSString *,NSMenu *> *menus;
@property NSMenu *activeMenu;
@property NSPopover *formatPopover;
@property (weak) NotesUIFeedbackButton *formatAnchor;
@property NSDictionary<NSString *,NSDictionary *> *formatEntries;
@property NSTextField *title;
@property NSTextField *count;
@property NotesUISearchField *search;
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
- (NSDictionary *)focusSearch;
- (void)showFormatPopover:(NSButton *)anchor;
@end

@implementation NotesUIController
- (NSView *)makeGroup:(NSString *)name {
    NSView *content=[[NotesUIRoot alloc] initWithFrame:NSZeroRect];
    NSView *host=[name isEqual:@"search"]?[[NotesUISearchSurface alloc] initWithFrame:NSZeroRect]:[[NotesUIRoot alloc] initWithFrame:NSZeroRect];
    content.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    [host addSubview:content];
    if([name isEqual:@"sidebar"])self.sidebarBackground=[[NSView alloc] initWithFrame:NSZeroRect];
    self.material=@"legacyHeader";
    self.groups[name]=host;self.contents[name]=content;[self.root addSubview:host];return content;
}
- (void)build {
    self.root=[[NotesUIRoot alloc] initWithFrame:NSZeroRect];self.root.autoresizingMask=NSViewWidthSizable|NSViewMinYMargin;
    self.root.toolbarSurface=YES;
    self.root.reserveTrafficLights=(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)!=0;
    self.groups=[NSMutableDictionary dictionary];self.contents=[NSMutableDictionary dictionary];self.buttons=[NSMutableDictionary dictionary];
    self.actionStates=[NSMutableDictionary dictionary];self.menus=[NSMutableDictionary dictionary];self.observers=[NSMutableArray array];
    for(NSString *name in @[@"sidebar",@"back",@"view",@"new",@"edit",@"share",@"overflow",@"search",@"browse",@"settings"]) [self makeGroup:name];
    NSDictionary *membership=@{@"newFolder":@"sidebar",@"toggleSidebar":@"sidebar",@"backToGallery":@"back",@"viewOptions":@"view",
        @"newNote":@"new",@"format":@"edit",@"checklist":@"edit",@"table":@"edit",@"attachment":@"edit",@"share":@"share",@"more":@"share",@"overflow":@"overflow",@"settings":@"settings",@"recordAudio":@"edit",@"insertTag":@"edit"};
    for(NSString *action in membership) {
        NotesUIButton *button=[[NotesUIButton alloc] initWithFrame:NSZeroRect];button.notesAction=action;
        [button setButtonType:NSButtonTypeMomentaryPushIn];button.bordered=NO;button.imagePosition=NSImageOnly;
        button.imageScaling=NSImageScaleProportionallyDown;
        ((NotesUIButtonCell *)button.cell).notesContentOffset=contentOffsetFor(action);
        if([action isEqual:@"format"]) {
            button.title=@"格式";button.imagePosition=NSNoImage;
            button.font=[NSFont systemFontOfSize:18 weight:NSFontWeightRegular];
        }
        button.refusesFirstResponder=YES;button.focusRingType=NSFocusRingTypeNone;button.target=self;button.action=@selector(buttonClicked:);
        self.buttons[action]=button;[self.contents[membership[action]] addSubview:button];
    }
    self.buttons[@"overflow"].image=[NSImage imageWithSystemSymbolName:@"ellipsis" accessibilityDescription:@"其他工具"];
    self.buttons[@"overflow"].toolTip=@"其他工具";[self.buttons[@"overflow"] setAccessibilityLabel:@"其他工具"];
    self.title=[NSTextField labelWithString:@""];self.title.font=[NSFont systemFontOfSize:18 weight:NSFontWeightSemibold];
    self.title.lineBreakMode=NSLineBreakByTruncatingTail;self.title.maximumNumberOfLines=1;
    self.count=[NSTextField labelWithString:@""];self.count.font=[NSFont systemFontOfSize:15];self.count.textColor=NSColor.secondaryLabelColor;
    [self.root addSubview:self.title];[self.root addSubview:self.count];
    self.search=[[NotesUISearchField alloc] initWithFrame:NSZeroRect];self.search.delegate=self;
    self.search.formatter=[NotesUISearchFormatter new];
    self.search.font=[NSFont systemFontOfSize:17];
    self.search.placeholderString=@"搜索备忘录";self.search.sendsSearchStringImmediately=YES;self.search.sendsWholeSearchString=NO;
    self.search.recentsAutosaveName=nil;self.search.maximumRecents=0;self.search.searchMenuTemplate=nil;
    self.search.bordered=NO;self.search.bezeled=NO;self.search.drawsBackground=NO;
    self.search.focusRingType=NSFocusRingTypeNone;self.search.cell.focusRingType=NSFocusRingTypeNone;
    ((NotesUISearchSurface *)self.groups[@"search"]).field=self.search;
    [(NSSearchFieldCell *)self.search.cell setScrollable:YES];
    [self.search setAccessibilityLabel:@"搜索备忘录"];self.search.target=self;self.search.action=@selector(searchCommitted:);
    [self.contents[@"search"] addSubview:self.search];
    [self.window.contentView addSubview:self.root positioned:NSWindowAbove relativeTo:nil];
    __weak NotesUIController *weak=self;
    NSNotificationCenter *center=NSNotificationCenter.defaultCenter;
    for(NSNotificationName name in @[NSWindowDidResizeNotification,NSWindowDidChangeScreenNotification]) {
        [self.observers addObject:[center addObserverForName:name object:self.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;[weak layout];}]];
    }
    for(NSNotificationName name in @[NSWindowDidBecomeKeyNotification,NSWindowDidResignKeyNotification]) {
        [self.observers addObject:[center addObserverForName:name object:self.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;
            BOOL active=[name isEqual:NSWindowDidBecomeKeyNotification];
            // AppKit can post these while Tauri is removing a window. Emit after that
            // runtime borrow ends, and discard notifications from disposed bindings.
            dispatch_async(dispatch_get_main_queue(), ^{NotesUIController *strong=weak;
                if(strong && !strong.disposed) [strong send:@{@"kind":@"windowActivity",@"active":@(active)}];});}]];
    }
    [self.observers addObject:[center addObserverForName:NSWindowWillCloseNotification object:self.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n){(void)n;
        NotesUIController *strong=weak;if(strong){[strong dispose];[controllers removeObjectForKey:strong.bindingId];}}]];
}
- (NSMenu *)menuEntries:(NSArray *)entries owner:(NSString *)owner {
    NSMutableArray *owned=[NSMutableArray array];
    for(NSDictionary *entry in entries) {
        NSMutableDictionary *value=[entry mutableCopy];value[@"owner"]=owner;
        [owned addObject:value];
    }
    NSMenu *menu=notesUIMenuEntries(owned,self,@selector(menuClicked:));
    // Toolbar submenus also retain their owner when rebuilding recursively.
    for(NSMenuItem *item in menu.itemArray)if(item.submenu)item.submenu=[self menuEntries:item.representedObject[@"items"] owner:owner];
    return menu;
}
- (NSDictionary *)apply:(NSDictionary *)state {
    NSDictionary *searchState=state[@"search"];
    BOOL hasSearch=searchState && (id)searchState!=NSNull.null;
    BOOL contentOverlay=[state[@"contentOverlay"] boolValue];
    if(!contentOverlay && hasSearch && [searchState[@"acknowledgedEvent"] unsignedLongLongValue]<self.searchSequence)
        return @{@"code":@"stale_search",@"message":@"请先合并最新原生搜索事件"};
    if(!contentOverlay && hasSearch && self.search.currentEditor && [self.search.currentEditor isKindOfClass:NSTextView.class]) {
        NSTextView *editor=(NSTextView *)self.search.currentEditor;
        if(editor.hasMarkedText && ![searchState[@"value"] isEqual:self.search.stringValue])
            return @{@"code":@"search_composition",@"message":@"搜索正在输入法组字，请等待提交后更新文字"};
    }
    // Resolve every symbol before changing existing controls. The only documented icon fallback is
    // the focused-table badge to tablecells on an older runtime where the badge does not exist.
    NSMutableDictionary *images=[NSMutableDictionary dictionary];NSMutableArray *fallbacks=[NSMutableArray array];
    for(NSDictionary *item in state[@"actions"]) {
        NSString *action=item[@"action"];
        if([action isEqual:@"format"])continue; // This action is a localized text button, not an SF Symbol.
        NSString *symbol=symbolFor(action,[state[@"tableFocused"] boolValue]);
        NSString *label=labelFor(action,[state[@"tableFocused"] boolValue]);
        // A new note/revision does not invalidate an unchanged symbol.
        NotesUIButton *retained=self.buttons[action];
        CGFloat nextScale=notesFontScale(state)*notesIconScale(state);
        CGFloat previousScale=notesFontScale(self.state)*notesIconScale(self.state);
        if(retained.image && self.actionStates[action] && nextScale==previousScale
            && [symbol isEqual:symbolFor(action,[self.state[@"tableFocused"] boolValue])]) {
            images[action]=retained.image;
            for(NSDictionary *fallback in self.symbolFallbacks)if([fallback[@"action"] isEqual:action])[fallbacks addObject:fallback];
            continue;
        }
        NSImage *image=[NSImage imageWithSystemSymbolName:symbol accessibilityDescription:label];
        if(!image && [symbol isEqual:@"tablecells.badge.ellipsis"]) {image=[NSImage imageWithSystemSymbolName:@"tablecells" accessibilityDescription:label];
            [fallbacks addObject:@{@"action":action,@"requested":symbol,@"used":@"tablecells"}];}
        if(!image) return @{@"code":@"symbol_unavailable",@"message":[@"系统符号不可用：" stringByAppendingString:symbol]};
        CGFloat point=21*notesFontScale(state)*notesIconScale(state);
        image=[image imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:point weight:NSFontWeightRegular scale:NSImageSymbolScaleMedium]];
        if(!image) return @{@"code":@"symbol_unavailable",@"message":@"系统符号配置失败"};image.template=YES;images[action]=image;
    }
    NSDictionary *previous=self.state;
    BOOL initial=self.buttons[@"format"].symbolConfiguration==nil;
    CGFloat fontScale=notesFontScale(state), iconScale=notesIconScale(state);
    BOOL scaleChanged=initial || fontScale!=notesFontScale(previous) || iconScale!=notesIconScale(previous);
    BOOL appearanceChanged=initial || ![state[@"appearance"] isEqual:previous[@"appearance"]];
    NSArray *previousActions=[previous[@"actions"] valueForKey:@"action"],*nextActions=[state[@"actions"] valueForKey:@"action"];
    BOOL previousSearch=previous[@"search"] && (id)previous[@"search"]!=NSNull.null;
    BOOL layoutChanged=initial || scaleChanged || notesHitScale(state)!=notesHitScale(previous) || ![state[@"layout"] isEqual:previous[@"layout"]]
        || ![state[@"columns"] isEqual:previous[@"columns"]] || ![previousActions isEqual:nextActions]
        || previousSearch!=hasSearch || contentOverlay!=[previous[@"contentOverlay"] boolValue];
    self.suppress=YES;
    // Revision changes invalidate old menu targets, but do not rebuild buttons.
    [self.formatPopover close];self.formatPopover=nil;
    self.formatAnchor.notesMenuOpen=NO;self.formatAnchor=nil;
    [self.activeMenu cancelTracking];
    for(NSMenu *menu in self.menus.allValues)[menu cancelTracking];
    self.state=state;self.symbolFallbacks=fallbacks;
    if(appearanceChanged) {
        NSString *appearance=state[@"appearance"];
        self.window.appearance=[appearance isEqual:@"dark"]?[NSAppearance appearanceNamed:NSAppearanceNameDarkAqua]:[appearance isEqual:@"light"]?[NSAppearance appearanceNamed:NSAppearanceNameAqua]:nil;
    }
    NSMutableDictionary *nextStates=[NSMutableDictionary dictionary],*nextMenus=[NSMutableDictionary dictionary];
    for(NSDictionary *item in state[@"actions"])nextStates[item[@"action"]]=item;
    NSDictionary *oldActionStates=self.actionStates;self.actionStates=nextStates;
    for(NSDictionary *menu in state[@"menus"]) {
        NSString *owner=menu[@"owner"];
        if([owner isEqual:@"format"])continue;
        NSDictionary *old=nil;
        for(NSDictionary *candidate in previous[@"menus"])if([candidate[@"owner"] isEqual:owner]){old=candidate;break;}
        nextMenus[owner]=[menu isEqual:old] && self.menus[owner]?self.menus[owner]:[self menuEntries:menu[@"items"] owner:owner];
    }
    self.menus=nextMenus;self.formatEntries=@{};
    for(NSDictionary *menu in state[@"menus"])if([menu[@"owner"] isEqual:@"format"])self.formatEntries=notesUIFormatEntries(menu[@"items"]);
    for(NSString *action in self.buttons) {
        NotesUIButton *button=self.buttons[action];
        if(scaleChanged) {
            // The layer-backed control and its image must share symbol metrics.
            button.font=[NSFont systemFontOfSize:18*fontScale];button.notesFeedbackScale=fontScale;
            button.symbolConfiguration=[NSImageSymbolConfiguration configurationWithPointSize:21*fontScale*iconScale weight:NSFontWeightRegular scale:NSImageSymbolScaleMedium];
        }
        if([action isEqual:@"overflow"]){if(self.buttons[action].enabled==contentOverlay)self.buttons[action].enabled=!contentOverlay;continue;}
        NSDictionary *item=self.actionStates[action];
        BOOL enabled=!contentOverlay && [item[@"enabled"] boolValue];NSControlStateValue selected=[item[@"selected"] boolValue]?NSControlStateValueOn:NSControlStateValueOff;
        if(button.enabled!=enabled)button.enabled=enabled;
        if(button.state!=selected)button.state=selected;
        if(button.notesSelected!=(selected==NSControlStateValueOn))button.notesSelected=selected==NSControlStateValueOn;
        if(item) {
            if(button.image!=images[action])button.image=images[action];
            NSString *label=labelFor(action,[state[@"tableFocused"] boolValue]);
            if(![button.toolTip isEqual:label]){button.toolTip=label;[button setAccessibilityLabel:label];}
        }
        NSColor *tint=([action isEqual:@"toggleSidebar"] || ([action isEqual:@"newFolder"] && ![item[@"selected"] boolValue]))?sidebarTintColor():
            ([item[@"selected"] boolValue]?NSColor.systemYellowColor:NSColor.labelColor);
        if(initial || appearanceChanged || [oldActionStates[action][@"selected"] boolValue]!=[item[@"selected"] boolValue])button.contentTintColor=tint;
    }
    if(scaleChanged) {
        self.buttons[@"overflow"].image=[[NSImage imageWithSystemSymbolName:@"ellipsis" accessibilityDescription:@"其他工具"] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:21*fontScale*iconScale weight:NSFontWeightRegular scale:NSImageSymbolScaleMedium]];
        self.buttons[@"overflow"].contentTintColor=NSColor.labelColor;
        self.title.font=[NSFont systemFontOfSize:18*fontScale weight:NSFontWeightSemibold];self.count.font=[NSFont systemFontOfSize:15*fontScale];
        self.search.font=[NSFont systemFontOfSize:17*fontScale];self.search.density=fontScale*iconScale;
        self.search.placeholderAttributedString=[[NSAttributedString alloc] initWithString:@"搜索备忘录" attributes:@{NSFontAttributeName:self.search.font,NSForegroundColorAttributeName:NSColor.secondaryLabelColor}];
        if([self.search.currentEditor isKindOfClass:NSTextView.class])((NSTextView *)self.search.currentEditor).font=self.search.font;
    }
    if(![self.title.stringValue isEqual:state[@"folderTitle"]]){self.title.stringValue=state[@"folderTitle"];[self.title setAccessibilityLabel:state[@"folderTitle"]];}
    BOOL zeroSearch=[state[@"folderTitle"] isEqual:@"搜索"] && [state[@"folderCount"] unsignedLongLongValue]==0 && hasSearch && [searchState[@"value"] length]>0;
    NSString *count=zeroSearch?@"无结果":[NSString stringWithFormat:@"%@ 个备忘录",state[@"folderCount"]];
    if(![self.count.stringValue isEqual:count]){self.count.stringValue=count;[self.count setAccessibilityLabel:count];}
    BOOL searchEnabled=hasSearch && !contentOverlay && [searchState[@"enabled"] boolValue];
    if(self.search.enabled!=searchEnabled)self.search.enabled=searchEnabled;
    if(hasSearch && !contentOverlay && ![self.search.stringValue isEqual:searchState[@"value"]])self.search.stringValue=searchState[@"value"];
    if(@available(macOS 26.0,*)) {
        if(initial || ![state[@"glassStyle"] isEqual:previous[@"glassStyle"]])for(NSView *view in [self.groups.allValues arrayByAddingObject:self.sidebarBackground])if([view isKindOfClass:NSClassFromString(@"NSGlassEffectView")]) {
            ((NSGlassEffectView *)view).style=[state[@"glassStyle"] isEqual:@"clear"]?NSGlassEffectViewStyleClear:NSGlassEffectViewStyleRegular;
            self.material=[state[@"glassStyle"] isEqual:@"clear"]?@"glassClear":@"glassRegular";
        }
    }
    if(layoutChanged)[self layout];self.suppress=NO;return nil;
}
- (void)placeGroup:(NSString *)name x:(CGFloat)x width:(CGFloat)width actions:(NSArray<NSString *> *)actions {
    NSView *group=self.groups[name];
    if(width>0)[self.layoutGroups addObject:name];
    CGFloat h=notesToolbarHeight(self.state),height=notesButtonSize(self.state);
    group.frame=NSMakeRect(x,(h-height)/2,MAX(0,width),height);self.contents[name].frame=NSMakeRect(0,0,MAX(0,width),height);
    if([name isEqual:@"sidebar"])self.sidebarBackground.frame=self.contents[name].bounds;
    CGFloat itemWidth=actions.count?width/actions.count:0;
    for(NSUInteger i=0;i<actions.count;i++) {NotesUIButton *button=self.buttons[actions[i]];
        if(button.superview!=self.contents[name])[self.contents[name] addSubview:button];
        [self.layoutButtons addObject:actions[i]];button.frame=NSMakeRect(i*itemWidth,0,itemWidth,height);}
}
- (CGFloat)actionWidth:(NSString *)action labels:(BOOL)labels {
    if([action isEqual:@"format"])return notesSlot(self.state,labels?60:48);
    return notesSlot(self.state,labels?54:42);
}
- (void)layout {
    if(self.disposed || !self.window.contentView)return;
    NSView *parent=self.window.contentView;NSRect bounds=parent.bounds;CGFloat w=NSWidth(bounds);
    CGFloat s=notesFontScale(self.state),h=notesToolbarHeight(self.state),buttonHeight=notesButtonSize(self.state),slot=notesSlot(self.state,42);
    self.root.density=s;self.root.frame=NSMakeRect(NSMinX(bounds),parent.flipped?NSMinY(bounds):NSMaxY(bounds)-h,w,h);
    self.layoutGroups=[NSMutableSet set];self.layoutButtons=[NSMutableSet set];
    BOOL full=(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)!=0;self.root.reserveTrafficLights=full;
    CGFloat traffic=full?54+28*s:12*s;self.root.trafficWidth=traffic;
    if(full && !(self.window.styleMask&NSWindowStyleMaskFullScreen)) {
        NSUInteger index=0;
        for(NSNumber *kind in @[@(NSWindowCloseButton),@(NSWindowMiniaturizeButton),@(NSWindowZoomButton)]) {
            NSButton *button=[self.window standardWindowButton:kind.unsignedIntegerValue];
            if(button && button.superview) {
                NSPoint center=[button.superview convertPoint:NSMakePoint(20*s+index*20+NSWidth(button.frame)/2,h/2) fromView:self.root];
                [button setFrameOrigin:NSMakePoint(center.x-NSWidth(button.frame)/2,center.y-NSHeight(button.frame)/2)];
            }index++;
        }
    }
    NSDictionary *columns=self.state[@"columns"];
    BOOL sidebar=[columns[@"sidebarVisible"] boolValue];CGFloat side=sidebar?[columns[@"sidebarWidth"] doubleValue]:0,list=[columns[@"listWidth"] doubleValue];
    self.root.sidebarBoundary=side;self.root.needsDisplay=YES;
    // Modal content blocks actions, while the main toolbar keeps its geometry
    // and visible controls. Hiding the groups made opening Settings look broken.
    NSString *layout=self.state[@"layout"];
    BOOL three=[layout isEqual:@"threeColumn"],browse=[layout isEqual:@"galleryBrowse"],independent=[layout isEqual:@"independentNote"];
    CGFloat boundary=three?side+list:side,titleX=MAX(side+26*s,traffic+8*s);
    NSMutableArray *hidden=[NSMutableArray array];CGFloat reservedEnd=traffic;
    if(!independent) {
        NSMutableArray *actions=[NSMutableArray array];
        if(self.actionStates[@"toggleSidebar"])[actions addObject:@"toggleSidebar"];
        if(sidebar && self.actionStates[@"newFolder"])[actions addObject:@"newFolder"];
        CGFloat sidebarSlot=notesSlot(self.state,w<=1100?44:60),sidebarMargin=(w<=1100?8:12)*s;
        CGFloat width=actions.count*sidebarSlot;
        if(sidebar && side-width-sidebarMargin<traffic && [actions containsObject:@"newFolder"]) {
            [actions removeObject:@"newFolder"];[hidden addObject:@"newFolder"];width=actions.count*notesSlot(self.state,44);
        }
        CGFloat x=sidebar?MAX(traffic,side-width-sidebarMargin):traffic;
        if(actions.count)[self placeGroup:@"sidebar" x:x width:width actions:actions];
        if(!sidebar){reservedEnd=x+width;titleX=reservedEnd+14*s;}
    }
    CGFloat start=three?boundary+16*s:MAX(titleX+160*s,traffic+12*s);
    if(independent)start=traffic+12*s;
    NSMutableArray *separators=[NSMutableArray array];
    if(three){[separators addObject:@(boundary-72*s)];[separators addObject:@(boundary+3*s)];}
    if(three) {
        if(self.actionStates[@"viewOptions"]) {
            if(boundary-128*s>=reservedEnd)[self placeGroup:@"view" x:boundary-128*s width:notesSlot(self.state,44) actions:@[@"viewOptions"]];
            else [hidden addObject:@"viewOptions"];
        }
        if(self.actionStates[@"newNote"]) {
            if(boundary-60*s>=reservedEnd)[self placeGroup:@"new" x:boundary-60*s width:notesSlot(self.state,48) actions:@[@"newNote"]];
            else [hidden addObject:@"newNote"];
        }
    } else if(self.actionStates[@"backToGallery"]) {
        [self placeGroup:@"back" x:start width:slot actions:@[@"backToGallery"]];start+=slot+6*s;
    }
    CGFloat settingsX=w-slot-14*s;
    if(self.actionStates[@"settings"])[self placeGroup:@"settings" x:settingsX width:slot actions:@[@"settings"]];
    BOOL hasSearch=self.state[@"search"] && (id)self.state[@"search"]!=NSNull.null;
    NSArray *candidates=browse?@[@"viewOptions",@"newNote"]:(three?@[@"format",@"checklist",@"table",@"attachment",@"recordAudio",@"insertTag",@"share",@"more"]:@[@"newNote",@"format",@"checklist",@"table",@"attachment",@"recordAudio",@"insertTag",@"share",@"more"]);
    NSMutableArray *visible=[NSMutableArray array];for(NSString *action in candidates)if(self.actionStates[action])[visible addObject:action];
    CGFloat available=MAX(0,w-14*s-start),gap=12*s,searchMin=(available<420*s?110:140)*s;
    CGFloat total=slot+gap+(hasSearch?searchMin+gap:0)+(hidden.count?slot:0);
    for(NSString *action in visible)total+=[self actionWidth:action labels:YES];
    BOOL labels=total<=available;
    for(NSString *drop in @[@"insertTag",@"recordAudio",@"share",@"attachment",@"table",@"checklist",@"format",@"newNote",@"viewOptions"]) {
        CGFloat required=slot+gap+(hasSearch?searchMin+gap:0)+(hidden.count?slot:0);
        for(NSString *action in visible)required+=[self actionWidth:action labels:labels];
        if(required<=available)break;
        if([visible containsObject:drop]){[visible removeObject:drop];[hidden addObject:drop];}
    }
    CGFloat left=start;
    for(NSString *action in visible) {
        CGFloat width=[self actionWidth:action labels:labels];if([action isEqual:@"share"])[separators addObject:@(left)];
        NotesUIButton *button=self.buttons[action];if(button.superview!=self.root)[self.root addSubview:button];
        [self.layoutButtons addObject:action];button.frame=NSMakeRect(left,(h-buttonHeight)/2,width,buttonHeight);
        left+=width;
    }
    if(hidden.count){[self placeGroup:@"overflow" x:left width:slot actions:@[@"overflow"]];left+=slot;}
    if(hasSearch) {
        CGFloat searchWidth=MIN(254*s,MAX(0,settingsX-left-gap*2));
        if(searchWidth>0) {
            [self placeGroup:@"search" x:settingsX-searchWidth-gap width:searchWidth actions:@[]];
            NSView *surface=self.groups[@"search"];
            surface.frame=NSMakeRect(settingsX-searchWidth-gap,(h-40*s)/2,searchWidth,40*s);
            self.contents[@"search"].frame=surface.bounds;
            self.search.frame=NSInsetRect(surface.bounds,10*s,4*s);
        }
    }
    for(NSString *action in self.buttons){BOOL hidden=![self.layoutButtons containsObject:action];if(self.buttons[action].hidden!=hidden)self.buttons[action].hidden=hidden;}
    for(NSString *name in self.groups){BOOL hidden=![self.layoutGroups containsObject:name];if(self.groups[name].hidden!=hidden)self.groups[name].hidden=hidden;}
    self.layoutButtons=nil;self.layoutGroups=nil;self.overflow=hidden;self.root.separatorPositions=separators;
    CGFloat titleRight=three?boundary-140*s:start-16*s;
    self.title.hidden=self.count.hidden=independent||titleRight-titleX<24*s;
    self.title.frame=NSMakeRect(titleX,10*s,MAX(0,titleRight-titleX),25*s);
    self.count.frame=NSMakeRect(titleX,36*s,MAX(0,titleRight-titleX),22*s);
}
- (NSDictionary *)information {
    return @{@"material":self.material,@"reservedTop":@(notesToolbarHeight(self.state)),@"contentWidth":@(NSWidth(self.window.contentView.bounds)),
        @"active":self.window.keyWindow?@YES:@NO,@"overflowActions":self.overflow?:@[],@"searchSequence":@(self.searchSequence),
        @"fullSizeContent":(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)?@YES:@NO,@"symbolFallbacks":self.symbolFallbacks?:@[],
        @"popupMenus":@YES,@"windowNumber":@(self.window.windowNumber),@"scaleFactor":@(self.window.backingScaleFactor)};
}
- (NSDictionary *)focusSearch {
    NSWindow *window=self.window;
    if(self.disposed || !window || self.root.window!=window)
        return @{@"code":@"window_closed",@"message":@"搜索所属窗口已经关闭"};
    NSDictionary *searchState=self.state[@"search"];
    if(!searchState || (id)searchState==NSNull.null || !self.search)
        return @{@"code":@"search_missing",@"message":@"当前窗口没有搜索控件"};
    if([self.state[@"contentOverlay"] boolValue] || ![searchState[@"enabled"] boolValue] || !self.search.enabled)
        return @{@"code":@"search_disabled",@"message":@"当前窗口搜索已禁用"};
    NSTextView *editor=[self.search.currentEditor isKindOfClass:NSTextView.class]?(NSTextView *)self.search.currentEditor:nil;
    // Repeated requests while editing (including marked text) are a no-op.
    if(window.firstResponder==self.search || (editor && window.firstResponder==editor))return nil;
    // Only request first responder. No activation/order, text/selection setter, rebind or intent.
    // AppKit's own caret/selection behavior remains to be observed at host integration.
    if(![window makeFirstResponder:self.search])
        return @{@"code":@"focus_failed",@"message":@"原生搜索无法取得输入焦点"};
    return nil;
}
- (void)send:(NSDictionary *)intent {
    if(self.disposed || self.suppress || !self.callback)return;
    self.sequence++;
    if([intent[@"kind"] isEqual:@"search"])self.searchSequence=self.sequence;
    NSDictionary *event=@{@"windowLabel":self.windowLabel,@"bindingId":self.bindingId,@"stateRevision":self.state[@"revision"],@"sequence":@(self.sequence),@"intent":intent};
    NSData *data=[NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    if(data){NSString *text=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];self.callback(self.callbackContext,text.UTF8String);}
}
- (void)showFormatPopover:(NSButton *)anchor {
    if(self.disposed || self.root.window!=self.window || !anchor.window
        || ![self.actionStates[@"format"][@"enabled"] boolValue] || !self.formatEntries.count)return;
    [self.formatPopover close];
    self.formatAnchor.notesMenuOpen=NO;
    self.formatPopover=notesUIFormatPopover(self.formatEntries,[self.state[@"revision"] unsignedLongLongValue],self,
        @selector(formatClicked:),@selector(formatColorsClicked:));
    self.formatPopover.delegate=self;
    self.formatAnchor=(NotesUIFeedbackButton *)anchor;self.formatAnchor.notesMenuOpen=YES;
    // No makeFirstResponder/selection setter: the host restores its revision-scoped bookmark.
    [self.formatPopover showRelativeToRect:anchor.bounds ofView:anchor preferredEdge:NSRectEdgeMinY];
}
- (void)popoverDidClose:(NSNotification *)notification {
    if(notification.object==self.formatPopover){self.formatAnchor.notesMenuOpen=NO;self.formatAnchor=nil;}
}
- (BOOL)permitsFormatButton:(NotesUIFormatButton *)button {
    return !self.disposed && self.root.window==self.window && self.formatPopover.shown
        && [button isDescendantOf:self.formatPopover.contentViewController.view]
        && button.notesRevision==[self.state[@"revision"] unsignedLongLongValue]
        && [self.actionStates[@"format"][@"enabled"] boolValue] && button.enabled;
}
- (void)formatClicked:(NotesUIFormatButton *)button {
    if(![self permitsFormatButton:button] || ![self.formatEntries[button.notesCommand][@"enabled"] boolValue])return;
    NSString *command=button.notesCommand;[self.formatPopover close];self.formatPopover=nil;
    [self send:@{@"kind":@"menu",@"owner":@"format",@"command":command}];
}
- (void)formatColorsClicked:(NotesUIFormatButton *)button {
    if(![self permitsFormatButton:button])return;
    NSMutableArray *entries=[NSMutableArray array];
    for(NSString *command in @[@"colorDefault",@"colorPurple",@"colorPink",@"colorOrange",@"colorMint",@"colorBlue"]) {
        NSDictionary *entry=self.formatEntries[command];if(!entry)continue;
        NSMutableDictionary *value=[entry mutableCopy];value[@"owner"]=@"format";value[@"revision"]=@(button.notesRevision);[entries addObject:value];
    }
    NSMenu *menu=notesUIMenuEntries(entries,self,@selector(menuClicked:));
    for(NSMenuItem *item in menu.itemArray)item.image=notesUIFormatSwatch(item.representedObject[@"command"]);
    self.activeMenu=menu;button.notesMenuOpen=YES;
    @try {[menu popUpMenuPositioningItem:nil atLocation:NSZeroPoint inView:button];}
    @finally {button.notesMenuOpen=NO;self.activeMenu=nil;}
}
- (void)buttonClicked:(NotesUIButton *)button {
    if([self.state[@"contentOverlay"] boolValue])return;
    NSString *action=button.notesAction;
    if([action isEqual:@"overflow"]) {
        NSMutableArray *entries=[NSMutableArray array];
        for(NSString *a in self.overflow)[entries addObject:@{@"kind":@"item",@"label":labelFor(a,[self.state[@"tableFocused"] boolValue]),@"action":a,@"enabled":self.actionStates[a][@"enabled"]?:@NO,@"selected":self.actionStates[a][@"selected"]?:@NO}];
        NSMenu *overflow=notesUIMenuEntries(entries,self,@selector(overflowClicked:));
        for(NSMenuItem *item in overflow.itemArray){NSMenu *submenu=self.menus[item.representedObject[@"action"]];if(submenu)item.submenu=submenu;}
        NotesUIController *strong=self;strong.activeMenu=overflow;
        button.notesMenuOpen=YES;
        @try {[overflow popUpMenuPositioningItem:nil atLocation:NSMakePoint(0,34) inView:button];}
        @finally {button.notesMenuOpen=NO;strong.activeMenu=nil;}return;
    }
    if(![self.actionStates[action][@"enabled"] boolValue])return;
    if([action isEqual:@"format"] && self.formatEntries.count){[self showFormatPopover:button];return;}
    NSMenu *menu=self.menus[action];
    if(menu){NotesUIController *strong=self;strong.activeMenu=menu;button.notesMenuOpen=YES;
        @try {[menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(0,34) inView:button];}
        @finally {button.notesMenuOpen=NO;strong.activeMenu=nil;}}
    else[self send:@{@"kind":@"action",@"action":action}];
}
- (void)overflowClicked:(NSMenuItem *)item {
    NSString *a=item.representedObject[@"action"];if(![self.actionStates[a][@"enabled"] boolValue])return;
    if([a isEqual:@"format"] && self.formatEntries.count) {
        uint64_t revision=[self.state[@"revision"] unsignedLongLongValue];__weak NotesUIController *weak=self;
        [NSOperationQueue.mainQueue addOperationWithBlock:^{NotesUIController *strong=weak;
            if(strong && revision==[strong.state[@"revision"] unsignedLongLongValue])[strong showFormatPopover:strong.buttons[@"overflow"]];}];
    } else [self send:@{@"kind":@"action",@"action":a}];
}
- (void)menuClicked:(NSMenuItem *)item {
    if(!item.enabled)return;NSDictionary *represented=item.representedObject;
    if([represented[@"owner"] isEqual:@"format"]) {
        if(self.disposed || self.root.window!=self.window || item.menu!=self.activeMenu
            || [represented[@"revision"] unsignedLongLongValue]!=[self.state[@"revision"] unsignedLongLongValue]
            || ![self.actionStates[@"format"][@"enabled"] boolValue]
            || ![self.formatEntries[represented[@"command"]][@"enabled"] boolValue])return;
        [self.formatPopover close];self.formatPopover=nil;
    }
    NSMutableDictionary *intent=[@{@"kind":@"menu",@"owner":represented[@"owner"],@"command":represented[@"command"]} mutableCopy];
    if(represented[@"folderId"])intent[@"folderId"]=represented[@"folderId"];
    [self send:intent];
}
- (void)controlTextDidBeginEditing:(NSNotification *)notification {
    if(notification.object==self.search)((NotesUISearchSurface *)self.groups[@"search"]).focused=YES;
}
- (void)controlTextDidEndEditing:(NSNotification *)notification {
    if(notification.object==self.search)((NotesUISearchSurface *)self.groups[@"search"]).focused=NO;
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
    [self.formatPopover close];self.formatPopover=nil;self.formatEntries=@{};
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
        if([state[@"revision"] unsignedLongLongValue]<=[controller.state[@"revision"] unsignedLongLongValue])return failure(@"stale_revision",@"顶部状态版本已经过期");
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
char *notes_ui_focus_search(const char *binding) {
    if(!NSThread.isMainThread)return failure(@"thread",@"AppKit 必须在主线程执行");
    @try {
        NotesUIController *controller=controllers[[NSString stringWithUTF8String:binding]];
        if(!controller || controller.disposed)return failure(@"stale_binding",@"原生顶部绑定不存在");
        NSDictionary *error=[controller focusSearch];
        if(error)return encoded(@{@"ok":@NO,@"error":error});
        return encoded(@{@"ok":@YES,@"native":[controller information]});
    } @catch(NSException *exception) {return failure(@"native",exception.reason?:@"原生搜索聚焦失败");}
}
void notes_ui_destroy(const char *binding) {
    if(!NSThread.isMainThread)return;
    NSString *key=[NSString stringWithUTF8String:binding];NotesUIController *controller=controllers[key];[controller dispose];[controllers removeObjectForKey:key];
}
void notes_ui_free(char *value){free(value);}
