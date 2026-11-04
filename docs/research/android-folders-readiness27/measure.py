from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
B=json.loads((ROOT/'docs/research/mobile-folders-baseline14/measurements.json').read_text())
S=1080/224
PATHS={'original14':'references/mobile/frames-2s/frame-008.png','original62':'references/mobile/frames-2s/frame-032.png','android05':'docs/verification/android-smart-u-runtime09/05-started.png','android06-03':'docs/verification/android-folder-fixes-runtime18/03-stable-after-upgrade.png','android06-39':'docs/verification/android-folder-fixes-runtime18/39-final-folders-count1.png'}
PRED={'dark100':lambda p:max(p)<100,'dark160':lambda p:max(p)<160,'gold_strict':lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0] and p[0]>1.06*p[1],'gold_loose':lambda p:p[0]>140 and p[1]>95 and p[2]<.80*p[0] and p[0]>1.03*p[1],'white250':lambda p:min(p)>=250,'white252':lambda p:min(p)>=252,'search237':lambda p:min(p)>=200 and max(p)<=244 and p[0]<237 and p[1]<237,'search234':lambda p:min(p)>=200 and max(p)<=242 and p[0]<234 and p[1]<234}
M={};IMS={}
def bbox(im,roi,pred):
 pts=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))]
 return [min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None
for name,rel in PATHS.items():
 im=Image.open(ROOT/rel).convert('RGB');IMS[name]=im;template=B['measurements'][name if name.startswith('original')else'android'];records={}
 for key,r in template.items():
  roi=r['roi'].copy()
  if key=='physical_card_white_visible' and name.startswith('android06'):roi=[0,770,1080,1170]
  records[key]={'roi':roi,'bbox_by_mask':{mask:bbox(im,roi,PRED[mask])for mask in r['bbox_by_mask']}}
 M[name]={'source':rel,'nativeSize':list(im.size),'measurements':records}
KEYS=['title_ink','search_fill','quick_label_ink','quick_icon_gold','memo_label_ink','memo_icon_gold','footer_folder_gold','footer_compose_gold']
MASKS={k:'gold_strict'if'gold'in k else'search237'if k=='search_fill'else'dark160'for k in KEYS}
finite={}
for name in ['original14','original62','android05','android06-03','android06-39']:
 q=M[name]['measurements'];factor=1 if name.startswith('original')else S;r={}
 for k in KEYS:
  b=q[k]['bbox_by_mask'][MASKS[k]];r[k]={'mask':MASKS[k],'nativeBbox':b,'widthInReferencePx':(b[2]-b[0])/factor,'heightInReferencePx':(b[3]-b[1])/factor,'leftInReferencePx':b[0]/factor,'centerXInReferencePx':(b[0]+b[2])/2/factor}
 finite[name]=r
comparison={k:{'sameAndroid05And06_03':finite['android05'][k]['nativeBbox']==finite['android06-03'][k]['nativeBbox'],'sameAndroid06_03And39':finite['android06-03'][k]['nativeBbox']==finite['android06-39'][k]['nativeBbox']} for k in KEYS}
ref=finite['original14'];cur=finite['android06-39']
deltas={'quickTextLeftReferencePx':cur['quick_label_ink']['leftInReferencePx']-ref['quick_label_ink']['leftInReferencePx'],'titleWidthReferencePx':cur['title_ink']['widthInReferencePx']-ref['title_ink']['widthInReferencePx'],'ordinaryFolderWidthReferencePx':cur['memo_icon_gold']['widthInReferencePx']-ref['memo_icon_gold']['widthInReferencePx'],'footerFolderCenterXReferencePx':cur['footer_folder_gold']['centerXInReferencePx']-ref['footer_folder_gold']['centerXInReferencePx'],'footerComposeCenterXReferencePx':cur['footer_compose_gold']['centerXInReferencePx']-ref['footer_compose_gold']['centerXInReferencePx']}
# Native separator scan retained for finite row pitch, without inferring group content equivalence.
separatorScans={name:{'x':750,'rangeY':[895,1040],'rgbByY':[[y,*IMS[name].getpixel((750,y))] for y in range(895,1040)]}for name in ['android06-03','android06-39']}
# Low-risk comparisons use only stable shared ROIs; different count/tag/title content is not a visual failure.
sharedRegions={'title':[20,190,360,320],'search':[0,330,1080,460],'quickLabel':[175,510,450,585],'quickIcon':[60,505,165,592],'ordinaryIcon':[60,925,165,1005],'footerLeft':[20,2020,150,2130],'footerRight':[930,2020,1060,2130]}
changes={}
for key,r in sharedRegions.items():
 a=IMS['android05'].crop(r);b=IMS['android06-39'].crop(r);pairs=list(zip(a.getdata(),b.getdata()));changes[key]={'roi':r,'changedPixels05To06':sum(x!=y for x,y in pairs),'maxChannelDifference':max(abs(v-w)for x,y in pairs for v,w in zip(x,y))}
result={'scope':'finite exactAndroid06 saved unscrolled folder page; no ADB/GUI/app tests or full pixel PASS','coordinates':'native image pixels half-open; ratio1080/224 only width normalization, not dp/pt/DPR','ratio':S,'rawMeasurements':M,'finiteMeasures':finite,'sharedBboxComparison':comparison,'android06MinusOriginal14ReferencePixelDeltas':deltas,'stableSharedRoi05To06':changes,'separatorScans':separatorScans,'rowPitch':{'originalReference':25,'android06SeparatorsAtX750':[908,1029],'android06Pitch':121,'android06PitchDividedByRatio':121/S},'systemExclusions':B['system_exclusions'],'limits':['Original three quick-group rows versus Android one; original iCloud long list versus local physical/smart/tag data.','Physical card06 has three rows, unlike05 two; no whole-card-height or absolute next-group-y comparison.','Reference224x480 compression leaves about1-2 source pixel boundary uncertainty; no font-weight inference.','Width-only normalized full-image overview is explanatory and retains unequal system bars and height.']}
(OUT/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
# Clearly labeled overview; original pixels unchanged, Android only uniformly reduced by width.
canvas=Image.new('RGB',(672,515),'#ddd');d=ImageDraw.Draw(canvas)
for n,name in enumerate(['original14','original62','android06-39']):
 d.text((n*224+4,5),{'original14':'Original 14s / native224px','original62':'Original 62s / native224px','android06-39':'Android06 / width-only224px'}[name],fill='black')
 im=IMS[name]
 if name.startswith('android'):im=im.resize((224,round(im.height/S)),Image.Resampling.LANCZOS)
 canvas.paste(im,(n*224,30))
canvas.save(OUT/'overview-width-normalized.png')
# Native high-res Android guide and native source guide preserve coordinate interpretability.
for name in ['original14','android06-39']:
 im=IMS[name].copy();d=ImageDraw.Draw(im)
 for number,k in enumerate(KEYS,1):
  b=finite[name][k]['nativeBbox'];d.rectangle((b[0],b[1],b[2]-1,b[3]-1),outline='#ee2255',width=1 if name=='original14'else 3);d.text((b[0],max(0,b[1]-12)),str(number),fill='#ee2255')
 im.save(OUT/(name+'-native-guide.png'))
# Diagnostic local crops use the same full-screen width scale and explicit nearest enlargement.
for label,ro,ra in [('quick',(8,111,216,137),(39,489,1041,610)),('ordinary-folder',(13,246,35,270),(60,925,165,1005)),('footer',(4,434,36,463),(20,2020,150,2130))]:
 left=IMS['original14'].crop(ro);right=IMS['android06-39'].crop(ra);right=right.resize((round(right.width/S),round(right.height/S)),Image.Resampling.LANCZOS)
 w=max(left.width,right.width,100);h=max(left.height,right.height);im=Image.new('RGB',(w*4,h*8+60),'#ddd');d=ImageDraw.Draw(im)
 d.text((3,3),'Original14 native crop, nearest4x',fill='black');im.paste(left.resize((left.width*4,left.height*4),Image.Resampling.NEAREST),(0,20));y=h*4+40;d.text((3,y-17),'Android06 width-normalized, nearest4x',fill='black');im.paste(right.resize((right.width*4,right.height*4),Image.Resampling.NEAREST),(0,y));im.save(OUT/(label+'-comparison-diagnostic.png'))
print(json.dumps({'finiteBboxes':{k:{j:v['nativeBbox']for j,v in r.items()}for k,r in finite.items()},'deltas':deltas,'05to06SharedBboxes':comparison,'stableSharedRoi05To06':changes},ensure_ascii=False,indent=2))
