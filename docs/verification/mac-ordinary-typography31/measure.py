from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
import json,hashlib
OUT=Path(__file__).resolve().parent
ROIS={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)};CARET=(268,115,280,158);SRGB=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
RUNS=['baseline-native','baseline-selected','probe-color-native','probe-selection-selected','probe-smoothing-native','probe-smoothing-selected','probe-rendering-native','candidate-native','candidate-selected']
RAW={};IMS={};META={}
for name in ['ref-all29','ref-all31','ref-caret31']:
 RAW[name]=Image.open(OUT/(name+'-raw.png')).convert('RGB');IMS[name]=Image.open(OUT/(name+'-srgb.png')).convert('RGB')
for name in RUNS:
 j=json.loads((OUT/(name+'.json')).read_text());m=j['metrics'];r=m['panel'];source=Image.open(OUT/(name+'.png'));im=source.convert('RGB').crop((round(r[0]*2),round(r[1]*2),round((r[0]+r[2])*2),round((r[1]+r[3])*2)));assert im.size==(800,414)
 RAW[name]=im;IMS[name]=im;im.save(OUT/(name+'-form.png'),icc_profile=SRGB.tobytes());META[name]={'computed':m['nodes'],'selectionStyle':m['selectionStyle'],'window':m['window'],'panel':r,'beforeAfterRectEqual':m['beforeRects']==m['afterRects'],'snapshotColorInfo':{'srgbChunk':source.info.get('srgb'),'iccPresent':bool(source.info.get('icc_profile'))},'inactiveUnattached':not j['appActive']and not j['webViewAttachedToWindow'],'noVisibleWindow':all(not w['visible']for w in j['windowDiagnostics']),'errors':m['errors'],'requests':m['requests']}
def pts(roi,exclude=None):return[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if not(exclude and exclude[0]<=x<exclude[2]and exclude[1]<=y<exclude[3])]
def box(im,points,t):
 z=[(x,y)for x,y in points if max(im.getpixel((x,y)))<t];return{'pixels':len(z),'bbox':[min(x for x,y in z),min(y for x,y in z),max(x for x,y in z)+1,max(y for x,y in z)+1]if z else None}
def mae(a,b,points):return sum(abs(v-w)for pt in points for v,w in zip(a.getpixel(pt),b.getpixel(pt)))/(len(points)*3)
NATIVE=['baseline-native','probe-color-native','probe-smoothing-native','probe-rendering-native','candidate-native'];SELECTED=['baseline-selected','probe-selection-selected','probe-smoothing-selected','candidate-selected'];records={};errorRecords={}
for name in list(RAW):
 records[name]={'raw':{k:{str(t):box(RAW[name],pts(r),t)for t in [100,160,200]}for k,r in ROIS.items()},'srgb':{k:{str(t):box(IMS[name],pts(r),t)for t in [100,160,200]}for k,r in ROIS.items()}}
for state,names,ref in [('native',NATIVE,'ref-caret31'),('selected-diagnostic',SELECTED,'ref-all31')]:
 for key,roi in ROIS.items():
  points=pts(roi,CARET if state=='native'and key=='name'else None)
  common=[pt for pt in points if any(max(IMS[n].getpixel(pt))<200 for n in [ref]+names)]
  for name in names:
   errorRecords.setdefault(name,{})[key]={'reference':ref,'roi':roi,'commonCaretExcluded':CARET if state=='native'and key=='name'else None,'sameSamplePixels':len(points),'fullRoiMeanAbsChannelErrorSrgb':mae(IMS[name],IMS[ref],points),'commonGlyphUnionPixels':len(common),'commonGlyphUnionMeanAbsChannelErrorSrgb':mae(IMS[name],IMS[ref],common),'maskDisagreementRaw':{str(t):sum((max(RAW[name].getpixel(pt))<t)!=(max(RAW[ref].getpixel(pt))<t)for pt in points)for t in [100,160,200]}}
