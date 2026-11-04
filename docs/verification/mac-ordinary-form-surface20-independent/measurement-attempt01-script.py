from pathlib import Path
from PIL import Image, ImageCms, ImageDraw
import hashlib, io, json, statistics

p=Path(__file__).resolve().parent
root=p.parents[2]
a=p.parent/'mac-ordinary-form-surface20'
out=p/'run-attempt02'
sha=lambda b:hashlib.sha256(b).hexdigest()
original=Image.open(p.parent/'mac-folder-fixes-runtime18/00-original-ordinary.cua-image')
clone=Image.open(p.parent/'mac-folder-fixes-runtime18/18-ordinary-form-open.cua-image')
profile=original.info['icc_profile']
assert profile==clone.info['icc_profile']==(a/'reference-display.icc').read_bytes()
srgb=ImageCms.ImageCmsProfile(str(a/'comparison-srgb.icc'))
convert=lambda im:ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(profile)),srgb,outputMode='RGB')
ref=convert(original)
ref.save(p/'reference-srgb-independent.png',icc_profile=srgb.tobytes())
assert ref.tobytes()==Image.open(a/'reference-srgb.png').convert('RGB').tobytes()
# ROIs and threshold sampling are the documented comparison contract, not expected output constants.
rois={'panel':(200,20,650,90),'cancel':(440,330,460,365),'ok':(620,330,640,365),'checkbox':(45,198,67,218)}
def colors(im):
 return {name:list(map(statistics.median,zip(*im.convert('RGB').crop(box).getdata()))) for name,box in rois.items()}
depths=[4,8,12,16,20,24,32,40]
def contours(im):
 im=im.convert('RGB');w,h=im.size;v={}
 for side in ['TL','TR','BL','BR']:
  vals=[]
  for depth in depths:
   y=h-1-depth if side[0]=='B' else depth
   row=[min(im.getpixel((w-1-x if side[1]=='R' else x,y))) for x in range(w)]
   vals.append(next(x for x in range(100) if statistics.median(row[max(0,x-2):x+3])>=230))
  v[side]=vals
 return v
def mask(im):return [max(pixel)<246 for pixel in im.convert('RGB').crop((40,192,72,224)).getdata()]
referenceContour=contours(ref);referenceMask=mask(ref)
native={};images={'reference':ref}
for name in ['baseline','candidate','candidate-dark']:
 j=json.loads((out/f'{name}-wk.json').read_text())
 assert j['status']=='metrics-ok' and j['snapshotSaved'] and not j['appActive'] and not j['webViewAttachedToWindow']
 assert all(not (w['visible'] or w['key'] or w['main']) for w in j['windowDiagnostics'])
 assert not j['metrics']['requests'] and j['metrics']['devicePixelRatio']==2
 units=j['metrics']['units'];r=units[0]['rect'];dpr=j['metrics']['devicePixelRatio']
 box=tuple(round(v*dpr) for v in [r['x'],r['y'],r['x']+r['width'],r['y']+r['height']])
 png=Image.open(out/f'{name}-wk.png');im=png.convert('RGB').crop(box)
 im.save(out/f'{name}-form.png',icc_profile=srgb.tobytes())
 native[name]={'crop':box,'imageSize':im.size,'iccBytes':len(png.info.get('icc_profile',b'')),'units':units,'windowDiagnostics':j['windowDiagnostics']}
 images[name]=im
for radius in [24,26,28]:images[f'author-radius{radius}']=Image.open(a/f'prepare-attempt01/probe-radius{radius}-form.png').convert('RGB')
measurements={}
for name,im in images.items():
 c=contours(im);m=mask(im)
 measurements[name]={'medianRGB':colors(im),'cornerInsets':c,'cornerAbsoluteDifference':sum(abs(c[s][i]-referenceContour[s][i]) for s in c for i in range(len(depths))), 'checkboxFillPixels':sum(m),'checkboxMaskDifference':sum(x!=y for x,y in zip(m,referenceMask))}
assert measurements['candidate']['medianRGB']==measurements['reference']['medianRGB']
assert measurements['candidate']['cornerAbsoluteDifference']<measurements['baseline']['cornerAbsoluteDifference']
assert measurements['candidate']['checkboxMaskDifference']<measurements['baseline']['checkboxMaskDifference']
def relativeRects(name):
 units=native[name]['units'];r=units[0]['rect']
 return [{**u['rect'],'x':u['rect']['x']-r['x'],'y':u['rect']['y']-r['y']} for u in units]
assert relativeRects('baseline')==relativeRects('candidate')==relativeRects('candidate-dark')
actual=[]
for r in relativeRects('candidate'):actual.append([round(r['x']*2),round(r['y']*2),round((r['x']+r['width'])*2),round((r['y']+r['height'])*2)])
assert actual[0]==[0,0,800,414] and actual[3]==[40,192,72,224] and actual[-2:]==[[424,326,584,374],[600,326,760,374]]
def rgb(s):return tuple(map(float,s[s.index('(')+1:s.index(')')].split(',')[:3]))
def lum(c):
 v=[x/255 for x in c];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
 return sum(x*y for x,y in zip(v,[.2126,.7152,.0722]))
contrasts={}
dark=native['candidate-dark']['units'];paper=rgb(dark[0]['styles']['background-color'])
for i,label in [(1,'title'),(2,'name'),(4,'description'),(6,'cancel'),(7,'confirm')]:
 s=dark[i]['styles'];fg=rgb(s['color']);bg=paper if s['background-color'].startswith('rgba') else rgb(s['background-color']);l1,l2=sorted([lum(fg),lum(bg)]);contrasts[label]={'foreground':fg,'background':bg,'ratio':(l2+.05)/(l1+.05)}
assert min(v['ratio'] for v in contrasts.values())>7
canvas=Image.new('RGB',(2400,450),'#ddd');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(['reference','baseline','candidate']):
 draw.text((i*800+10,10),name,fill='black');canvas.paste(images[name],(i*800,36))
canvas.save(p/'independent-comparison.png',icc_profile=srgb.tobytes())
result={'status':'pass','referenceInput':'runtime18 original JPEG directly decoded and embedded Display ICC converted with saved comparison-srgb.icc','displayICCsha256':sha(profile),'srgbICCsha256':sha(srgb.tobytes()),'rawOriginal':colors(original),'convertedRuntimeClone':colors(convert(clone).crop((688,453,1488,867))),'depthsImagePx':depths,'comparison':measurements,'native':native,'relativeBoundsImagePx':actual,'darkContrast':contrasts,'limits':'Only documented flat ROIs, threshold checkbox mask and corner samples. No complete pixel match, installed app, active native focus/selection or original dark equivalence.'}
(p/'independent-measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'pass','measurements':measurements,'darkContrast':contrasts}))
