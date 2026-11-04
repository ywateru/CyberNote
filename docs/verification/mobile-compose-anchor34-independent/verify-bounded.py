from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import hashlib,json,difflib
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/mobile-compose-anchor34'
read=lambda p:json.loads(p.read_text())
author=read(AUTHOR/'analysis.json');fresh=read(OUT/'fresh-production.json');assert fresh['status']=='pass'
base=(AUTHOR/'baseline-style.css').read_text();current=(ROOT/'src/style.css').read_text();addition='  .mobile.page-folders .folder-footer {\n    padding-right: 14px;\n  }\n'
assert current.count(addition)==1 and current.replace(addition,'',1)==base
(OUT/'source.diff').write_text(''.join(difflib.unified_diff(base.splitlines(keepends=True),current.splitlines(keepends=True),fromfile='preserved-baseline/src/style.css',tofile='fixed-candidate/src/style.css')))
# Recompute the established compose ROI only, independently of the author's analyzer.
images={
 'original14':('references/mobile/frames-2s/frame-008.png',(192,434,220,463)),
 'original62':('references/mobile/frames-2s/frame-032.png',(192,434,220,463)),
 'android07':('docs/verification/android-folder-visual-runtime29/19-after-restart.png',(930,2020,1060,2130)),
 'host-baseline':('docs/verification/mobile-compose-anchor34/baseline/folders.png',(930,1935,1060,2045)),
 'host-candidate':('docs/verification/mobile-compose-anchor34/candidate/folders.png',(930,1935,1060,2045)),
 'fresh-baseline':('docs/verification/mobile-compose-anchor34-independent/fresh-baseline-folders.png',(930,1935,1060,2045)),
 'fresh-candidate':('docs/verification/mobile-compose-anchor34-independent/fresh-candidate-folders.png',(930,1935,1060,2045)),
}
records={};canvas=Image.new('RGB',(7*240,320),'#ddd');draw=ImageDraw.Draw(canvas)
for i,(name,(path,roi)) in enumerate(images.items()):
 with Image.open(ROOT/path) as source:
  source.load();im=source.convert('RGB');size=list(source.size);icc=len(source.info.get('icc_profile',b''))
 ratio=im.width/224;measure={}
 for mask,blue,rg in [('gold_strict',.65,1.06),('gold_loose',.80,1.03)]:
  coords=[]
  for y in range(roi[1],roi[3]):
   for x in range(roi[0],roi[2]):
    r,g,b=im.getpixel((x,y))
    if r>140 and g>95 and b<blue*r and r>rg*g:coords.append((x,y))
  assert coords,name
  box=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords)+1,max(y for x,y in coords)+1]
  measure[mask]={'nativeBbox':box,'pixels':len(coords),'leftInReferencePx':box[0]/ratio,'rightInReferencePx':box[2]/ratio,'centerXInReferencePx':(box[0]+box[2])/2/ratio,'widthInReferencePx':(box[2]-box[0])/ratio,'heightInReferencePx':(box[3]-box[1])/ratio}
 records[name]={'path':path,'imageSize':size,'iccBytes':icc,'roi':list(roi),'widthRatio':ratio,'masks':measure}
 if name in author['records']:assert measure==author['records'][name]['masks'],name
 draw.text((i*240+4,4),name,fill='black');draw.text((i*240+4,20),str(roi),fill='black');draw.text((i*240+4,36),'whole-width ratio; nearest8x',fill='black')
 crop=im.crop(roi);canvas.paste(crop.resize((round(crop.width/ratio*8),round(crop.height/ratio*8)),Image.Resampling.NEAREST),(i*240+4,65))