checkbox=(38,192,76,230);cb=pts(checkbox)
checks={'allExternalRectsEqual':all(META[n]['beforeAfterRectEqual']for n in RUNS),'candidateNativeRectsEqualBaseline':json.loads((OUT/'candidate-native.json').read_text())['metrics']['afterRects']==json.loads((OUT/'baseline-native.json').read_text())['metrics']['afterRects'],'checkboxRoi':checkbox,'checkboxChangedPixels':sum(RAW['baseline-native'].getpixel(pt)!=RAW['candidate-native'].getpixel(pt)for pt in cb),'renderingProbeImageExactlyBaseline':RAW['probe-rendering-native'].tobytes()==RAW['baseline-native'].tobytes(),'candidateNativeImageExactlyAutoProbe':RAW['candidate-native'].tobytes()==RAW['probe-smoothing-native'].tobytes(),'candidateSelectedImageExactlyAutoProbe':RAW['candidate-selected'].tobytes()==RAW['probe-smoothing-selected'].tobytes(),'original31FullSelectExactlyOriginal29':RAW['ref-all31'].tobytes()==RAW['ref-all29'].tobytes()}
checks['original31Vs29GlyphRoisExact']={k:RAW['ref-all29'].crop(r).tobytes()==RAW['ref-all31'].crop(r).tobytes()for k,r in ROIS.items()}
assert checks['allExternalRectsEqual']and checks['candidateNativeRectsEqualBaseline']and checks['checkboxChangedPixels']==0 and checks['candidateNativeImageExactlyAutoProbe']and checks['candidateSelectedImageExactlyAutoProbe']
r={'scope':'Task31 finite production SmartFolderForm WK text diagnosis; source candidate only; actual Mac13 acceptance still required','coordinates':'29 fixed native800x414 ROIs; integer crop from WK actual panel400x207 CSS atDPR2; no per-glyph alignment/resize','colorHandling':'Original Display ICC→sRGB via Pillow/LittleCMS; raw kept separately. WK PNG has explicit sRGB chunk0; no extra guessed ICC transform. Derived form/glyph PNGs tagged sRGB.','fixedRois':ROIS,'caretExclusion':{'roi':CARET,'applies':'common native name error/union comparison only; original02 gold insertion caret at text end; same exclusion all native candidates; raw full-ROI threshold coverage/bboxes also reported; no glyph pixels shifted'},'measurements':records,'errorsVsPairedOriginal':errorRecords,'renderMetadata':META,'preservationChecks':checks,'limits':['Unattached inactive WK does not paint actual active focus; selected focus declarations use explicit test class diagnostics.','Original01 and original29 full-image equality is explicitly reported; matching coverage alone is not independent glyph variability evidence.','Original source JPEG4:2:0/Display ICC versus WK sRGB PNG leaves capture/AA differences; computed family/weight is not actual glyph font identity.','No font-weight/family matrix: smoothing single-variable explains improvement; color/rendering unfavorable controls retained.']}
(OUT/'measurements.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
canvas=Image.new('RGB',(920,750),'#ddd');d=ImageDraw.Draw(canvas)
for i,name in enumerate(['ref-caret31','baseline-native','candidate-native','ref-all31','baseline-selected','candidate-selected']):
 im=IMS[name];d.text((4,i*125+3),name+' | nearest2x fixed ROIs / no glyph alignment',fill='black')
 for x,k in [(0,'name'),(320,'nameLabel'),(500,'smartLabel')]:
  roi=ROIS[k];crop=im.crop(roi);canvas.paste(crop.resize((crop.width*2,crop.height*2),Image.Resampling.NEAREST),(x,i*125+26))
canvas.save(OUT/'final-glyph-comparison-srgb.png',icc_profile=SRGB.tobytes())
print(json.dumps({'preservation':checks,'native160':{n:{k:v['160']for k,v in records[n]['raw'].items()}for n in ['ref-caret31','baseline-native','candidate-native']},'selected160':{n:{k:v['160']for k,v in records[n]['raw'].items()}for n in ['ref-all31','baseline-selected','candidate-selected']},'pairedErrors':{n:errorRecords[n]for n in ['baseline-native','candidate-native','baseline-selected','candidate-selected']}},ensure_ascii=False,indent=2))
