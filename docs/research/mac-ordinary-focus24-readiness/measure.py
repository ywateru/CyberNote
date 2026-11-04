from pathlib import Path
from PIL import Image, ImageCms, ImageChops, ImageDraw
import hashlib, io, json, statistics
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
sources={
 'original18':'docs/verification/mac-folder-fixes-runtime18/00-original-ordinary.cua-image',
 'clone18':'docs/verification/mac-folder-fixes-runtime18/18-ordinary-form-open.cua-image',
 'inactive23':'docs/verification/mac-ordinary-sidebar-runtime23/00-original-ordinary.cua-image',
 'active23':'docs/verification/mac-ordinary-sidebar-runtime23/01-original-ordinary-active.cua-image',
}
def maskbox(im,roi,predicate):
 points=[(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2]) if predicate(im.getpixel((x,y)))]
 return {'bbox':[min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1] if points else None,'pixels':len(points)}
def med(im,roi):
 pixels=list(im.crop(roi).getdata());return [statistics.median(p[c] for p in pixels) for c in range(3)]
ims={};profiles={};records={}
for name,rel in sources.items():
 p=ROOT/rel;data=p.read_bytes();src=Image.open(io.BytesIO(data));icc=src.info.get('icc_profile');im=src.convert('RGB')
 if name=='clone18':im=im.crop((688,453,1488,867))
 profiles[name]=icc;ims[name]=im
 srgb=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(icc)),ImageCms.createProfile('sRGB'),outputMode='RGB')
 records[name]={'source':rel,'sha256':hashlib.sha256(data).hexdigest(),'nativeSourceSize':list(src.size),'analyzedSize':list(im.size),'iccSha256':hashlib.sha256(icc).hexdigest(),'nameInk':{str(t):maskbox(im,(135,115,280,158),lambda p,t=t:max(p)<t) for t in [100,160,200]},'goldRing':{str(t):maskbox(im,(110,95,780,180),lambda p,t=t:p[0]>170 and p[1]>140 and p[0]-p[2]>t and p[1]-p[2]>t/2) for t in [15,25,35]},'selectionTopBarROI':[145,120,265,124],'selectionTopBarRawRGB':med(im,(145,120,265,124)),'selectionTopBarSrgb':med(srgb,(145,120,265,124)),'verticalRawScanX400':[{'y':y,'rgb':list(im.getpixel((400,y)))} for y in range(100,170)]}
 im.save(OUT/(name+'.png'),icc_profile=icc)
diff=ImageChops.difference(ims['original18'],ims['active23'])
result={'scope':'Static JPEG measurements only; no live focus, new clone package, CSS test or pixel PASS','coordinateConvention':'native image pixels, half-open boxes; clone18 crop reused from sealed19; no rescaling','imageRecords':records,'active23VsOriginal18':{'allPixelsIdentical':diff.getbbox() is None,'changedPixelBbox':diff.getbbox()},'limits':['Shared ICC does not establish matching application activation or capture timing.','JPEG chroma subsampling and antialiasing make approximately one-pixel edge variation inconclusive.','sRGB medians are measured fixed input samples, not proposed CSS constants.']}
(OUT/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
canvas=Image.new('RGB',(670,444),(215,215,215));d=ImageDraw.Draw(canvas)
for n,name in enumerate(['original18','active23','inactive23','clone18']):
 d.text((5,n*111+5),name+' crop [110,95,780,180)',fill='black');canvas.paste(ims[name].crop((110,95,780,180)),(0,n*111+26))
canvas.save(OUT/'focus-comparison-native.png',icc_profile=profiles['active23'])
print(json.dumps({'records':{k:{'ink160':v['nameInk']['160']['bbox'],'ring35':v['goldRing']['35']['bbox'],'barRaw':v['selectionTopBarRawRGB'],'barSrgb':v['selectionTopBarSrgb']} for k,v in records.items()},'active23VsOriginal18':result['active23VsOriginal18']},ensure_ascii=False,indent=2))
