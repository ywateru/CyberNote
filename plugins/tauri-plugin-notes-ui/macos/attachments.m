#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
static NSSharingServicePicker *activeAttachmentSharingPicker;
static NSPasteboard *attachmentPasteboard(void) {
#ifdef NOTES_ATTACHMENT_TEST
    return [NSPasteboard pasteboardWithName:@"app.cybernote.isolated-attachment-test"];
#else
    return NSPasteboard.generalPasteboard;
#endif
}

static NSString *mimeFor(NSURL *url) {
    UTType *type=nil;[url getResourceValue:&type forKey:NSURLContentTypeKey error:nil];
    return type.preferredMIMEType ?: @"application/octet-stream";
}
static NSDictionary *fileValue(NSData *data, NSString *name, NSString *mime) {
    return @{@"data":[data base64EncodedStringWithOptions:0],@"name":name,@"mime":mime};
}
static NSDictionary *readClipboard(void) {
    NSPasteboard *board=attachmentPasteboard();
    NSArray<NSURL *> *urls=[board readObjectsForClasses:@[NSURL.class] options:@{NSPasteboardURLReadingFileURLsOnlyKey:@YES}];
    NSMutableArray *files=[NSMutableArray array];NSUInteger total=0;
    for(NSURL *url in urls) {
        NSNumber *regular=nil,*size=nil;[url getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil];
        [url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
        if(!regular.boolValue)continue;
        if(files.count>=20 || size.unsignedLongLongValue>100*1024*1024-total)return @{@"error":@"剪贴板附件总大小不能超过100 MB，最多20个文件"};
        NSError *error=nil;NSData *data=[NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:&error];
        if(!data)return @{@"error":@"无法读取剪贴板中的文件"};
        if(data.length>100*1024*1024-total)return @{@"error":@"剪贴板附件总大小不能超过100 MB"};
        total+=data.length;[files addObject:fileValue(data,url.lastPathComponent,mimeFor(url))];
    }
    if(files.count)return @{@"files":files};
    for(NSString *type in @[@"public.png",@"public.jpeg",@"public.svg-image",@"com.compuserve.gif",@"public.tiff",@"public.heic",@"org.webmproject.webp"]) {
        NSData *data=[board dataForType:type];if(!data.length)continue;
        if(data.length>100*1024*1024)return @{@"error":@"剪贴板图片不能超过100 MB"};
        UTType *content=[UTType typeWithIdentifier:type];NSString *ext=content.preferredFilenameExtension?:@"png";
        NSString *name=[NSString stringWithFormat:@"粘贴的图片-%@.%@",NSUUID.UUID.UUIDString,ext];
        return @{@"files":@[fileValue(data,name,content.preferredMIMEType?:@"image/png")]};
    }
    return @{@"files":@[]};
}
// Called on the main thread only after host authorization. Inputs never come
// directly from arbitrary renderer paths. Copies retain original bytes/name;
// external edits cannot corrupt the journal-owned source attachment.
char *notes_ui_attachment_desktop(const char *input) {
    @autoreleasepool {@try {
        NSData *json=[[NSString stringWithUTF8String:input] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *value=[NSJSONSerialization JSONObjectWithData:json options:0 error:nil];
        NSDictionary *result=nil;NSString *action=value[@"action"];
        if([action isEqual:@"readClipboard"])result=readClipboard();
        else {
            NSData *data=[[NSData alloc] initWithBase64EncodedString:value[@"data"] options:0];
            NSString *name=[value[@"name"] lastPathComponent];
            if(!data || !name.length || [name isEqual:@"."] || [name isEqual:@".."])result=@{@"error":@"附件文件名或内容无效"};
            else {
                NSURL *directory=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:[@"CyberNote Attachments" stringByAppendingPathComponent:NSUUID.UUID.UUIDString]] isDirectory:YES];
                NSError *error=nil;
                [NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:&error];
                NSURL *url=[directory URLByAppendingPathComponent:name];
                if(error || ![data writeToURL:url options:NSDataWritingAtomic error:&error])result=@{@"error":@"无法准备附件文件"};
                else if([action isEqual:@"copy"]) {
                    NSPasteboard *board=attachmentPasteboard();[board clearContents];
                    NSPasteboardItem *item=[NSPasteboardItem new];[item setString:url.absoluteString forType:NSPasteboardTypeFileURL];
                    [item setString:@"1" forType:@"app.cybernote.attachment"];
                    UTType *type=[UTType typeWithMIMEType:value[@"mime"]];
                    if([type conformsToType:UTTypeImage])[item setData:data forType:type.identifier];
                    result=@{@"ok":@([board writeObjects:@[item]])};
                } else if([action isEqual:@"reveal"]) {
                    [NSWorkspace.sharedWorkspace activateFileViewerSelectingURLs:@[url]];result=@{@"ok":@YES};
                } else if([action isEqual:@"open"]) {
                    result=@{@"ok":@([NSWorkspace.sharedWorkspace openURL:url])};
                } else if([action isEqual:@"share"]) {
                    NSWindow *window=NSApp.keyWindow;NSView *view=window.contentView;
                    if(!view)result=@{@"error":@"没有可用的共享窗口"};
                    else {activeAttachmentSharingPicker=[[NSSharingServicePicker alloc] initWithItems:@[url]];
                        [activeAttachmentSharingPicker showRelativeToRect:NSMakeRect(NSMidX(view.bounds),NSMaxY(view.bounds)-50,1,1) ofView:view preferredEdge:NSRectEdgeMinY];result=@{@"ok":@YES};}
                } else result=@{@"error":@"不支持的附件操作"};
            }
        }
        NSData *out=[NSJSONSerialization dataWithJSONObject:result?:@{@"error":@"附件操作失败"} options:0 error:nil];
        return strdup([[NSString alloc] initWithData:out encoding:NSUTF8StringEncoding].UTF8String);
    } @catch(NSException *exception) {return strdup("{\"error\":\"附件系统操作失败\"}");}}
}
