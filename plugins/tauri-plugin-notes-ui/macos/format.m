#import "format.h"

@implementation NotesUIFeedbackButtonCell
- (void)setHighlighted:(BOOL)value {
    [super setHighlighted:value];self.controlView.needsDisplay=YES;
}
@end

@interface NotesUIFeedbackButton ()
@property NSTrackingArea *notesTracking;
@property NSTimeInterval notesActivatedUntil;
@end
@implementation NotesUIFeedbackButton
+ (Class)cellClass {return NotesUIFeedbackButtonCell.class;}
- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if(self.notesTracking)[self removeTrackingArea:self.notesTracking];
    self.notesTracking=[[NSTrackingArea alloc] initWithRect:NSZeroRect
        options:NSTrackingMouseEnteredAndExited|NSTrackingActiveInKeyWindow|NSTrackingInVisibleRect
        owner:self userInfo:nil];
    [self addTrackingArea:self.notesTracking];
    NSPoint point=[self convertPoint:self.window.mouseLocationOutsideOfEventStream fromView:nil];
    self.notesHovered=self.window.isKeyWindow && NSPointInRect(point,self.bounds);
}
- (void)setNotesHovered:(BOOL)value {_notesHovered=value;self.needsDisplay=YES;}
- (void)setNotesMenuOpen:(BOOL)value {_notesMenuOpen=value;self.needsDisplay=YES;}
- (void)setNotesSelected:(BOOL)value {_notesSelected=value;self.needsDisplay=YES;}
- (void)setState:(NSControlStateValue)value {[super setState:value];self.needsDisplay=YES;}
- (void)setEnabled:(BOOL)value {
    [super setEnabled:value];
    if(!value){self.notesHovered=NO;self.notesActivatedUntil=0;self.notesMenuOpen=NO;}
    self.needsDisplay=YES;[self.window invalidateCursorRectsForView:self];
}
- (void)mouseEntered:(NSEvent *)event {(void)event;self.notesHovered=YES;}
- (void)mouseExited:(NSEvent *)event {(void)event;self.notesHovered=NO;}
- (void)resetCursorRects {
    [super resetCursorRects];if(self.enabled)[self addCursorRect:self.bounds cursor:NSCursor.pointingHandCursor];
}
- (NSString *)notesFeedbackState {
    if(!self.enabled)return @"disabled";
    if(self.notesMenuOpen)return @"open";
    if(self.cell.highlighted)return @"pressed";
    if(self.notesActivatedUntil>NSDate.timeIntervalSinceReferenceDate)return @"activated";
    // Momentary NSButton tracking can temporarily change cell.state.
    // Only the application's semantic selection owns persistent feedback.
    if(self.notesSelected)return @"selected";
    return self.notesHovered?@"hover":@"idle";
}
- (BOOL)sendAction:(SEL)action to:(id)target {
    if(!self.enabled)return NO;
    self.notesActivatedUntil=NSDate.timeIntervalSinceReferenceDate+.18;self.needsDisplay=YES;
    __weak NotesUIFeedbackButton *weak=self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(.19*NSEC_PER_SEC)),dispatch_get_main_queue(),^{weak.needsDisplay=YES;});
    return [super sendAction:action to:target];
}
- (void)viewDidChangeEffectiveAppearance {[super viewDidChangeEffectiveAppearance];self.needsDisplay=YES;}
- (void)drawRect:(NSRect)dirtyRect {
    NSString *state=self.notesFeedbackState;
    BOOL dark=[[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua,NSAppearanceNameDarkAqua]] isEqualToString:NSAppearanceNameDarkAqua];
    BOOL selected=[state isEqual:@"open"] || [state isEqual:@"selected"];
    CGFloat alpha=[state isEqual:@"pressed"]?.18:[state isEqual:@"activated"]?.14:[state isEqual:@"hover"]?.08:0;
    if(selected || alpha>0) {
        NSColor *color=selected?[NSColor colorWithSRGBRed:1 green:.72 blue:.14 alpha:(dark?.24:.20)+(self.notesHovered?.08:0)]:[NSColor colorWithWhite:dark?1:0 alpha:dark?alpha*1.5:alpha];
        [color setFill];CGFloat scale=self.notesFeedbackScale>0?self.notesFeedbackScale:1;
        NSRect rect=NSInsetRect(self.bounds,2*scale,2*scale);
        [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:7*scale yRadius:7*scale] fill];
    }
    [super drawRect:dirtyRect];
}
@end

