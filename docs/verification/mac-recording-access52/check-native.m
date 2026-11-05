// Compile the production owner/lifetime logic; override only the OS permission
// boundary. No NSApplication, NSWindow, microphone or permission request is made.
#import "../../../plugins/tauri-plugin-notes-ui/macos/recording_access.m"
#import <CoreFoundation/CoreFoundation.h>
#include <assert.h>
typedef struct { int calls, code, releases; long status; } Counters;
static void reply(void *raw, int code, long status) {
    Counters *c = raw; c->calls++; c->code = code; c->status = status;
}
static void releaseContext(void *raw) { ((Counters *)raw)->releases++; }
@interface FakeRecordingAccess : NotesRecordingAccess
@property(nonatomic) AVAuthorizationStatus fakeStatus;
@property(nonatomic) int requests;
@property(nonatomic) BOOL throwQuery;
@property(nonatomic, copy) void (^systemCompletion)(BOOL);
@end
@implementation FakeRecordingAccess
- (AVAuthorizationStatus)authorizationStatus {
    if (self.throwQuery) [NSException raise:@"test" format:@"query failed"];
    return self.fakeStatus;
}
- (void)requestSystemAccess:(void (^)(BOOL))completion { self.requests++; self.systemCompletion = completion; }
- (void)scheduleTimeout {}
@end
static FakeRecordingAccess *fixture(Counters *c, long status) {
    FakeRecordingAccess *f = [FakeRecordingAccess new];
    f.context = c; f.reply = reply; f.releaseContext = releaseContext;
    f.windowValid = ^BOOL { return YES; }; f.fakeStatus = status; return f;
}
static void complete(FakeRecordingAccess *f, BOOL granted) {
    void (^callback)(BOOL) = f.systemCompletion;
    f.systemCompletion = nil;
    callback(granted);
    for (int i = 0; i < 5; i++) CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.001, false);
}
int main(void) {
    int checks = 0;
    for (int status = 1; status <= 4; status++) {
        Counters c = {0};
        @autoreleasepool {
            FakeRecordingAccess *f = fixture(&c, status); [f start];
            assert(c.calls == 1 && f.requests == 0);
            assert(c.code == (status == 3 ? 0 : status == 2 ? 3 : status == 1 ? 4 : 5));
            [f finish:7 status:-1]; assert(c.calls == 1);
        }
        assert(c.releases == 1); checks++;
    }
    {
        Counters c = {0}, busy = {0};
        @autoreleasepool {
            FakeRecordingAccess *f = fixture(&c, 0); [f start]; assert(f.requests == 1 && c.calls == 0);
            [f finish:7 status:-1]; assert(c.calls == 1 && c.code == 7 && c.releases == 0);
            FakeRecordingAccess *b = fixture(&busy, 0); [b start]; assert(busy.calls == 1 && busy.code == 8 && b.requests == 0);
            f.fakeStatus = 3; complete(f, YES); assert(c.calls == 1 && c.code == 7 && !pendingRecordingAccess);
        }
        assert(c.releases == 1 && busy.releases == 1); checks++;
    }
    {
        Counters c = {0};
        @autoreleasepool {
            __block BOOL alive = YES;
            FakeRecordingAccess *f = fixture(&c, 0); f.windowValid = ^BOOL { return alive; }; [f start];
            alive = NO; f.fakeStatus = 3; complete(f, YES);
            assert(c.calls == 1 && c.code == 2 && !pendingRecordingAccess);
        }
        assert(c.releases == 1); checks++;
    }
    {
        Counters c = {0};
        @autoreleasepool {
            FakeRecordingAccess *f = fixture(&c, 0); [f start];
            [f finish:2 status:-1]; assert(c.calls == 1 && c.code == 2 && c.releases == 0);
            f.fakeStatus = 3; complete(f, YES); assert(c.calls == 1 && !pendingRecordingAccess);
        }
        assert(c.releases == 1); checks++;
    }
    for (int status = 0; status <= 4; status++) {
        Counters c = {0};
        @autoreleasepool {
            FakeRecordingAccess *f = fixture(&c, 0); [f start]; f.fakeStatus = status;
            complete(f, status == 3); assert(c.calls == 1);
            assert(c.code == (status == 3 ? 0 : status == 2 ? 3 : status == 1 ? 4 : 9));
        }
        assert(c.releases == 1); checks++;
    }
    {
        Counters c = {0};
        @autoreleasepool {
            FakeRecordingAccess *f = fixture(&c, 0); [f start]; f.fakeStatus = 3;
            complete(f, NO); assert(c.calls == 1 && c.code == 9);
        }
        assert(c.releases == 1); checks++;
    }
    {
        Counters c = {0};
        @autoreleasepool {
            FakeRecordingAccess *f = fixture(&c, 0); f.throwQuery = YES; [f start];
            assert(c.calls == 1 && c.code == 6 && !pendingRecordingAccess);
        }
        assert(c.releases == 1); checks++;
    }
    printf("PASS %d native owner/status cases; fake OS boundary, no GUI or permission request\n", checks);
    return 0;
}
