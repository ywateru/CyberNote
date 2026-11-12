// Independent caller of the exact production C decoder; no decoder copy.
#import <Foundation/Foundation.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#include <assert.h>
int notes_media_thumbnail(int,uint64_t,int,uint32_t,uint64_t,uint8_t*,size_t,uint32_t*,uint32_t*);
static int decode(int fd,uint64_t bytes,BOOL video,uint32_t pixels,uint8_t*out,size_t cap,uint32_t*w,uint32_t*h){return notes_media_thumbnail(fd,bytes,video,pixels,24000000,out,cap,w,h);}
int main(int argc,char**argv){@autoreleasepool{
 assert(argc==4);NSString *video=@(argv[1]),*alpha=@(argv[2]),*scratch=@(argv[3]);NSFileManager*f=NSFileManager.defaultManager;
 [f createDirectoryAtPath:scratch withIntermediateDirectories:YES attributes:nil error:nil];
 NSString *linkedPath=[scratch stringByAppendingPathComponent:@"source.mp4"];
 unlink(linkedPath.fileSystemRepresentation);assert(link(video.fileSystemRepresentation,linkedPath.fileSystemRepresentation)==0);
 int fd=open(linkedPath.fileSystemRepresentation,O_RDONLY);assert(fd>=0);struct stat st;assert(!fstat(fd,&st));
 assert(!unlink(linkedPath.fileSystemRepresentation));assert([f copyItemAtPath:alpha toPath:linkedPath error:nil]); // original path now names PNG, held FD still owns video.
 size_t cap=480*480*4;uint8_t *guarded=malloc(cap+32);memset(guarded,0xA7,cap+32);uint32_t w=0,h=0;
 assert(lseek(fd,41,SEEK_SET)==41);
 memset(guarded+16,0,cap); // Actual Rust host supplies a zeroed RGBA allocation.
 int status=decode(fd,st.st_size,YES,480,guarded+16,cap,&w,&h);assert(status==0&&w==480&&h==270&&lseek(fd,0,SEEK_CUR)==41);
 for(size_t i=0;i<16;i++)assert(guarded[i]==0xA7&&guarded[cap+16+i]==0xA7);
 uint64_t checksum=0;for(size_t i=0;i<(size_t)w*h*4;i++)checksum+=guarded[16+i];assert(checksum>0);
 printf("held video FD decodes after unlink/path replaced with PNG; offset=41, bounded canaries intact; %ux%u sum=%llu\n",w,h,checksum);
 assert(decode(fd,st.st_size+1,YES,480,guarded+16,cap,&w,&h)!=0);
 assert(decode(fd,st.st_size,YES,480,guarded+16,cap-1,&w,&h)==2);
 int alphaFD=open(alpha.fileSystemRepresentation,O_RDONLY);struct stat a;assert(alphaFD>=0&&!fstat(alphaFD,&a));
 memset(guarded+16,0,4);assert(decode(alphaFD,a.st_size,NO,1,guarded+16,4,&w,&h)==0&&w==1&&h==1);
 assert(abs(guarded[16]-100)<=2&&abs(guarded[17]-50)<=2&&abs(guarded[18]-25)<=2&&abs(guarded[19]-128)<=2);
 printf("extreme 1px target returns premultiplied RGBA for plugin's tested straight-alpha conversion\n");
 close(fd);close(alphaFD);free(guarded);unlink(linkedPath.fileSystemRepresentation);
 return 0;
}}
