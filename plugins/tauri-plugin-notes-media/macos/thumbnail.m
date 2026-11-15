// Host-only FD decoder. No original path, URL or authority comes from JavaScript.
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <ImageIO/ImageIO.h>
#include <sys/stat.h>
#include <unistd.h>
#include <stdatomic.h>
#include <time.h>
#include <math.h>
static double clockSeconds(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec+t.tv_nsec/1e9; }
@interface NotesMediaFrame : NSObject { @public NSLock *lock; CGImageRef image; BOOL abandoned; }
@end
@implementation NotesMediaFrame
- (instancetype)init { if((self=[super init]))lock=[NSLock new];return self; }
- (void)dealloc { if(image)CGImageRelease(image); }
@end
@interface NotesMediaReader : NSObject <AVAssetResourceLoaderDelegate> {
@public int fd; int64_t length; uint64_t totalRead; double deadline; atomic_bool stopped; dispatch_queue_t queue;
}
@end
@implementation NotesMediaReader
- (void)dealloc { if(fd>=0) close(fd); }
- (BOOL)resourceLoader:(AVAssetResourceLoader *)loader shouldWaitForLoadingOfRequestedResource:(AVAssetResourceLoadingRequest *)request {
    (void)loader;
    if(request.isCancelled || request.isFinished)return YES;
    if(atomic_load(&stopped) || clockSeconds()>deadline) { [request finishLoadingWithError:[NSError errorWithDomain:@"NotesMedia" code:1 userInfo:nil]]; return YES; }
    AVAssetResourceLoadingContentInformationRequest *info=request.contentInformationRequest;
    if(info) { info.contentType=@"public.mpeg-4"; info.contentLength=length; info.byteRangeAccessSupported=YES; }
    AVAssetResourceLoadingDataRequest *data=request.dataRequest;
    if(data) { dispatch_async(queue, ^{ [self pump:request]; }); return YES; }

    [request finishLoading]; return YES;
}
- (void)pump:(AVAssetResourceLoadingRequest *)request {
 @autoreleasepool {
    if(request.isCancelled || request.isFinished)return;
    if(atomic_load(&stopped) || clockSeconds()>deadline || totalRead>=32*1024*1024) {
        [request finishLoadingWithError:[NSError errorWithDomain:@"NotesMedia" code:3 userInfo:nil]];return;
    }
    AVAssetResourceLoadingDataRequest *data=request.dataRequest;
    int64_t offset=data.currentOffset ?: data.requestedOffset;
    if(data.requestedOffset<0 || data.requestedOffset>length || data.requestedLength<0){[request finishLoadingWithError:[NSError errorWithDomain:@"NotesMedia" code:2 userInfo:nil]];return;}
    int64_t end=data.requestsAllDataToEndOfResource ? length : data.requestedOffset+MIN(length-data.requestedOffset,(int64_t)data.requestedLength);
    if(offset<0 || end<offset || offset>length){[request finishLoadingWithError:[NSError errorWithDomain:@"NotesMedia" code:2 userInfo:nil]];return;}
    if(offset==end){[request finishLoading];return;}
    uint8_t buffer[65536];
    // Prior requests may end between blocks. Bound this read by the exact
    // remaining cumulative budget, not just the next pump's admission check.
    size_t count=(size_t)MIN(MIN((uint64_t)sizeof(buffer),(uint64_t)(end-offset)),32ull*1024*1024-totalRead);
    ssize_t n=pread(fd,buffer,count,offset);
    if(n<=0){[request finishLoadingWithError:[NSError errorWithDomain:@"NotesMedia" code:4 userInfo:nil]];return;}
    totalRead+=n;[data respondWithData:[NSData dataWithBytes:buffer length:(NSUInteger)n]];
    // Yield between bounded responses so AVFoundation can cancel its initial
    // all-to-end request after parsing the atoms it actually needs.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_MSEC),queue,^{[self pump:request];});
 }
}

