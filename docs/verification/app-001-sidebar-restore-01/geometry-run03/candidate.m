
#import <AppKit/AppKit.h>
// These ports only record values assigned by the unmodified production methods.
@interface GeometryView : NSObject
@property NSRect frame;
@property NSRect bounds;
@property(getter=isFlipped) BOOL flipped;
@property BOOL hidden;
@property BOOL reserveTrafficLights;
@end
@implementation GeometryView @end
@interface NotesUIButton : GeometryView @end
@implementation NotesUIButton @end
@interface GeometryWindow : NSObject
@property NSView *contentView;
@property NSWindowStyleMask styleMask;
@end
@implementation GeometryWindow @end
@interface GeometryController : NSObject
@property GeometryWindow *window;
@property BOOL disposed;
@property NSDictionary *state;
@property GeometryView *root;
@property NSMutableDictionary<NSString *,GeometryView *> *groups;
@property NSMutableSet<NSString *> *layoutGroups;
@property NSMutableDictionary<NSString *,NotesUIButton *> *buttons;
@property NSMutableDictionary<NSString *,NSDictionary *> *actionStates;
@property GeometryView *search;
@property GeometryView *title;
@property GeometryView *count;
@property NSArray *overflow;
@property NSMutableDictionary *recorded;
- (void)placeGroup:(NSString *)name x:(CGFloat)x width:(CGFloat)width actions:(NSArray *)actions;
- (CGFloat)widthFor:(NSArray *)visible search:(CGFloat)searchWidth overflow:(BOOL)overflow;
- (void)layout;
@end
static NSArray *rect(NSRect r) {return @[@(r.origin.x),@(r.origin.y),@(r.size.width),@(r.size.height)];}
@implementation GeometryController
- (void)placeGroup:(NSString *)name x:(CGFloat)x width:(CGFloat)width actions:(NSArray *)actions {
    if(width>0)[self.layoutGroups addObject:name];
    self.recorded[name]=@{@"frame":rect(NSMakeRect(x,8,MAX(0,width),36)),@"actions":actions};
}
- (CGFloat)widthFor:(NSArray *)visible search:(CGFloat)searchWidth overflow:(BOOL)overflow {
    CGFloat width=0;BOOL any=NO;
    for(NSArray *group in @[@[@"newNote"],@[@"format",@"checklist",@"table",@"attachment"],@[@"share",@"more"]]) {
        NSUInteger count=0;for(NSString *action in group)if([visible containsObject:action])count++;
        if(count){width+=(any?18:0)+(group.count==1?36:40*count+(group.count==4?1:0));any=YES;}
    }
    if(overflow){width+=(any?10:0)+36;any=YES;}
    if(searchWidth>0)width+=(any?16:0)+searchWidth;
    return width;
}
- (void)layout {
    if(self.disposed || !self.window.contentView)return;
    NSView *parent=self.window.contentView;NSRect bounds=parent.bounds;CGFloat w=NSWidth(bounds);
    self.root.frame=NSMakeRect(NSMinX(bounds),parent.flipped?NSMinY(bounds):NSMaxY(bounds)-52,w,52);
    self.layoutGroups=[NSMutableSet set];
    for(NotesUIButton *button in self.buttons.allValues)button.hidden=YES;
    BOOL full=(self.window.styleMask&NSWindowStyleMaskFullSizeContentView)!=0;self.root.reserveTrafficLights=full;
    CGFloat traffic=full?94:12;NSDictionary *columns=self.state[@"columns"];
    BOOL sidebar=[columns[@"sidebarVisible"] boolValue];CGFloat side=sidebar?[columns[@"sidebarWidth"] doubleValue]:0;
    NSString *layout=self.state[@"layout"];BOOL three=[layout isEqual:@"threeColumn"];
    BOOL browse=[layout isEqual:@"galleryBrowse"],gallery=[layout isEqual:@"galleryExpanded"];
    CGFloat boundary=three?side+[columns[@"listWidth"] doubleValue]:traffic;
    // 649c24e measures ink/surfaces, not internal AppKit frames. These are calibration starts.
    CGFloat titleX=three?(side>0?side+19:traffic+8):MAX(side+11,traffic+8);
    NSMutableArray *hidden=[NSMutableArray array];
    CGFloat sidebarRight=traffic;
    if(![layout isEqual:@"independentNote"]) {
        NSMutableArray *actions=[NSMutableArray array];
        if(sidebar && self.actionStates[@"newFolder"])[actions addObject:@"newFolder"];
        if(self.actionStates[@"toggleSidebar"])[actions addObject:@"toggleSidebar"];
        // The direct restore control survives a hidden or narrow folder column.
        // Adding folders follows the visible column; only that action may overflow.
        if(sidebar && traffic+actions.count*36>=side-6 && [actions containsObject:@"newFolder"]) {
            [actions removeObject:@"newFolder"];[hidden addObject:@"newFolder"];
        }
        if(actions.count) {
            CGFloat width=actions.count*36;
            [self placeGroup:@"sidebar" x:traffic width:width actions:actions];sidebarRight=traffic+width;
            titleX=MAX(titleX,sidebarRight+8);
        }
    }
    if(gallery && self.actionStates[@"backToGallery"]) {
        CGFloat backX=MAX(MAX(side+8,traffic+8),sidebarRight+8);
        [self placeGroup:@"back" x:backX width:36 actions:@[@"backToGallery"]];titleX=backX+47;
    }
    BOOL hasSearch=self.state[@"search"] && (id)self.state[@"search"]!=NSNull.null;
    CGFloat minimumStart=(browse||gallery)?titleX+140:boundary+9;
    CGFloat start=MAX(traffic+8,MIN(minimumStart,MAX(traffic+8,w-160)));
    CGFloat available=MAX(0,w-start-8),searchWidth=0;
    if(browse) {
        NSMutableArray *actions=[NSMutableArray array];for(NSString *action in @[@"viewOptions",@"newNote"])
            if(self.actionStates[action])[actions addObject:action];
        CGFloat width=actions.count*36;
        if(hasSearch)searchWidth=MIN(MAX(90,(w-side)*0.378),MAX(0,available-width-(width?33:0)-(hidden.count?46:0)));
        while(actions.count && width+(searchWidth>0?33+searchWidth:0)+(hidden.count?46:0)>available) {
            [hidden addObject:actions.firstObject];[actions removeObjectAtIndex:0];width=actions.count*36;
        }
        CGFloat total=width+(searchWidth>0?(width?33:0)+searchWidth:0)+(hidden.count?46:0);
        start=MAX(start,w-8-total);
        if(width)[self placeGroup:@"browse" x:start width:width actions:actions];
        CGFloat right=w-8;
        if(hasSearch && searchWidth>0){right-=searchWidth;[self placeGroup:@"search" x:right width:searchWidth actions:@[]];
            self.search.frame=NSMakeRect(10,4,MAX(1,searchWidth-20),28);right-=10;}
        if(hidden.count)[self placeGroup:@"overflow" x:right-36 width:36 actions:@[@"overflow"]];
    } else {
        NSMutableArray *visible=[NSMutableArray array];for(NSString *action in @[@"newNote",@"format",@"checklist",@"table",@"attachment",@"share",@"more"])
            if(self.actionStates[action])[visible addObject:action];
        if(three && self.actionStates[@"viewOptions"]) {
            CGFloat viewX=MIN(boundary-44,start-44);
            if(viewX>titleX+30)[self placeGroup:@"view" x:viewX width:36 actions:@[@"viewOptions"]];else[hidden addObject:@"viewOptions"];
        } else if(self.actionStates[@"viewOptions"])[hidden addObject:@"viewOptions"];
        if(hasSearch)searchWidth=gallery?MIN(233,MAX(90,(w-side)*0.23)):MAX(90,available-[self widthFor:visible search:1 overflow:hidden.count>0]+1);
        for(NSString *drop in @[@"share",@"attachment",@"table",@"checklist",@"format",@"newNote",@"more"]) {
            if([self widthFor:visible search:searchWidth overflow:hidden.count>0]<=available)break;
            if([visible containsObject:drop]){[visible removeObject:drop];[hidden addObject:drop];}
        }
        searchWidth=MIN(searchWidth,MAX(0,available-[self widthFor:visible search:hasSearch?1:0 overflow:hidden.count>0]+(hasSearch?1:0)));
        CGFloat groupGap=18;
        // Candidate wide three-column geometry; drop/overflow decisions above stay unchanged.
        if(three && hasSearch && visible.count==7 && hidden.count==0) {
            searchWidth=MIN(searchWidth,325);
            groupGap+=MAX(0,available-[self widthFor:visible search:searchWidth overflow:NO])/2;
        }
        CGFloat total=[self widthFor:visible search:searchWidth overflow:hidden.count>0];
        if(gallery)start=MAX(start,w-8-total);
        CGFloat left=start;BOOL any=NO;
        for(NSString *name in @[@"new",@"edit",@"share"]) {
            NSArray *candidates=[name isEqual:@"new"]?@[@"newNote"]:([name isEqual:@"edit"]?@[@"format",@"checklist",@"table",@"attachment"]:@[@"share",@"more"]);
            NSMutableArray *actions=[NSMutableArray array];for(NSString *action in candidates)if([visible containsObject:action])[actions addObject:action];
            if(!actions.count)continue;
            CGFloat width=[name isEqual:@"new"]?36:actions.count*40+([name isEqual:@"edit"]?1:0);
            if(any)left+=groupGap;[self placeGroup:name x:left width:width actions:actions];left+=width;any=YES;
        }
        if(hidden.count){if(any)left+=10;[self placeGroup:@"overflow" x:left width:36 actions:@[@"overflow"]];left+=36;any=YES;}
        if(hasSearch && searchWidth>0){if(any)left+=16;[self placeGroup:@"search" x:left width:searchWidth actions:@[]];
            self.search.frame=NSMakeRect(10,4,MAX(1,searchWidth-20),28);}
    }
    // Retained search ancestors must stay visible throughout updates/inspection, or AppKit
    // abandons their field editor (including marked text and caret) even when shown again.
    for(NSString *name in self.groups)self.groups[name].hidden=![self.layoutGroups containsObject:name];
    self.layoutGroups=nil;
    self.overflow=hidden;
    CGFloat titleRight=three?MIN(boundary-50,start-12):start-18;
    CGFloat titleWidth=MAX(0,titleRight-titleX);
    self.title.hidden=self.count.hidden=(!three&&!gallery&&!browse)||titleWidth<24;
    BOOL zeroSearchGeometry=three && sidebar && [self.state[@"folderTitle"] isEqual:@"搜索"]
        && [self.state[@"folderCount"] unsignedLongLongValue]==0 && hasSearch && [self.state[@"search"][@"value"] length]>0;
    // This root is flipped: the confirmed zero-result title moves down, its subtitle up.
    CGFloat textX=titleX-(zeroSearchGeometry?1:0);
    self.title.frame=NSMakeRect(textX,zeroSearchGeometry?11:9,titleWidth,18);
    self.count.frame=NSMakeRect(textX,zeroSearchGeometry?27:28,titleWidth,15);
}

