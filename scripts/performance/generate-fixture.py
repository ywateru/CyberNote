#!/usr/bin/env python3
"""Frozen, deterministic large-media fixture. Never touches a user's Store."""
import argparse, hashlib, json, math, os, random, shutil, struct, subprocess, sys, time, wave
from pathlib import Path
from PIL import Image, ImageDraw

MIB = 1024 * 1024
FLOOR = int(2.5 * 1024**3)
SPEC = {'id': 'media99-large-v1', 'png': 100, 'jpeg': 350, 'svg': 50, 'audioSeconds': 5400, 'audioRate': 8000, 'videoSeconds': 96, 'originalLimitBytes': 900*MIB}
parser = argparse.ArgumentParser()
parser.add_argument('--fixture', required=True)
parser.add_argument('--source', default='.')
parser.add_argument('--verify', action='store_true')
a = parser.parse_args()
root, source = Path(a.fixture).resolve(), Path(a.source).resolve()
root.mkdir(parents=True, exist_ok=True)
manifest_path = root/'manifest.json'

def space(reserve=0):
    free = shutil.disk_usage(root).free
    if free-reserve < FLOOR:
        raise RuntimeError(f'STOP: free {free} bytes, reserve {reserve}; minimum free is {FLOOR}. No other artifacts deleted.')
    return free

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(MIB), b''): h.update(b)
    return h.hexdigest()

def verify(m):
    if m['spec'] != SPEC: raise RuntimeError('Fixture specification differs; use a fresh explicit directory')
    for f in m['files']:
        p=root/f['path']
        if p.stat().st_size != f['bytes'] or digest(p) != f['sha256']: raise RuntimeError(f'Frozen fixture changed: {p}')
    print(json.dumps({'verified': True, 'files':len(m['files']), 'originalBytes':m['originalBytes'], 'manifestSha256':digest(manifest_path)}), flush=True)

if manifest_path.exists():
    verify(json.loads(manifest_path.read_text()))
    sys.exit(0)
if a.verify: raise RuntimeError('Frozen manifest is missing')
space(650*MIB)
files=[]
originals=root/'originals'; originals.mkdir(exist_ok=True)
started=time.time()

def record(path, mime, **details):
    entry={'index':len(files), 'path':str(path.relative_to(root)), 'name':path.name, 'mime':mime, 'bytes':path.stat().st_size, 'sha256':digest(path), **details}
    files.append(entry)
    if sum(x['bytes'] for x in files) > SPEC['originalLimitBytes']: raise RuntimeError('STOP: original-byte budget exceeded')
    space()
    (root/'generation-progress.json').write_text(json.dumps({'spec':SPEC, 'files':files, 'elapsedSeconds':time.time()-started},indent=2)+'\n')

for i in range(500):
    space(4*MIB)
    w,h=1600+(i%3)*64,1200+(i%2)*48
    rng=random.Random(990000+i)
    if i < 100:
        path=originals/f'image-{i:04}.png'
        if not path.exists():
            image=Image.frombytes('L',(w,h),rng.randbytes(w*h))
            d=ImageDraw.Draw(image); d.rectangle((20,20,540,90),fill=255); d.text((40,40),f'CyberNote performance PNG {i:04}',fill=0)
            image.save(path,compress_level=2)
        record(path,'image/png',width=w,height=h)
    elif i < 450:
        path=originals/f'image-{i:04}.jpg'
        if not path.exists():
            image=Image.frombytes('RGB',(400,300),rng.randbytes(400*300*3)).resize((w,h),Image.Resampling.BILINEAR)
            d=ImageDraw.Draw(image); d.rectangle((20,20,600,90),fill='white'); d.text((40,40),f'CyberNote performance JPEG {i:04}',fill='black')
            image.save(path,quality=82,optimize=False)
        record(path,'image/jpeg',width=w,height=h)
    else:
        path=originals/f'image-{i:04}.svg';w,h=2000,1500
        if not path.exists():
            rectangles=''.join(f'<rect x="{rng.randrange(w)}" y="{rng.randrange(h)}" width="{rng.randrange(20,240)}" height="{rng.randrange(20,180)}" fill="#{rng.randrange(0xffffff):06x}"/>' for _ in range(700))
            path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="#f2f2f7"/>{rectangles}<text x="40" y="80" font-size="42">Media99 SVG {i:04}</text></svg>')
        record(path,'image/svg+xml',width=w,height=h)
    if i%50==49: print(f'Images {i+1}/500; {sum(x["bytes"] for x in files)/MIB:.1f} MiB; free {space()/1024**3:.2f} GiB',flush=True)