canvas.save(OUT/'compose-diagnostic.png')
for phase in ['baseline','candidate']:assert records['fresh-'+phase]['masks']==records['host-'+phase]['masks']
differences={}
for name,p1,p2 in [('author-folders',AUTHOR/'baseline/folders.png',AUTHOR/'candidate/folders.png'),('fresh-folders',OUT/'fresh-baseline-folders.png',OUT/'fresh-candidate-folders.png'),('desktop-control',AUTHOR/'baseline/desktop.png',AUTHOR/'candidate/desktop.png'),('stable-notes-control',AUTHOR/'baseline-stable-notes-retry01/notes.png',AUTHOR/'candidate-stable-notes/notes.png')]:
 with Image.open(p1) as ia,Image.open(p2) as ib:
  ia.load();ib.load();assert ia.size==ib.size;diff=ImageChops.difference(ia.convert('RGB'),ib.convert('RGB'));box=diff.getbbox();differences[name]={'imageSize':list(ia.size),'differenceBbox':list(box)if box else None}
 if name.endswith('control'):assert box is None
 else:assert box==(966,1964,1031,2021)
# Limited saved outside controls: compare only relevant nodes/geometry and explicit properties,
# rather than rerunning the author's 16 MB all-property snapshot matrix.
classes={'folder-header','folder-search','account-title','folder-footer','folders-pane','notes-pane','notes-header','notes-footer','search-field'}
props=['display','width','height','padding-left','padding-right','padding-bottom','font-size','font-weight','color','transform']
controls={}
for name,first,second in [('desktop','baseline/result.json','candidate/result.json'),('notes','baseline-stable-notes-retry01/result.json','candidate-stable-notes/result.json')]:
 a=read(AUTHOR/first);b=read(AUTHOR/second);assert a['status']==b['status']=='pass';x=a['snapshots'][name];y=b['snapshots'][name]
 def select(s):return[{'tag':e['tag'],'class':e['class'],'rect':e['rect'],'text':e['text'],'computed':{k:e['computed'].get(k)for k in props}}for e in s['elements'] if classes.intersection((e['class']or'').split())]
 sa,sb=select(x),select(y);assert sa and sa==sb;assert x['storage']==y['storage'];controls[name]={'selectedNodes':len(sa),'selectedNodeClasses':[z['class']for z in sa],'selectedProperties':props,'geometryAndSelectedStylesEqual':True,'storageEqual':True}
# Reproduce the saved-image translation-only model. This is not an Android render.
androidCenter=records['android07']['masks']['gold_strict']['centerXInReferencePx'];nativeShift=3*2.75;referenceShift=nativeShift/(1080/224)
model={'cssShift':3,'currentAndroidDpr':2.75,'nativeShift':nativeShift,'referenceShift':referenceShift,'beforeCenter':androidCenter,'afterCenter':androidCenter+referenceShift,'residualFrom208':androidCenter+referenceShift-208,'desiredCssDeltaFromSavedBaseline':(208-androidCenter)*(1080/224)/2.75,'notNewDeviceEvidence':True}
assert model['afterCenter']==author['androidTranslationModelNotDeviceProof']['referenceCenterAfter']
failures={}
for name in ['baseline-stable-notes/result.json','baseline-stable-notes-retry01/result.json','candidate-stable-notes/result.json']:
 d=read(AUTHOR/name);failures[name]={'status':d.get('status'),'failure':d.get('failure'),'errors':d.get('errors')}
assert failures['baseline-stable-notes/result.json']['status']=='fail'
assert failures['baseline-stable-notes-retry01/result.json']['status']=='pass'
result={'status':'pass','scope':'Source and saved compose ROI/model, limited saved outside controls, one fresh production preview run; no new device acceptance','exactThreeLineSourceAddition':True,'records':records,'pixelDifferences':differences,'outsideSavedControls':controls,'translationOnlyModel':model,'authorFailureInspection':failures,'knownOriginalBaselineBBoxEmpty':read(AUTHOR/'baseline/result.json')['snapshots']['folders']['compose']['bbox']=={},'freshActualBBoxBothCaptured':fresh['baseline']['bbox']==fresh['candidate']['bbox'],'noPathPerfectOrOriginalDprClaim':True}
(OUT/'bounded-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'pass','composeBboxes':{k:v['masks']['gold_strict']['nativeBbox']for k,v in records.items()},'pixelDifferences':differences,'outsideSavedControls':controls,'translationOnlyModel':model},ensure_ascii=False,indent=2))
