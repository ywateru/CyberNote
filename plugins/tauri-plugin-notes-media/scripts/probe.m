#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <AVFoundation/AVFoundation.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
int notes_media_thumbnail(int,uint64_t,int,uint32_t,uint64_t,uint8_t*,size_t,uint32_t*,uint32_t*);
int main(int argc,char **argv){@autoreleasepool{
 BOOL failed=NO;
 uint8_t tiny[4];uint32_t a=0,b=0;
 if(notes_media_thumbnail(-1,1,0,1,1,tiny,4,&a,&b)!=2)return 2;
 for(int i=1;i<argc;i++){
   int fd=open(argv[i],O_RDONLY);struct stat st;fstat(fd,&st);
   BOOL video=[[@(argv[i]) pathExtension] isEqualToString:@"mp4"];
   lseek(fd,17,SEEK_SET);uint8_t *out=calloc(480*480,4);uint32_t w=0,h=0;
   NSDate *start=[NSDate date];int result=notes_media_thumbnail(fd,st.st_size,video,480,24000000,out,480*480*4,&w,&h);
   uint64_t sum=0;for(size_t j=0;j<(size_t)w*h*4;j++)sum+=out[j];
   printf("%s result=%d %ux%u rgbaSum=%llu offset=%lld seconds=%.3f\n",argv[i],result,w,h,sum,lseek(fd,0,SEEK_CUR),-[start timeIntervalSinceNow]);
   if(result || !sum || !w || !h || w>480 || h>480 || lseek(fd,0,SEEK_CUR)!=17)failed=YES;
   uint32_t x=0,y=0;
   if(notes_media_thumbnail(fd,st.st_size,video,480,1,out,480*480*4,&x,&y)!=2)failed=YES;
   if(notes_media_thumbnail(fd,st.st_size,video,1025,24000000,out,480*480*4,&x,&y)!=2)failed=YES;
   if(!video){
     char temporary[]="/private/tmp/notes-media-unlinked-XXXXXX";int copy=mkstemp(temporary);uint8_t buffer[65536];ssize_t count;off_t offset=0;
     while((count=pread(fd,buffer,sizeof(buffer),offset))>0){if(write(copy,buffer,count)!=count)return 3;offset+=count;}
     unlink(temporary); x=0;y=0;
     int detached=notes_media_thumbnail(copy,st.st_size,0,480,24000000,out,480*480*4,&x,&y);close(copy);
     if(detached!=0 || x!=w || y!=h)failed=YES;
   }
   free(out);close(fd);
   if(notes_media_thumbnail(fd,st.st_size,0,1,24000000,tiny,4,&x,&y)!=1)failed=YES;
 }
 return failed?1:0;
}}
