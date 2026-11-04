"""Compare saved offscreen WK outputs with fixed research19 inputs; writes only here."""
from pathlib import Path
from PIL import Image,ImageCms
import io,json,statistics,hashlib
p=Path(__file__).resolve().parent
original=Image.open(p.parent/'mac-ordinary-form-pixels19-research/original-decoded.png')
clone=Image.open(p.parent/'mac-ordinary-form-pixels19-research/clone-native-crop.png')
icc=original.info['icc_profile']
assert (p/'reference-display.icc').read_bytes()==icc
srgb=ImageCms.ImageCmsProfile(str(p/'comparison-srgb.icc'))
reference=ImageCms.profileToProfile(original,ImageCms.ImageCmsProfile(io.BytesIO(icc)),srgb,outputMode='RGB')
reference.save(p/'reference-srgb.png',icc_profile=srgb.tobytes())
rois={'panel':(200,20,650,90),'cancel':(440,330,460,365),'ok':(620,330,640,365),'checkbox':(45,198,67,218)}
ys=[4,8,12,16,20,24,32,40]
def colors(im):return {k:[statistics.median(v) for v in zip(*im.convert('RGB').crop(r).getdata())]for k,r in rois.items()}
def corners(im):
 im=im.convert('RGB');result={}
 for corner in ['TL','TR','BL','BR']:
  result[corner]=[next((x for x in range(100)if statistics.median([min(im.getpixel(((799-xx if corner.endswith('R') else xx),(413-y if corner.startswith('B')else y))))for xx in range(max(0,x-2),min(800,x+3))])>=230),None)for y in ys]
 return result
inputs={};images={'reference':reference};metrics={}
for directory,names in [('prepare-attempt01',['baseline','probe-radius24','probe-radius26','probe-radius28','probe-checkbox5']),('verify-attempt01',['baseline','candidate','candidate-dark'])]:
 for name in names:
  prefix=p/directory/(name+'-wk');record=prefix.with_suffix('.json')
  if not record.exists():continue
  j=json.loads(record.read_text());assert j['status']=='metrics-ok' and not j['appActive'] and not j['webViewAttachedToWindow']
  assert all(not w['visible']and not w['key']and not w['main']for w in j['windowDiagnostics'])
  assert j['metrics']['devicePixelRatio']==2 and j['snapshotPixels']==[2176,1320] and not j['metrics']['requests']
  units={r['selector']:r for r in j['metrics']['units']};f=units['.smart-form']['rect'];assert[f['width'],f['height']]==[400,207]
  box=tuple(round(v*2)for v in [f['x'],f['y'],f['x']+f['width'],f['y']+f['height']]);image=Image.open(prefix.with_suffix('.png')).convert('RGB').crop(box)
  image.save(p/directory/(name+'-form.png'));key=directory+'/'+name
  if name!='candidate-dark':images[key]=image
  metrics[key]={'nativeCrop':box,'localRects':{s:{**r['rect'],'x':r['rect']['x']-f['x'],'y':r['rect']['y']-f['y']}for s,r in units.items()},'cssPaint':{s:r['styles']for s,r in units.items()},'windowDiagnostics':j['windowDiagnostics'],'originalHelperSnapshotIccBytes':len(Image.open(prefix.with_suffix('.png')).info.get('icc_profile',b''))}
def checkbox_mask(im):
 tile=im.convert('RGB').crop((40,192,72,224))
 return [max(px)<246 for px in tile.getdata()]
def checkbox(im):
 mask=checkbox_mask(im);ref=checkbox_mask(reference)
 return {'bbox':[40,192,72,224],'threshold':'max RGB < 246','filledPixels':sum(mask),'maskDisagreementPixels':sum(a!=b for a,b in zip(mask,ref)), 'firstEightRowFilledBounds':[[next((x for x in range(32) if mask[y*32+x]),None),next((x for x in range(31,-1,-1) if mask[y*32+x]),None)]for y in range(8)]}
