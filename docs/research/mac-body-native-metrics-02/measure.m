#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreText/CoreText.h>

// Read-only, view-free text-layout diagnostic. Never constructs NSApplication,
// NSWindow, NSTextView, or a graphics context. Native values are points, not
// screenshot pixels; the PDF font is an export control, not a screen claim.
static NSMutableArray *inventory;
static NSMutableDictionary *fontKeys;

static id JSONValue(id value) {
    if (!value || value == (id)kCFNull) return [NSNull null];
    if ([value isKindOfClass:NSString.class] || [value isKindOfClass:NSNumber.class]) return value;
    if ([value isKindOfClass:NSArray.class]) {
        NSMutableArray *array = [NSMutableArray array];
        for (id item in value) [array addObject:JSONValue(item)];
        return array;
    }
    if ([value isKindOfClass:NSDictionary.class]) {
        NSMutableDictionary *dict = [NSMutableDictionary dictionary];
        for (id key in value) dict[[key description]] = JSONValue(value[key]);
        return dict;
    }
    return [value description];
}

static NSArray *MetricRect(NSRect r) { return @[@(r.origin.x), @(r.origin.y), @(r.size.width), @(r.size.height)]; }
static NSArray *Range(NSRange r) { return @[@(r.location), @(r.length)]; }
static NSArray *MetricPoint(CGPoint p) { return @[@(p.x), @(p.y)]; }

static NSString *FontID(CTFontRef font) {
    NSString *ps = CFBridgingRelease(CTFontCopyPostScriptName(font));
    NSString *family = CFBridgingRelease(CTFontCopyFamilyName(font));
    id settings = JSONValue(CFBridgingRelease(CTFontCopyFeatureSettings(font)));
    id url = CFBridgingRelease(CTFontCopyAttribute(font, kCTFontURLAttribute));
    NSDictionary *entry = @{
        @"postScriptName": ps ?: @"", @"familyName": family ?: @"",
        @"sizePt": @(CTFontGetSize(font)), @"url": url ? [url description] : (id)[NSNull null],
        @"actualFeatureSettings": settings,
        @"ascentPt": @(CTFontGetAscent(font)), @"descentPt": @(CTFontGetDescent(font)),
        @"leadingPt": @(CTFontGetLeading(font)),
    };
    NSData *encoded = [NSJSONSerialization dataWithJSONObject:entry options:NSJSONWritingSortedKeys error:NULL];
    NSString *key = [[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding];
    NSString *identifier = fontKeys[key];
    if (!identifier) {
        identifier = [NSString stringWithFormat:@"font-%lu", (unsigned long)inventory.count];
        fontKeys[key] = identifier;
        NSMutableDictionary *record = [entry mutableCopy];
        record[@"id"] = identifier;
        [inventory addObject:record];
    }
    return identifier;
}

static NSDictionary *MeasureLine(NSString *text, CTFontRef font, BOOL glyphDetails) {
    NSAttributedString *string = [[NSAttributedString alloc] initWithString:text attributes:@{
        (__bridge NSString *)kCTFontAttributeName: (__bridge id)font,
        (__bridge NSString *)kCTLanguageAttributeName: @"zh-Hans",
    }];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)string);
    CGFloat ascent = 0, descent = 0, leading = 0;
    double advance = CTLineGetTypographicBounds(line, &ascent, &descent, &leading);
    CGRect ink = CTLineGetBoundsWithOptions(line, kCTLineBoundsUseGlyphPathBounds);
    NSMutableArray *runs = [NSMutableArray array];
    for (id object in (__bridge NSArray *)CTLineGetGlyphRuns(line)) {
        CTRunRef run = (__bridge CTRunRef)object;
        NSDictionary *attributes = (__bridge NSDictionary *)CTRunGetAttributes(run);
        CTFontRef actual = (__bridge CTFontRef)attributes[(__bridge NSString *)kCTFontAttributeName];
        CFRange range = CTRunGetStringRange(run);
        CGAffineTransform matrix = CTRunGetTextMatrix(run);
        NSMutableDictionary *record = [@{
            @"fontId": FontID(actual), @"utf16Range": @[@(range.location), @(range.length)],
            @"glyphCount": @(CTRunGetGlyphCount(run)),
            @"advancePt": @(CTRunGetTypographicBounds(run, CFRangeMake(0, 0), NULL, NULL, NULL)),
            @"textMatrix": @[@(matrix.a), @(matrix.b), @(matrix.c), @(matrix.d), @(matrix.tx), @(matrix.ty)],
        } mutableCopy];
        if (glyphDetails) {
            CFIndex count = CTRunGetGlyphCount(run);
            CGGlyph *glyphs = calloc((size_t)MAX(count, 1), sizeof(CGGlyph));
            CGPoint *positions = calloc((size_t)MAX(count, 1), sizeof(CGPoint));
            CGSize *advances = calloc((size_t)MAX(count, 1), sizeof(CGSize));
            CFIndex *indices = calloc((size_t)MAX(count, 1), sizeof(CFIndex));
            CTRunGetGlyphs(run, CFRangeMake(0, 0), glyphs);
            CTRunGetPositions(run, CFRangeMake(0, 0), positions);
            CTRunGetAdvances(run, CFRangeMake(0, 0), advances);
            CTRunGetStringIndices(run, CFRangeMake(0, 0), indices);
            NSMutableArray *details = [NSMutableArray array];
            for (CFIndex i = 0; i < count; i++) {
                [details addObject:@{
                    @"glyph": @(glyphs[i]), @"utf16Index": @(indices[i]),
                    @"positionPt": MetricPoint(positions[i]),
                    @"advancePt": @[@(advances[i].width), @(advances[i].height)],
                }];
            }
            record[@"glyphs"] = details;
            free(glyphs); free(positions); free(advances); free(indices);
        }
        [runs addObject:record];
    }
    NSDictionary *result = @{
        @"advancePt": @(advance), @"ascentPt": @(ascent), @"descentPt": @(descent),
        @"leadingPt": @(leading), @"glyphPathBoundsPt": CGRectIsNull(ink) || CGRectIsInfinite(ink) ? (id)[NSNull null] : MetricRect(NSRectFromCGRect(ink)), @"runs": runs,
    };
    CFRelease(line);
    return result;
}

