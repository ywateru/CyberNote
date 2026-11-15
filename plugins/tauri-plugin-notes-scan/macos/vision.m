#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>
#import <CoreImage/CoreImage.h>

static char *jsonResult(id object) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
static char *failure(NSString *code, NSString *message) {
    return jsonResult(@{@"error": @{@"code":code, @"message":message ?: @"Native image operation failed"}});
}
// Input/output paths are created by the Rust private session store, never supplied by the WebView.
char *notes_scan_normalize(const char *input, const char *output) {
    @autoreleasepool {
        NSURL *url = [NSURL fileURLWithPath:@(input)];
        CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
        if (!source) return failure(@"invalid_image", @"无法读取图像");
        NSDictionary *props = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
        size_t w = [props[(__bridge NSString *)kCGImagePropertyPixelWidth] unsignedLongValue];
        size_t h = [props[(__bridge NSString *)kCGImagePropertyPixelHeight] unsignedLongValue];
        if (!w || !h || w > 12000 || h > 12000 || w * h > 24000000) {
            CFRelease(source);
            return failure(@"image_limit", @"图像尺寸超出限制");
        }
        // ImageIO performs the EXIF transform on CPU; no Metal context or visible app is required.
        NSDictionary *options = @{(__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways:@YES,
            (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform:@YES,
            (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize:@(MAX(w,h)),
            (__bridge NSString *)kCGImageSourceShouldCacheImmediately:@YES};
        CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
        CFRelease(source);
        if (!image) return failure(@"invalid_image", @"图像解码失败");
        CGImageDestinationRef dest = CGImageDestinationCreateWithURL(
            (__bridge CFURLRef)[NSURL fileURLWithPath:@(output)], CFSTR("public.png"), 1, NULL);
        if (!dest) { CGImageRelease(image); return failure(@"io", @"无法保存图像"); }
        CGImageDestinationAddImage(dest, image, NULL);
        BOOL ok = CGImageDestinationFinalize(dest);
        NSDictionary *result = @{@"width":@(CGImageGetWidth(image)), @"height":@(CGImageGetHeight(image))};
        CFRelease(dest); CGImageRelease(image);
        return ok ? jsonResult(result) : failure(@"io", @"无法保存图像");
    }
}
char *notes_scan_recognize(const char *path) {
    @autoreleasepool {
        VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        if (@available(macOS 13.0, *)) request.revision = VNRecognizeTextRequestRevision3;
        else request.revision = 2;
        NSError *error = nil;
        NSArray<NSString *> *supported = [request supportedRecognitionLanguagesAndReturnError:&error];
        if (!supported) return failure(@"ocr_unavailable", error.localizedDescription);
        NSMutableArray *languages = [NSMutableArray array];
        for (NSString *lang in @[@"zh-Hans", @"zh-Hant", @"en-US"])
            if ([supported containsObject:lang]) [languages addObject:lang];
        if (![languages containsObject:@"zh-Hans"])
            return failure(@"language_unavailable", @"当前 Vision revision 不支持简体中文");
        request.recognitionLanguages = languages;
        request.usesLanguageCorrection = YES;
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc]
            initWithURL:[NSURL fileURLWithPath:@(path)] options:@{}];
        if (![handler performRequests:@[request] error:&error])
            return failure(@"ocr_failed", error.localizedDescription);
        NSMutableArray *lines = [NSMutableArray array];
        NSMutableArray *texts = [NSMutableArray array];
        for (VNRecognizedTextObservation *observation in request.results) {
            VNRecognizedText *text = [observation topCandidates:1].firstObject;
            if (!text) continue;
            CGRect b = observation.boundingBox;
            // Public coordinates are normalized top-left of the upright image.
            [lines addObject:@{@"text":text.string, @"confidence":@(text.confidence),
                @"box":@{@"x":@(b.origin.x), @"y":@(1-b.origin.y-b.size.height),
                    @"width":@(b.size.width), @"height":@(b.size.height)}}];
            [texts addObject:text.string];
        }
        NSString *text = [texts componentsJoinedByString:@"\n"];
        return jsonResult(@{@"status": text.length ? @"recognized" : @"empty", @"text":text,
            @"lines":lines, @"engine":@"apple-vision-accurate", @"revision":@(request.revision),
            @"languages":languages});
    }
}
void notes_scan_free(char *value) { free(value); }