target=colors(reference);target_corners=corners(reference)
comparison={k:{'medianRGB':colors(im),'checkboxContour':checkbox(im),'cornerY':ys,'bright230CornerInsets':corners(im),'cornerAbsoluteError':sum(abs(v-t)for c,values in corners(im).items()for v,t in zip(values,target_corners[c])),'colorAbsoluteError':{r:sum(abs(a-b)for a,b in zip(colors(im)[r],target[r]))for r in rois}}for k,im in images.items()}
calibration={'displayProfileSha256':hashlib.sha256(icc).hexdigest(),'displayProfileDescription':ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))).strip(),'rawOriginal':colors(original),'iccConvertedOriginalSrgb':target,'rawRuntime18Clone':colors(clone),'iccConvertedRuntime18CloneSrgb':colors(ImageCms.profileToProfile(clone,ImageCms.ImageCmsProfile(io.BytesIO(icc)),srgb,outputMode='RGB')),'method':'Pillow LittleCMS embedded Display ICC to sRGB; original JPEG ROI uncertainty retained. Untagged WK PNG numeric CSS calibration is checked against computed CSS and converted known runtime18 clone, not assumed a universal colorspace proof.'}
geometry_checks={'status':'not-yet-final'}
if 'verify-attempt01/candidate' in metrics:
 baseline_rects=metrics['verify-attempt01/baseline']['localRects'];candidate_rects=metrics['verify-attempt01/candidate']['localRects']
 assert candidate_rects==baseline_rects
 expected={'.smart-form':[0,0,800,414],'.smart-make input':[40,192,72,224],'footer button:first-child':[424,326,584,374],'footer button.smart-primary':[600,326,760,374]}
 actual={s:[int(r['x']*2),int(r['y']*2),int((r['x']+r['width'])*2),int((r['y']+r['height'])*2)]for s,r in candidate_rects.items()if s in expected}
 assert actual==expected
 geometry_checks={'status':'pass','allMeasuredRectsEqualBaseline':True,'nativeImageBounds':actual,'titleInkBbox':'Not remeasured; h2 line box/font metrics unchanged, geometry15 package claim remains separate.'}
(p/'measurements.json').write_text(json.dumps({'calibration':calibration,'geometryComparison':geometry_checks,'metrics':metrics,'comparison':comparison,'limits':'Only allowed surfaces/corners compared. No full pixel pass, native focus/selection/installed package evidence.'},ensure_ascii=False,indent=2)+'\n')
names=list(images);canvas=Image.new('RGB',(800*len(names),450),'#ddd')
from PIL import ImageDraw
d=ImageDraw.Draw(canvas)
for i,k in enumerate(names):canvas.paste(images[k],(i*800,36));d.text((i*800+8,10),k,fill='black')
canvas.save(p/'surface-comparison-native.png',icc_profile=srgb.tobytes())
tiles=Image.new('RGB',(160*len(names),160*4+30),'#ddd');d=ImageDraw.Draw(tiles)
for i,k in enumerate(names):
 d.text((i*160+3,3),k.split('/')[-1],fill='black')
 for n,(x,y)in enumerate([(0,0),(720,0),(0,334),(720,334)]):tiles.paste(images[k].crop((x,y,x+80,y+80)).resize((160,160),Image.Resampling.NEAREST),(i*160,30+n*160))
tiles.save(p/'corner-comparison-nearest2x.png',icc_profile=srgb.tobytes())
print(json.dumps({k:{'colors':v['medianRGB'],'cornersTL':v['bright230CornerInsets']['TL'],'cornerError':v['cornerAbsoluteError']}for k,v in comparison.items()},ensure_ascii=False))

final_names=['reference','verify-attempt01/baseline','verify-attempt01/candidate']
canvas=Image.new('RGB',(2400,450),'#ddd');d=ImageDraw.Draw(canvas)
for i,k in enumerate(final_names):canvas.paste(images[k],(i*800,36));d.text((i*800+8,10),k,fill='black')
canvas.save(p/'final-surface-comparison-native.png',icc_profile=srgb.tobytes())
checkboxes=Image.new('RGB',(3*288,300),'#ddd');d=ImageDraw.Draw(checkboxes)
for i,k in enumerate(final_names):
 d.text((i*288+4,4),k.split('/')[-1],fill='black');checkboxes.paste(images[k].crop((38,190,74,226)).resize((288,288),Image.Resampling.NEAREST),(i*288,12))
checkboxes.save(p/'final-checkbox-comparison-nearest8x.png',icc_profile=srgb.tobytes())