wav=originals/'long-90min.wav'
space(83*MIB)
if not wav.exists():
    with wave.open(str(wav),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(SPEC['audioRate'])
        block=b''.join(struct.pack('<h',round(math.sin(i/SPEC['audioRate']*2*math.pi*440)*6000)) for i in range(SPEC['audioRate']))
        for _ in range(SPEC['audioSeconds']): out.writeframesraw(block)
record(wav,'audio/wav',durationSeconds=5400,sampleRate=8000,channels=1,bitsPerSample=16)

def run(args):
    print('Running '+' '.join(map(str,args)),flush=True)
    subprocess.run(list(map(str,args)),check=True,stdout=subprocess.DEVNULL)

def atoms(path):
    result=[]
    with path.open('rb') as f:
        end=path.stat().st_size
        while f.tell()<end:
            offset=f.tell();header=f.read(8)
            if len(header)!=8: raise RuntimeError('Invalid MP4 atom header')
            size,kind=struct.unpack('>I4s',header)
            if size==1:size=struct.unpack('>Q',f.read(8))[0]
            if size==0:size=end-offset
            if size<8 or offset+size>end:raise RuntimeError('Invalid MP4 atom size')
            result.append({'type':kind.decode('ascii'),'offset':offset,'bytes':size});f.seek(offset+size)
    return result

tail=originals/'video-tail-metadata.mp4'; fast=originals/'video-faststart.mp4'
space(190*MIB)
if not tail.exists():
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=523:sample_rate=48000','-t','96','-c:v','libx264','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p','-b:v','7900k','-minrate','7900k','-maxrate','7900k','-bufsize','15800k','-x264-params','nal-hrd=cbr:force-cfr=1','-c:a','aac','-b:a','96k',tail])
if not fast.exists():run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',tail,'-c','copy','-movflags','+faststart',fast])
for p,layout in [(fast,'faststart'),(tail,'tail-metadata')]:
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
    if not 90*MIB<=p.stat().st_size<=95*MIB:raise RuntimeError(f'Video must be 90–95MiB: {p.stat().st_size}')
    video=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
    assert video['codec_name']=='h264' and audio['codec_name']=='aac'
    atom_list=atoms(p);offsets={x['type']:x['offset'] for x in atom_list}
    assert (offsets['moov']<offsets['mdat']) == (layout=='faststart')
    record(p,'video/mp4',width=video['width'],height=video['height'],durationSeconds=float(probe['format']['duration']),videoCodec=video['codec_name'],audioCodec=audio['codec_name'],metadataLayout=layout,atoms=atom_list)
identity=json.loads(subprocess.check_output(['node','--input-type=module','-e','import {sourceIdentity} from "./scripts/build-info.mjs";console.log(JSON.stringify(sourceIdentity()))'],cwd=source))
manifest={'schema':1,'spec':SPEC,'source':identity,'generatorSha256':digest(Path(__file__).resolve()),'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tools':{'python':sys.version.split()[0],'pillow':Image.__version__,'ffmpeg':subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0]},'files':files,'originalBytes':sum(x['bytes'] for x in files),'freeBytesAfterGeneration':space(),'generationSeconds':time.time()-started}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
verify(manifest)
