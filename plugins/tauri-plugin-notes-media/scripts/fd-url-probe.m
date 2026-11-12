#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#include <fcntl.h>
#include <unistd.h>
int main(int argc, char **argv) { @autoreleasepool {
 for(int i=1;i<argc;i++) { int fd=open(argv[i],O_RDONLY); NSString *path=[NSString stringWithFormat:@"/dev/fd/%d",fd];
 AVURLAsset *asset=[AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:path] options:@{AVURLAssetPreferPreciseDurationAndTimingKey:@NO}];
 AVAssetImageGenerator *gen=[[AVAssetImageGenerator alloc] initWithAsset:asset]; gen.maximumSize=CGSizeMake(480,480); gen.appliesPreferredTrackTransform=YES;
 NSError *err=nil; CGImageRef image=[gen copyCGImageAtTime:kCMTimeZero actualTime:NULL error:&err];
 printf("%s fd=%d result=%s size=%zux%zu error=%s\n",argv[i],fd,image?"decoded":"failed",image?CGImageGetWidth(image):0,image?CGImageGetHeight(image):0,err.description.UTF8String?:"");
 if(image)CGImageRelease(image); close(fd);
 }
} }
