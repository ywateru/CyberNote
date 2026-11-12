// Exercise the production resource-loader method at a non-aligned budget edge.
// The request boundary is a deterministic AVFoundation-shaped object; file IO
// and reader code are the exact production implementation in this translation unit.
#import "../../../../plugins/tauri-plugin-notes-media/macos/thumbnail.m"
#include <fcntl.h>
@interface ProbeData:NSObject
@property int64_t currentOffset;
@property int64_t requestedOffset;
@property NSInteger requestedLength;
@property BOOL requestsAllDataToEndOfResource;
@property NSUInteger received;
@end
@implementation ProbeData
-(void)respondWithData:(NSData*)data {self.received+=data.length;self.currentOffset+=data.length;}
@end
@interface ProbeRequest:NSObject
@property BOOL cancelled;
@property BOOL finished;
@property ProbeData *dataRequest;
@property NSError *failure;
@end
@implementation ProbeRequest
-(BOOL)isCancelled{return self.cancelled;}
-(BOOL)isFinished{return self.finished;}
-(void)finishLoading {self.finished=YES;}
-(void)finishLoadingWithError:(NSError*)error {self.failure=error;self.finished=YES;}
@end
int main(int argc,char**argv){@autoreleasepool{
 if(argc!=2)return 2;
 NotesMediaReader*r=[NotesMediaReader new];r->fd=open(argv[1],O_RDONLY);r->length=65536;r->totalRead=32*1024*1024-1;r->deadline=clockSeconds()+1;atomic_init(&r->stopped,false);r->queue=dispatch_queue_create("review.media.budget",DISPATCH_QUEUE_SERIAL);
 ProbeRequest*request=[ProbeRequest new];request.dataRequest=[ProbeData new];request.dataRequest.requestedLength=65536;
 __block uint64_t firstTotal=0;__block NSUInteger firstReceived=0;__block BOOL firstFinished=NO;
 dispatch_sync(r->queue,^{[r pump:(AVAssetResourceLoadingRequest*)request];firstTotal=r->totalRead;firstReceived=request.dataRequest.received;firstFinished=request.finished;});
 // Budget edge must deliver only its final byte. A still-incomplete request
 // must fail on the next pump, never signal successful completion.
 dispatch_sync(r->queue,^{[r pump:(AVAssetResourceLoadingRequest*)request];});
 atomic_store(&r->stopped,true);dispatch_sync(r->queue,^{});
 printf("budget=%u before=%u firstTotal=%llu firstReceived=%lu firstFinished=%d after=%llu received=%lu overrun=%lld error=%ld\n",32*1024*1024,32*1024*1024-1,firstTotal,firstReceived,firstFinished,r->totalRead,request.dataRequest.received,(long long)r->totalRead-32*1024*1024,(long)request.failure.code);
 return firstTotal==32*1024*1024 && firstReceived==1 && !firstFinished && r->totalRead==32*1024*1024 && request.dataRequest.received==1 && request.finished && request.failure.code==3 ? 0 : 1;
}}