static NSDictionary *MeasureLayout(NSString *text, NSFont *font, NSString *mode) {
    NSMutableParagraphStyle *paragraph = [NSParagraphStyle.defaultParagraphStyle mutableCopy];
    if ([mode isEqualToString:@"fixed-17.22"]) {
        paragraph.minimumLineHeight = 17.22;
        paragraph.maximumLineHeight = 17.22;
    }
    NSTextStorage *storage = [[NSTextStorage alloc] initWithString:text attributes:@{
        NSFontAttributeName: font, NSParagraphStyleAttributeName: paragraph,
        (__bridge NSString *)kCTLanguageAttributeName: @"zh-Hans",
    }];
    NSLayoutManager *manager = [[NSLayoutManager alloc] init];
    BOOL initialLeading = manager.usesFontLeading;
    if ([mode isEqualToString:@"natural-no-leading"]) manager.usesFontLeading = NO;
    NSTextContainer *container = [[NSTextContainer alloc] initWithContainerSize:NSMakeSize(10000, 10000)];
    CGFloat initialPadding = container.lineFragmentPadding;
    container.lineFragmentPadding = 0;
    [manager addTextContainer:container];
    [storage addLayoutManager:manager];
    [manager ensureLayoutForTextContainer:container];
    NSRange range = [manager glyphRangeForTextContainer:container];
    NSMutableArray *lines = [NSMutableArray array];
    [manager enumerateLineFragmentsForGlyphRange:range usingBlock:^(NSRect rect, NSRect used, NSTextContainer *tc, NSRange glyphRange, BOOL *stop) {
        NSRange characters = [manager characterRangeForGlyphRange:glyphRange actualGlyphRange:NULL];
        NSPoint location = [manager locationForGlyphAtIndex:glyphRange.location];
        [lines addObject:@{
            @"glyphRange": Range(glyphRange), @"utf16Range": Range(characters),
            @"lineFragmentPt": MetricRect(rect), @"usedRectPt": MetricRect(used),
            @"firstGlyphLocationInFragmentPt": MetricPoint(location),
            @"firstGlyphBaselineYPt": @(rect.origin.y + location.y),
        }];
    }];
    return @{
        @"mode": mode, @"initialUsesFontLeading": @(initialLeading), @"usesFontLeading": @(manager.usesFontLeading),
        @"initialLineFragmentPaddingPt": @(initialPadding), @"lineFragmentPaddingPt": @(container.lineFragmentPadding),
        @"containerWidthPt": @(container.containerSize.width),
        @"defaultLineHeightForFontPt": @([manager defaultLineHeightForFont:font]),
        @"defaultBaselineOffsetForFontPt": @([manager defaultBaselineOffsetForFont:font]),
        @"paragraph": @{
            @"minimumLineHeight": @(paragraph.minimumLineHeight), @"maximumLineHeight": @(paragraph.maximumLineHeight),
            @"lineSpacing": @(paragraph.lineSpacing), @"lineHeightMultiple": @(paragraph.lineHeightMultiple),
            @"paragraphSpacing": @(paragraph.paragraphSpacing), @"paragraphSpacingBefore": @(paragraph.paragraphSpacingBefore),
        }, @"lines": lines,
    };
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 4) {
            fprintf(stderr, "usage: measure corpus.json context-corpus.json output.json\n");
            return 2;
        }
        NSError *error = nil;
        NSData *data = [NSData dataWithContentsOfFile:@(argv[1]) options:0 error:&error];
        NSDictionary *corpus = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&error] : nil;
        NSString *text = corpus[@"text"];
        if (![text isKindOfClass:NSString.class]) {
            fprintf(stderr, "invalid corpus: %s\n", error.description.UTF8String ?: "no text string");
            return 3;
        }
        NSData *contextData = [NSData dataWithContentsOfFile:@(argv[2]) options:0 error:&error];
        NSDictionary *contextCorpus = contextData ? [NSJSONSerialization JSONObjectWithData:contextData options:0 error:&error] : nil;
        NSString *contextText = contextCorpus[@"text"];
        if (![contextText isKindOfClass:NSString.class]) {
            fprintf(stderr, "invalid context corpus: %s\n", error.description.UTF8String ?: "no text string");
            return 3;
        }
        inventory = [NSMutableArray array]; fontKeys = [NSMutableDictionary dictionary];
        NSMutableArray *fonts = [NSMutableArray arrayWithObject:@{
            @"label": @"system-13-control", @"font": [NSFont systemFontOfSize:13 weight:NSFontWeightRegular],
            @"requestedSizePt": @13,
        }];
        NSMutableArray *failures = [NSMutableArray array];
        NSArray *namedControls = @[
            @{ @"label": @"pdf-ui-family-13-control", @"name": @".PingFangUITextSC-Regular", @"size": @13 },
            @{ @"label": @"ordinary-pingfang-13-control", @"name": @"PingFangSC-Regular", @"size": @13 },
            @{ @"label": @"pdf-ui-family-nominal-12-control", @"name": @".PingFangUITextSC-Regular", @"size": @12 },
        ];
        for (NSDictionary *control in namedControls) {
            NSString *name = control[@"name"];
            CGFloat size = [control[@"size"] doubleValue];
            NSFont *font = [NSFont fontWithName:name size:size];
            if (!font) {
                [failures addObject:@{ @"control": control, @"failure": @"NSFont fontWithName returned nil; no replacement requested" }];
                continue;
            }
            [fonts addObject:@{ @"label": control[@"label"], @"font": font,
                @"requestedName": name, @"returnedNSFontName": font.fontName, @"requestedSizePt": @(size) }];
        }
        NSMutableArray *measurements = [NSMutableArray array];
        NSArray *sourceLines = [text componentsSeparatedByString:@"\n"];
        for (NSDictionary *item in fonts) {
            NSFont *font = item[@"font"];
            CTFontRef base = (__bridge CTFontRef)font;
            NSMutableDictionary *fontResult = [item mutableCopy];
            [fontResult removeObjectForKey:@"font"];
            fontResult[@"baseFontId"] = FontID(base);
            NSMutableArray *featureResults = [NSMutableArray array];
            for (NSString *tag in @[@"default", @"palt", @"chws", @"halt"]) {
                CTFontRef candidate = NULL;
                NSArray *requested = @[];
                if ([tag isEqualToString:@"default"]) candidate = CFRetain(base);
                else {
                    requested = @[@{ (__bridge NSString *)kCTFontOpenTypeFeatureTag: tag,
                        (__bridge NSString *)kCTFontOpenTypeFeatureValue: @1 }];
                    CTFontDescriptorRef descriptor = CTFontDescriptorCreateWithAttributes((__bridge CFDictionaryRef)@{
                        (__bridge NSString *)kCTFontFeatureSettingsAttribute: requested });
                    candidate = CTFontCreateCopyWithAttributes(base, CTFontGetSize(base), NULL, descriptor);
                    CFRelease(descriptor);
                }
                if (!candidate) { fprintf(stderr, "font candidate creation failed\n"); return 5; }
                NSMutableArray *lines = [NSMutableArray array];
                NSUInteger sourceOffset = 0;
                for (NSUInteger i = 0; i < sourceLines.count; i++) {
                    NSString *line = sourceLines[i];
                    NSMutableDictionary *record = [MeasureLine(line, candidate, i == 4) mutableCopy];
                    record[@"lineIndex"] = @(i); record[@"utf16SourceOffset"] = @(sourceOffset);
                    record[@"text"] = line;
                    [lines addObject:record]; sourceOffset += line.length + 1;
                }
                [featureResults addObject:@{ @"feature": tag, @"requestedFeatureSettings": requested,
                    @"requestedFontId": FontID(candidate), @"lines": lines }];
                CFRelease(candidate);
            }
            fontResult[@"coreText"] = featureResults;
            NSMutableArray *layouts = [NSMutableArray array];
            for (NSString *mode in @[@"natural-default", @"natural-no-leading", @"fixed-17.22"])
                [layouts addObject:MeasureLayout(text, font, mode)];
            fontResult[@"textKit"] = layouts;
            NSMutableArray *contexts = [NSMutableArray array];
            NSArray *contextLines = [contextText componentsSeparatedByString:@"\n"];
            for (NSUInteger i = 1; i <= 2; i++) {
                NSString *line = contextLines[i];
                [contexts addObject:@{ @"label": i == 1 ? @"adjacent-punctuation" : @"han-separated-punctuation",
                    @"text": line, @"metrics": MeasureLine(line, base, YES) }];
            }
            for (NSString *punct in @[@"，", @"。", @"！", @"？", @"；", @"：", @"《", @"》"]) {
                [contexts addObject:@{ @"label": @"isolated-punctuation", @"text": punct,
                    @"metrics": MeasureLine(punct, base, YES) }];
            }
            fontResult[@"punctuationContexts"] = contexts;
            NSMutableArray *contextLayouts = [NSMutableArray array];
            for (NSString *mode in @[@"natural-default", @"natural-no-leading", @"fixed-17.22"])
                [contextLayouts addObject:MeasureLayout(contextText, font, mode)];
            fontResult[@"contextTextKit"] = contextLayouts;
            [measurements addObject:fontResult];
        }
        NSDictionary *result = @{
            @"schema": @1, @"osVersion": NSProcessInfo.processInfo.operatingSystemVersionString,
            @"languageAttribute": @"zh-Hans", @"unit": @"native points; no screen pixel conversion assumed",
            @"scope": @"Controlled native shaping and view-free TextKit 1 layout, not Apple Notes screen implementation evidence",
            @"pdfControlBasis": @"PDF export resource .PingFangUITextSC-Regular and nominal text matrix size 12; export scale 0.9798793 is not applied and no screen size equivalence is assumed",
            @"corpusUTF16Length": @(text.length), @"fontInventory": inventory, @"measurements": measurements, @"failures": failures,
        };
        NSData *output = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:&error];
        if (!output || output.length > 300 * 1024) {
            fprintf(stderr, "serialization failed or JSON exceeded 300KiB (%lu bytes): %s\n", (unsigned long)output.length, error.description.UTF8String ?: "");
            return 6;
        }
        if (![output writeToFile:@(argv[3]) options:NSDataWritingWithoutOverwriting error:&error]) {
            fprintf(stderr, "output write failed: %s\n", error.description.UTF8String); return 7;
        }
        fprintf(stdout, "wrote %lu bytes; %lu font identities; %lu font controls\n", (unsigned long)output.length,
            (unsigned long)inventory.count, (unsigned long)measurements.count);
    }
    return 0;
}
