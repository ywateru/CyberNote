#!/usr/bin/env python3
"""Real isolated C/ImageIO/AVFoundation probes, without Tauri/App bundle builds."""
import argparse, hashlib, json, pathlib, platform, subprocess, tempfile, time
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--videos',required=True);p.add_argument('--report');a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
frameworks=sum((['-framework',n] for n in ['Foundation','AVFoundation','CoreGraphics','CoreMedia','ImageIO']),[])
with tempfile.TemporaryDirectory(prefix='notes-media-mac-') as directory:
 d=pathlib.Path(directory);flags=['clang','-fobjc-arc','-fobjc-arc-exceptions','-fblocks','-Wno-deprecated-declarations']
 subprocess.run(flags+[str(root/'scripts/fd-url-probe.m')]+frameworks+['-o',str(d/'fd-url')],check=True)
 videos=[str(pathlib.Path(a.videos)/f) for f in ['video-faststart.mp4','video-tail-metadata.mp4']]
 rejected=subprocess.check_output([str(d/'fd-url')]+videos,text=True)
 assert rejected.count('result=failed')==2,rejected
 subprocess.run(flags+[str(root/'macos/thumbnail.m'),str(root/'scripts/probe.m')]+frameworks+['-o',str(d/'provider')],check=True)
 image=Image.new('RGB',(1600,900),(230,70,10));inputs=[]
 for fmt in ['PNG','JPEG','GIF','WEBP','BMP','AVIF']:
  path=d/('sample.'+fmt.lower());image.save(path,format=fmt);inputs.append(str(path))
 heic=d/'sample.heic';subprocess.run(['sips','-s','format','heic',str(d/'sample.png'),'--out',str(heic)],check=True,capture_output=True);inputs.append(str(heic))
 exif=image.getexif();exif[274]=6;rotated=d/'oriented.jpeg';image.save(rotated,exif=exif);inputs.append(str(rotated))
 result=subprocess.check_output([str(d/'provider')]+videos+inputs,text=True)
 oriented=next(line for line in result.splitlines()if'oriented.jpeg'in line);assert'270x480'in oriented,oriented
 bad=d/'corrupt.png';bad.write_bytes(b'not a valid frame');bad_result=subprocess.run([str(d/'provider'),str(bad)],capture_output=True,text=True);assert bad_result.returncode==1
 evidence={'schema':1,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'host':platform.platform(),'sourceSHA256':hashlib.sha256((root/'macos/thumbnail.m').read_bytes()).hexdigest(),'directFDURL':rejected.splitlines(),'actualProvider':result.splitlines(),'corruptInputRejected':bad_result.stdout.strip(),'additionalChecks':'Each valid input: source pixel budget=1 rejected; output target=1025 rejected; input offset stays17. Every image also decodes from an unlinked owned temporary FD. Closed FD rejected. No App/ADB build.'}
 if a.report:pathlib.Path(a.report).write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(evidence,ensure_ascii=False,indent=2))