@end
int main(void) {@autoreleasepool {
    NSData *input=[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
    NSArray *cases=[NSJSONSerialization JSONObjectWithData:input options:0 error:nil];
    NSMutableArray *results=[NSMutableArray array];
    NSMutableDictionary *retained=[NSMutableDictionary dictionary];
    for(NSDictionary *item in cases) {
        GeometryController *c=retained[item[@"chain"]];
        if(!c) {c=[GeometryController new];retained[item[@"chain"]]=c;
        GeometryWindow *window=[GeometryWindow new];
        GeometryView *parent=[GeometryView new];
        parent.bounds=NSMakeRect(0,0,[item[@"width"] doubleValue],900);parent.flipped=YES;
        window.contentView=(id)parent;
        window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;
        c.window=window;c.root=[GeometryView new];c.title=[GeometryView new];c.count=[GeometryView new];c.search=[GeometryView new];
        c.groups=[NSMutableDictionary dictionary];c.buttons=[NSMutableDictionary dictionary];c.actionStates=[NSMutableDictionary dictionary];c.recorded=[NSMutableDictionary dictionary];
        for(NSString *name in @[@"sidebar",@"back",@"view",@"new",@"edit",@"share",@"overflow",@"search",@"browse"]) c.groups[name]=[GeometryView new];
        for(NSString *action in item[@"actions"]) {c.actionStates[action]=@{};c.buttons[action]=[NotesUIButton new];}
        }
        ((GeometryView *)c.window.contentView).bounds=NSMakeRect(0,0,[item[@"width"] doubleValue],900);
        c.window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;
        [c.recorded removeAllObjects];
        NSMutableDictionary *state=[@{@"layout":item[@"layout"],@"columns":@{@"sidebarVisible":item[@"sidebarVisible"],@"sidebarWidth":item[@"sidebarWidth"],@"listWidth":item[@"listWidth"]},@"folderTitle":@"搜索",@"folderCount":@0} mutableCopy];
        if([item[@"search"] isEqual:@"present"])state[@"search"]=@{@"value":@"controlled-query",@"enabled":@YES};
        else if([item[@"search"] isEqual:@"null"])state[@"search"]=NSNull.null;
        c.state=state;
        [c layout];
        NSMutableDictionary *visibility=[NSMutableDictionary dictionary];
        for(NSString *name in c.groups)visibility[name]=@(!c.groups[name].hidden);
        [results addObject:@{@"name":item[@"name"],@"groups":[c.recorded copy],@"overflow":c.overflow,@"visibility":visibility,@"titleFrame":rect(c.title.frame),@"countFrame":rect(c.count.frame),@"titleHidden":@(c.title.hidden),@"countHidden":@(c.count.hidden),@"rootFrame":rect(c.root.frame),@"searchFieldFrame":rect(c.search.frame)}];
    }
    NSData *data=[NSJSONSerialization dataWithJSONObject:results options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];
    [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
    return 0;
}}
