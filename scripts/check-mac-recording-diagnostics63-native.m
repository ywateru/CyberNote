// Production class, old52 fake OS boundary; no NSApplication or OS permission.
#define main sealed52_main
#import "../docs/verification/mac-recording-access52/check-native.m"
#undef main
#include <pthread.h>
#include <string.h>

typedef struct { uint64_t request; uint32_t stage; int code; long status; int mainThread; } Event63;
static Event63 events63[4096];
static int eventCount63;
static pthread_mutex_t eventLock63 = PTHREAD_MUTEX_INITIALIZER;
static char behavior63[4096];
static int behaviorCount63;
static void behavior(char op) { assert(behaviorCount63 < 4095); behavior63[behaviorCount63++] = op; }
static void diagnostic63(uint64_t request, uint32_t stage, int code, long status) {
    pthread_mutex_lock(&eventLock63);
    assert(eventCount63 < 4096);
    events63[eventCount63++] = (Event63){request, stage, code, status, pthread_main_np()};
    pthread_mutex_unlock(&eventLock63);
}
static void reply63(void *raw, int code, long status) { behavior('P'); reply(raw, code, status); }
static void release63(void *raw) { behavior('F'); releaseContext(raw); }
@interface DiagnosticFake63 : FakeRecordingAccess
@property(nonatomic) int queries;
@property(nonatomic) BOOL throwAfterCapture;
@end
@implementation DiagnosticFake63
- (AVAuthorizationStatus)authorizationStatus { behavior('Q'); self.queries++; return [super authorizationStatus]; }
- (void)requestSystemAccess:(void (^)(BOOL))completion {
    behavior('R'); [super requestSystemAccess:completion];
    if (self.throwAfterCapture) [NSException raise:@"synthetic" format:@"captured"];
}
@end
static DiagnosticFake63 *fixture63(Counters *c, long status, BOOL enabled, uint64_t request) {
    DiagnosticFake63 *f = [DiagnosticFake63 new];
    f.context = c; f.reply = reply63; f.releaseContext = release63;
    f.windowValid = ^BOOL { return YES; }; f.fakeStatus = status;
    f.requestID = enabled ? request : 0; f.diagnostic = enabled ? diagnostic63 : NULL;
    return f;
}
static int countStage(uint64_t request, uint32_t stage) {
    int count = 0; for (int i=0; i<eventCount63; i++) if(events63[i].request==request && events63[i].stage==stage) count++;
    return count;
}
static void complete63(DiagnosticFake63 *f, BOOL granted, BOOL enabled) {
    void (^callback)(BOOL) = f.systemCompletion; f.systemCompletion = nil;
    int beforeEntry = countStage(f.requestID, RecordingOsCompletionEntry);
    int beforeMain = countStage(f.requestID, RecordingMainCompletion);
    // Main is synchronously occupied. Entry must exist before it can process
    // any queued completion; the production callback captures only scalars.
    dispatch_sync(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{ callback(granted); });
    if(enabled) {
        assert(countStage(f.requestID, RecordingOsCompletionEntry) == beforeEntry+1);
        assert(countStage(f.requestID, RecordingMainCompletion) == beforeMain);
        assert(events63[eventCount63-1].stage == RecordingOsCompletionEntry);
        assert(!events63[eventCount63-1].mainThread);
    }
    for(int i=0; i<5; i++) CFRunLoopRunInMode(kCFRunLoopDefaultMode, .001, false);
    if(enabled) assert(countStage(f.requestID, RecordingMainCompletion) == beforeMain+1);
}
static int suite63(BOOL enabled) {
    int cases = 0;
    for(int status=1; status<=4; status++) {
        Counters c={0}; @autoreleasepool {
            DiagnosticFake63 *f=fixture63(&c,status,enabled,100+status); [f start];
            assert(c.calls==1 && f.requests==0 && f.queries==1);
            assert(c.code==(status==3?0:status==2?3:status==1?4:5));
            [f finish:7 status:-1]; assert(c.calls==1);
        } assert(c.releases==1); cases++;
    }
    // No callback -> timeout -> busy -> actual late completion. Neither timeout
    // nor busy queries the OS again or clears/releases the pending owner.
    Counters timed={0},busy={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&timed,0,enabled,200); [f start];
        assert(f.requests==1 && f.queries==1 && timed.calls==0);
        [f finish:7 status:-1]; assert(timed.code==7 && timed.releases==0 && pendingRecordingAccess==f);
        DiagnosticFake63 *b=fixture63(&busy,0,enabled,201); [b start];
        assert(busy.code==8 && b.requests==0 && b.queries==0 && pendingRecordingAccess==f);
        f.fakeStatus=3; complete63(f,YES,enabled);
        assert(timed.calls==1 && f.queries==1 && !pendingRecordingAccess && timed.releases==0);
        if(enabled) assert(countStage(200,RecordingLateCompletion)==1 && countStage(200,RecordingPendingClear)==1);
    } assert(timed.releases==1 && busy.releases==1); cases++;
    // Close terminal result, late completion remains silent.
    Counters closed={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&closed,0,enabled,300); [f start];
        [f finish:2 status:-1]; assert(closed.calls==1 && closed.releases==0 && pendingRecordingAccess==f);
        complete63(f,YES,enabled); assert(closed.calls==1 && f.queries==1 && !pendingRecordingAccess);
    } assert(closed.releases==1); cases++;
    for(int status=0;status<=4;status++) {
        Counters c={0}; @autoreleasepool {
            DiagnosticFake63 *f=fixture63(&c,0,enabled,400+status); [f start]; f.fakeStatus=status;
            complete63(f,status==3,enabled);
            assert(c.calls==1 && f.queries==2 && f.requests==1);
            assert(c.code==(status==3?0:status==2?3:status==1?4:9));
        } assert(c.releases==1); cases++;
    }
    Counters mismatch={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&mismatch,0,enabled,500); [f start]; f.fakeStatus=3;
        complete63(f,NO,enabled); assert(mismatch.code==9 && f.queries==2);
    } assert(mismatch.releases==1); cases++;
    Counters invalid={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&invalid,0,enabled,600); [f start];
        f.windowValid=^BOOL{return NO;}; complete63(f,YES,enabled);
        assert(invalid.code==2 && f.queries==1);
    } assert(invalid.releases==1); cases++;
    Counters query={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&query,0,enabled,700); f.throwQuery=YES; [f start];
        assert(query.code==6 && f.queries==1 && !pendingRecordingAccess);
    } assert(query.releases==1); cases++;
    Counters escaped={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&escaped,0,enabled,800); f.throwAfterCapture=YES; [f start];
        assert(escaped.code==6 && escaped.releases==0 && !pendingRecordingAccess);
        complete63(f,YES,enabled); assert(escaped.calls==1 && f.queries==1);
    } assert(escaped.releases==1); cases++;
    Counters repeated={0}; @autoreleasepool {
        DiagnosticFake63 *f=fixture63(&repeated,0,enabled,900); [f start];
        void (^callback)(BOOL)=f.systemCompletion; [f finish:7 status:-1];
        complete63(f,YES,enabled);
        dispatch_sync(dispatch_get_global_queue(QOS_CLASS_DEFAULT,0),^{callback(YES);});
        for(int i=0;i<5;i++) CFRunLoopRunInMode(kCFRunLoopDefaultMode,.001,false);
        assert(repeated.calls==1 && !pendingRecordingAccess && repeated.releases==0);
    } assert(repeated.releases==1); cases++;
    Counters ffi={0}; notes_ui_recording_access_diagnostic(NULL,NULL,&ffi,reply63,release63,enabled?1000:0,enabled?diagnostic63:NULL);
    assert(ffi.calls==1 && ffi.code==2 && ffi.releases==1); cases++;
    return cases;
}
int main(void) {
    int off=suite63(NO); assert(eventCount63==0);
    char offBehavior[4096]; int offCount=behaviorCount63; memcpy(offBehavior,behavior63,offCount);
    behaviorCount63=0;
    int on=suite63(YES); assert(on==off && eventCount63>0);
    assert(behaviorCount63==offCount && !memcmp(offBehavior,behavior63,offCount));
    assert(countStage(200,RecordingPendingClear)==1 && countStage(201,RecordingPendingBusy)==1);
    assert(countStage(1000,RecordingNativeEntry)==1 && countStage(1000,RecordingNativeWindow)==1);
    // Each native event has the exact synthetic request ID, never an address.
    for(int i=0;i<eventCount63;i++) assert(events63[i].request>=101 && events63[i].request<=1000);
    printf("PASS %d cases per mode; %d unchanged query/request/reply/release operations; %d diagnostic events; callback-entry precedes main processing from worker thread; fake OS only\n",on,offCount,eventCount63);
}
