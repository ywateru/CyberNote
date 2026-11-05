#define main author_harness_main
#import "../mac-recording-access52/check-native.m"
#undef main
@interface ThrowAfterCapture : FakeRecordingAccess
@end
@implementation ThrowAfterCapture
- (void)requestSystemAccess:(void (^)(BOOL))completion {
    [super requestSystemAccess:completion];
    [NSException raise:@"injected" format:@"after capture"];
}
@end
int main(void) {
 int checks=0;
 // Invalid FFI arguments must consume/release Rust context without OS query.
 Counters invalid={0}; notes_ui_recording_access(NULL,NULL,&invalid,reply,releaseContext);
 assert(invalid.calls==1 && invalid.code==2 && invalid.releases==1); checks++;
 // A callback retained past timeout may arrive twice; both must remain silent.
 Counters late={0};
 @autoreleasepool {
   FakeRecordingAccess *f=fixture(&late,0); [f start];
   void (^callback)(BOOL)=f.systemCompletion; f.systemCompletion=nil;
   [f finish:7 status:-1]; f.fakeStatus=3;
   callback(YES); callback(YES);
   for(int i=0;i<5;i++) CFRunLoopRunInMode(kCFRunLoopDefaultMode,.001,false);
   assert(late.calls==1 && late.code==7 && !pendingRecordingAccess && late.releases==0);
 }
 assert(late.releases==1); checks++;
 // Window-invalid start is terminal without attempting the OS boundary.
 Counters closed={0};
 @autoreleasepool { FakeRecordingAccess *f=fixture(&closed,0);f.windowValid=^BOOL{return NO;};[f start];assert(closed.calls==1 && closed.code==2 && f.requests==0); }
 assert(closed.releases==1);checks++;
 // Even a throwing OS boundary with an escaped completion cannot reply twice.
 Counters escaped={0};
 @autoreleasepool {
   ThrowAfterCapture *f=[ThrowAfterCapture new];f.context=&escaped;f.reply=reply;f.releaseContext=releaseContext;f.windowValid=^BOOL{return YES;};f.fakeStatus=0;
   [f start];assert(escaped.calls==1 && escaped.code==6 && !pendingRecordingAccess && escaped.releases==0);
   f.fakeStatus=3;complete(f,YES);assert(escaped.calls==1 && !pendingRecordingAccess);
 }
 assert(escaped.releases==1);checks++;
 printf("PASS %d independent owner/FFI supplement cases; controlled OS boundary, no GUI/permission request\n",checks);
}