@end
struct ImageInput { int fd; int64_t length; double deadline; };
static size_t imageRead(void *v, void *buffer, off_t offset, size_t count) {
    struct ImageInput *s=v; if(offset<0 || offset>=s->length || clockSeconds()>s->deadline)return 0;
    size_t left=MIN(count,(size_t)(s->length-offset)),total=0;
    while(total<left && clockSeconds()<=s->deadline) { ssize_t n=pread(s->fd,(uint8_t*)buffer+total,MIN((size_t)65536,left-total),offset+total); if(n<=0)break; total+=n; }
    return total;
}
static void imageRelease(void *v) { struct ImageInput *s=v; close(s->fd); free(s); }
// status: 0 success, 1 unsupported/corrupt, 2 input/output bound, 3 timeout.
static int decode_thumbnail(int fd, uint64_t length, int video, uint32_t pixels, uint64_t inputPixels,
                          uint8_t *output, size_t capacity, uint32_t *width, uint32_t *height) {
 @autoreleasepool {
    if(fd<0 || !length || length>100ull*1024*1024 || pixels<1 || pixels>1024 || capacity<(size_t)pixels*pixels*4)return 2;
    struct stat st; if(fstat(fd,&st)!=0 || !S_ISREG(st.st_mode) || st.st_size!=(off_t)length)return 1;
    CGImageRef image=NULL; int result=1;
    if(video) {
        NotesMediaReader *reader=[NotesMediaReader new]; reader->fd=dup(fd); reader->length=length; reader->deadline=clockSeconds()+9; atomic_init(&reader->stopped,false);
        if(reader->fd<0)return 1;
        dispatch_queue_t queue=dispatch_queue_create("notes.media.fd",DISPATCH_QUEUE_SERIAL); reader->queue=queue;
        AVURLAsset *asset=[AVURLAsset URLAssetWithURL:[NSURL URLWithString:@"notes-media-internal://source/video.mp4"] options:@{AVURLAssetPreferPreciseDurationAndTimingKey:@NO}];
        [asset.resourceLoader setDelegate:reader queue:queue];
        AVAssetTrack *track=[[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
        CGSize natural=track.naturalSize;
        if(!track || !isfinite(natural.width) || !isfinite(natural.height) || natural.width<=0 || natural.height<=0 || natural.width*natural.height>inputPixels) {
            atomic_store(&reader->stopped,true); [asset cancelLoading]; [asset.resourceLoader setDelegate:nil queue:NULL]; dispatch_sync(queue,^{}); return 2;
        }
        AVAssetImageGenerator *generator=[[AVAssetImageGenerator alloc] initWithAsset:asset];
        generator.maximumSize=CGSizeMake(pixels,pixels); generator.appliesPreferredTrackTransform=YES;
        dispatch_semaphore_t done=dispatch_semaphore_create(0); NotesMediaFrame *frame=[NotesMediaFrame new];
        [generator generateCGImagesAsynchronouslyForTimes:@[[NSValue valueWithCMTime:kCMTimeZero]] completionHandler:^(CMTime requested,CGImageRef generated,CMTime actual,AVAssetImageGeneratorResult status,NSError *error) {
            (void)requested;(void)actual;(void)error;
            [frame->lock lock];
            if(!frame->abandoned && status==AVAssetImageGeneratorSucceeded && generated) frame->image=CGImageRetain(generated);
            [frame->lock unlock]; dispatch_semaphore_signal(done);
        }];
        BOOL timedOut=dispatch_semaphore_wait(done,dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC))!=0;
        [frame->lock lock]; frame->abandoned=YES;
        if(!timedOut){image=frame->image;frame->image=NULL;}
        [frame->lock unlock];
        if(timedOut){[generator cancelAllCGImageGeneration];result=3;}
        atomic_store(&reader->stopped,true); [asset cancelLoading];
        [asset.resourceLoader setDelegate:nil queue:NULL]; dispatch_sync(queue,^{});
        if(result==3) {
            // Keep the host worker/FD busy until cancellation's completion
            // callback actually runs. The host delivery deadline is separate;
            // a stuck system decoder must not permit another detached decode.
            dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);
            return 3;
        }
    } else {
        struct ImageInput *input=calloc(1,sizeof(*input)); input->fd=dup(fd); input->length=length; input->deadline=clockSeconds()+9;
        if(input->fd<0){free(input);return 1;}
        CGDataProviderDirectCallbacks callbacks={0,NULL,NULL,imageRead,imageRelease};
        CGDataProviderRef provider=CGDataProviderCreateDirect(input,(off_t)length,&callbacks);
        if(!provider){imageRelease(input);return 1;}
        CGImageSourceRef source=CGImageSourceCreateWithDataProvider(provider,(__bridge CFDictionaryRef)@{(__bridge NSString*)kCGImageSourceShouldCache:@NO}); CGDataProviderRelease(provider);
        if(!source)return 1;
        NSDictionary *properties=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));
        uint64_t w=[properties[(__bridge NSString*)kCGImagePropertyPixelWidth] unsignedLongLongValue], h=[properties[(__bridge NSString*)kCGImagePropertyPixelHeight] unsignedLongLongValue];
        if(!w || !h || w>inputPixels/h){CFRelease(source);return 2;}
        image=CGImageSourceCreateThumbnailAtIndex(source,0,(__bridge CFDictionaryRef)@{(__bridge NSString*)kCGImageSourceCreateThumbnailFromImageAlways:@YES,(__bridge NSString*)kCGImageSourceCreateThumbnailWithTransform:@YES,(__bridge NSString*)kCGImageSourceShouldCacheImmediately:@YES,(__bridge NSString*)kCGImageSourceThumbnailMaxPixelSize:@(pixels)});
        CFRelease(source);
    }
    if(!image)return 1;
    size_t w=CGImageGetWidth(image),h=CGImageGetHeight(image);
    if(!w || !h || w>pixels || h>pixels || w*h>capacity/4){CGImageRelease(image);return 2;}
    CGColorSpaceRef color=CGColorSpaceCreateDeviceRGB();
    CGContextRef context=CGBitmapContextCreate(output,w,h,8,w*4,color,kCGImageAlphaPremultipliedLast|kCGBitmapByteOrder32Big); CGColorSpaceRelease(color);
    if(!context){CGImageRelease(image);return 1;}
    CGContextDrawImage(context,CGRectMake(0,0,w,h),image); CGContextRelease(context); CGImageRelease(image);
    *width=(uint32_t)w; *height=(uint32_t)h; return 0;
 }
}

int notes_media_thumbnail(int fd, uint64_t length, int video, uint32_t pixels, uint64_t inputPixels,
                          uint8_t *output, size_t capacity, uint32_t *width, uint32_t *height) {
    @try { return decode_thumbnail(fd,length,video,pixels,inputPixels,output,capacity,width,height); }
    @catch(NSException *exception) { (void)exception; return 1; }
}
