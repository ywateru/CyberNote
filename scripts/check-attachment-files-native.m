#define NOTES_ATTACHMENT_TEST 1
#import "../plugins/tauri-plugin-notes-ui/macos/attachments.m"
static void check(BOOL pass,NSString *label){if(!pass){fprintf(stderr,"FAIL %s\n",label.UTF8String);exit(1);}}
static NSDictionary *call(NSDictionary *value){
 NSData *json=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
 char *raw=notes_ui_attachment_desktop([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
 NSDictionary *result=[NSJSONSerialization JSONObjectWithData:[[NSString stringWithUTF8String:raw] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];free(raw);return result;
}
int main(void){@autoreleasepool {
 [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
 NSPasteboard *board=attachmentPasteboard();NSMutableArray *directories=[NSMutableArray array];
 @try {
  NSArray *samples=@[
   @{@"name":@"设计图.svg",@"mime":@"image/svg+xml",@"data":[[@"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><path d='M0 0h8v8H0z'/></svg>" dataUsingEncoding:NSUTF8StringEncoding] base64EncodedStringWithOptions:0]},
   @{@"name":@"原始文件.bin",@"mime":@"application/octet-stream",@"data":@"AAECA//+"}
  ];
  for(NSDictionary *sample in samples){
   NSMutableDictionary *input=[sample mutableCopy];input[@"action"]=@"copy";
   check([call(input)[@"ok"] boolValue],@"copy accepted by AppKit pasteboard");
   NSURL *url=[NSURL URLWithString:[board stringForType:NSPasteboardTypeFileURL]];
   [directories addObject:[url URLByDeletingLastPathComponent]];
   check([url.lastPathComponent isEqual:sample[@"name"]],@"file URL retains original name");
   NSData *bytes=[NSData dataWithContentsOfURL:url];check([[bytes base64EncodedStringWithOptions:0] isEqual:sample[@"data"]],@"physical file bytes match original");
   NSDictionary *read=call(@{@"action":@"readClipboard"});
   check([read[@"files"] count]==1,@"one file read from native file clipboard");
   check([read[@"files"][0][@"data"] isEqual:sample[@"data"]],@"clipboard preserves original bytes");
  }
  // An image-only clipboard has no file URL: screenshots must still become files.
  NSBitmapImageRep *rep=[[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:4 pixelsHigh:3 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  NSData *png=[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
  [board clearContents];[board setData:png forType:NSPasteboardTypePNG];
  NSDictionary *image=call(@{@"action":@"readClipboard"})[@"files"][0];
  check([image[@"mime"] isEqual:@"image/png"],@"image-only clipboard gets image MIME");
  check([image[@"name"] hasSuffix:@".png"],@"image-only clipboard gets file name");
  check([image[@"data"] isEqual:[png base64EncodedStringWithOptions:0]],@"screenshot image original bytes retained");
  [board clearContents];[board setString:@"ordinary text" forType:NSPasteboardTypeString];
  check([call(@{@"action":@"readClipboard"})[@"files"] count]==0,@"text is not mistaken for attachment");
  puts("Native file clipboard passed: SVG, binary file, image-only PNG, physical byte/name roundtrip, ordinary text. User clipboard untouched.");
 } @finally {
  [board clearContents];
  for(NSURL *directory in directories)[NSFileManager.defaultManager removeItemAtURL:directory error:nil];
 }
}}