@implementation NotesUIFormatButton
- (BOOL)acceptsFirstResponder {return NO;}
- (BOOL)acceptsFirstMouse:(NSEvent *)event {(void)event;return YES;}
@end

@interface NotesUIFormatRoot : NSView
@end
@implementation NotesUIFormatRoot
- (BOOL)isFlipped {return YES;}
- (BOOL)acceptsFirstResponder {return NO;}
@end

@interface NotesUIFormatLabel : NSTextField
@end
@implementation NotesUIFormatLabel
- (NSView *)hitTest:(NSPoint)point {(void)point;return nil;}
@end

static void collectEntries(NSArray *entries, NSMutableDictionary *result) {
    for(NSDictionary *entry in entries) {
        if([entry[@"kind"] isEqual:@"item"])result[entry[@"command"]]=entry;
        else if([entry[@"kind"] isEqual:@"submenu"])collectEntries(entry[@"items"],result);
    }
}
NSDictionary<NSString *,NSDictionary *> *notesUIFormatEntries(NSArray *entries) {
    NSMutableDictionary *result=[NSMutableDictionary dictionary];collectEntries(entries,result);return result;
}
NSColor *notesUIFormatColor(NSString *command) {
    NSDictionary *colors=@{@"colorDefault":NSColor.labelColor,@"colorPurple":NSColor.systemPurpleColor,
        @"colorPink":NSColor.systemPinkColor,@"colorOrange":NSColor.systemOrangeColor,
        @"colorMint":NSColor.systemGreenColor,@"colorBlue":NSColor.systemBlueColor};
    return colors[command]?:NSColor.systemPurpleColor;
}
NSImage *notesUIFormatSwatch(NSString *command) {
    return [NSImage imageWithSize:NSMakeSize(10,10) flipped:NO drawingHandler:^BOOL(NSRect rect) {
        [notesUIFormatColor(command) setFill];[[NSBezierPath bezierPathWithOvalInRect:NSInsetRect(rect,1,1)] fill];return YES;
    }];
}
static NotesUIFormatButton *formatButton(NSString *command,NSDictionary *entry,uint64_t revision,id target,SEL selector,NSRect frame) {
    NotesUIFormatButton *button=[[NotesUIFormatButton alloc] initWithFrame:frame];
    button.notesCommand=command;button.notesRevision=revision;button.title=@"";
    button.target=target;button.action=selector;button.bordered=NO;
    button.refusesFirstResponder=YES;button.focusRingType=NSFocusRingTypeNone;
    [button setButtonType:NSButtonTypeMomentaryPushIn];
    button.enabled=[entry[@"enabled"] boolValue];button.state=[entry[@"selected"] boolValue]?NSControlStateValueOn:NSControlStateValueOff;
    button.notesSelected=[entry[@"selected"] boolValue];
    [button setAccessibilityLabel:entry[@"label"]?:@""];return button;
}
static void separator(NSView *root,NSRect frame) {
    NSBox *line=[[NSBox alloc] initWithFrame:frame];line.boxType=NSBoxSeparator;[root addSubview:line];
}
static void addLabel(NotesUIFormatButton *button,NSString *text,NSFont *font,NSRect frame) {
    NotesUIFormatLabel *label=[NotesUIFormatLabel labelWithString:text];label.font=font;label.frame=frame;
    label.textColor=button.enabled?NSColor.labelColor:NSColor.disabledControlTextColor;
    label.lineBreakMode=NSLineBreakByTruncatingTail;label.maximumNumberOfLines=1;
    [label setAccessibilityElement:NO];[button addSubview:label];
}
NSPopover *notesUIFormatPopover(NSDictionary<NSString *,NSDictionary *> *entries,uint64_t revision,id target,SEL commandAction,SEL colorAction) {
    // Approximate visible body from 649c24e, not an assertion about Notes' internal frames.
    NotesUIFormatRoot *root=[[NotesUIFormatRoot alloc] initWithFrame:NSMakeRect(0,0,176,325)];
    [root setAccessibilityLabel:@"格式"];[root setAccessibilityRole:NSAccessibilityGroupRole];
    NSArray *marks=@[@"bold",@"italic",@"underline",@"strikethrough",@"highlight"];
    NSArray *symbols=@[@"bold",@"italic",@"underline",@"strikethrough",@"highlighter"];
    for(NSUInteger i=0;i<marks.count;i++) {
        NSDictionary *entry=entries[marks[i]];if(!entry)continue;
        NotesUIFormatButton *button=formatButton(marks[i],entry,revision,target,commandAction,NSMakeRect(6+i*29,4,29,31));
        NSImage *image=[NSImage imageWithSystemSymbolName:symbols[i] accessibilityDescription:entry[@"label"]];
        button.image=[image imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:16 weight:NSFontWeightRegular]];
        button.imagePosition=NSImageOnly;button.contentTintColor=button.enabled?NSColor.labelColor:NSColor.disabledControlTextColor;
        [root addSubview:button];
    }
    separator(root,NSMakeRect(122,9,0.5,22));
    NSArray *colors=@[@"colorDefault",@"colorPurple",@"colorPink",@"colorOrange",@"colorMint",@"colorBlue"];
    BOOL hasColor=NO,enabled=NO;NSString *selectedColor=@"colorPurple";
    for(NSString *command in colors)if(entries[command]) {
        hasColor=YES;enabled|=[entries[command][@"enabled"] boolValue];
        if([entries[command][@"selected"] boolValue])selectedColor=command;
    }
    if(hasColor) {
        NSDictionary *entry=@{@"label":@"颜色菜单",@"enabled":@(enabled),@"selected":@NO};
        NotesUIFormatButton *color=formatButton(@"",entry,revision,target,colorAction,NSMakeRect(151,4,20,31));
        color.image=notesUIFormatSwatch(selectedColor);color.imagePosition=NSImageOnly;
        [color setAccessibilityRole:NSAccessibilityPopUpButtonRole];[root addSubview:color];
    }
    separator(root,NSMakeRect(6,38,164,0.5));
    NSArray *rows=@[@"styleTitle",@"styleHeading",@"styleSubheading",@"styleBody",@"styleMonospaced",
        @"listBullet",@"listDash",@"listNumber"];
    CGFloat y=44;
    for(NSString *command in rows) {
        NSDictionary *entry=entries[command];if(!entry)continue;
        NotesUIFormatButton *button=formatButton(command,entry,revision,target,commandAction,NSMakeRect(6,y,164,29));
        NSFont *font=[NSFont systemFontOfSize:13];
        if([command isEqual:@"styleTitle"])font=[NSFont systemFontOfSize:20 weight:NSFontWeightBold];
        else if([command isEqual:@"styleHeading"])font=[NSFont systemFontOfSize:16 weight:NSFontWeightSemibold];
        else if([command isEqual:@"styleSubheading"])font=[NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
        else if([command isEqual:@"styleMonospaced"])font=[NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular];
        CGFloat height=ceil(font.ascender-font.descender+2);
        addLabel(button,entry[@"label"],font,NSMakeRect(29.5,(29-height)/2,132,height));
        if([entry[@"selected"] boolValue])addLabel(button,@"✓",[NSFont systemFontOfSize:13],NSMakeRect(9,5,16,19));
        [root addSubview:button];y+=29;
    }
    if(entries[@"blockquote"]) {
        separator(root,NSMakeRect(6,y+7.5,164,0.5));y+=15;
        NSDictionary *entry=entries[@"blockquote"];
        NotesUIFormatButton *button=formatButton(@"blockquote",entry,revision,target,commandAction,NSMakeRect(6,y,164,29));
        addLabel(button,entry[@"label"],[NSFont systemFontOfSize:13],NSMakeRect(29.5,5,132,19));
        if([entry[@"selected"] boolValue])addLabel(button,@"✓",[NSFont systemFontOfSize:13],NSMakeRect(9,5,16,19));
        [root addSubview:button];y+=29;
    }
    NSSize size=NSMakeSize(176,MAX(44,y+5));root.frame=NSMakeRect(0,0,size.width,size.height);
    NSViewController *viewController=[NSViewController new];viewController.view=root;viewController.preferredContentSize=size;
    NSPopover *popover=[NSPopover new];popover.contentViewController=viewController;popover.contentSize=size;
    popover.behavior=NSPopoverBehaviorTransient;popover.animates=NO;
    return popover;
}
