#import <AppKit/AppKit.h>
static NSColor *sidebarTintColor(void) {
    return [NSColor colorWithName:@"NotesSidebarSymbol" dynamicProvider:^NSColor *(NSAppearance *appearance) {
        __block NSColor *label;
        [appearance performAsCurrentDrawingAppearance:^{label=[NSColor.labelColor colorUsingColorSpace:NSColorSpace.sRGBColorSpace];}];
        NSString *match=[appearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua,NSAppearanceNameDarkAqua,
            NSAppearanceNameAccessibilityHighContrastAqua,NSAppearanceNameAccessibilityHighContrastDarkAqua]];
        // Only ordinary light appearance has a measured Notes reference.
        return [match isEqual:NSAppearanceNameAqua]?[label colorWithAlphaComponent:0.70]:label;
    }];
}


int main(void){@autoreleasepool {
 NSMutableArray *rows=[NSMutableArray array];
 NSDictionary *colors=@{@"productionProvider":sidebarTintColor(),@"label":NSColor.labelColor,@"controlText":NSColor.controlTextColor,@"secondaryLabel":NSColor.secondaryLabelColor,@"text":NSColor.textColor,@"labelAlpha0.70":[NSColor.labelColor colorWithAlphaComponent:0.70]};
 for(NSString *name in @[NSAppearanceNameAqua,NSAppearanceNameDarkAqua,NSAppearanceNameAccessibilityHighContrastAqua,NSAppearanceNameAccessibilityHighContrastDarkAqua]){
  NSAppearance *appearance=[NSAppearance appearanceNamed:name];
  [appearance performAsCurrentDrawingAppearance:^{for(NSString *colorName in [[colors allKeys] sortedArrayUsingSelector:@selector(compare:)]){
   NSColor *c=[colors[colorName] colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
   if(c){CGFloat red,green,blue,alpha;[c getRed:&red green:&green blue:&blue alpha:&alpha];[rows addObject:@{@"appearance":name,@"name":colorName,@"srgb":@[@(red),@(green),@(blue)],@"alpha":@(alpha),@"compositeOnWhite255":@[@(255*(red*alpha+1-alpha)),@(255*(green*alpha+1-alpha)),@(255*(blue*alpha+1-alpha))],@"compositeOnBlack255":@[@(255*red*alpha),@(255*green*alpha),@(255*blue*alpha)]}];}
  }}];
 }
 NSData *d=[NSJSONSerialization dataWithJSONObject:@{@"rows":rows,@"createdApplication":@(NSApp!=nil),@"limits":@"Public dynamic NSColor resolved in current drawing appearance; white/black compositing arithmetic only, no actual toolbar painting, backdrop, dark Notes screenshot or pixel parity."} options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];[[NSFileHandle fileHandleWithStandardOutput] writeData:d];return 0;
}}
