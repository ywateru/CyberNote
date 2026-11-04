from pathlib import Path
from PIL import Image,ImageDraw
import json
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
B=json.loads((ROOT/'docs/research/mobile-folders-baseline14/measurements.json').read_text());S=1080/224
PATHS={'original14':'references/mobile/frames-2s/frame-008.png','original62':'references/mobile/frames-2s/frame-032.png','android06-39':'docs/verification/android-folder-fixes-runtime18/39-final-folders-count1.png','android07-04':'docs/verification/android-folder-visual-runtime29/04-stable-folders.png','android07-19':'docs/verification/android-folder-visual-runtime29/19-after-restart.png'}
PRED={'dark100':lambda p:max(p)<100,'dark160':lambda p:max(p)<160,'gold_strict':lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0] and p[0]>1.06*p[1],'gold_loose':lambda p:p[0]>140 and p[1]>95 and p[2]<.80*p[0] and p[0]>1.03*p[1],'search237':lambda p:min(p)>=200 and max(p)<=244 and p[0]<237 and p[1]<237,'search234':lambda p:min(p)>=200 and max(p)<=242 and p[0]<234 and p[1]<234}
KEYS=['title_ink','search_fill','quick_label_ink','quick_icon_gold','memo_label_ink','memo_icon_gold','footer_folder_gold','footer_compose_gold'];MASKS={k:'gold_strict'if'gold'in k else'search237'if k=='search_fill'else'dark160'for k in KEYS}
IMS={};M={};finite={}
def bbox(im,roi,pred):
 pts=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))];return[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]if pts else None
for name,rel in PATHS.items():
 im=Image.open(ROOT/rel).convert('RGB');IMS[name]=im;template=B['measurements'][name if name.startswith('original')else'android'];q={};f={};factor=1 if name.startswith('original')else S
 for k in KEYS:
  roi=template[k]['roi'];boxes={mask:bbox(im,roi,PRED[mask])for mask in template[k]['bbox_by_mask']};q[k]={'roi':roi,'bbox_by_mask':boxes};b=boxes[MASKS[k]]
  f[k]={'mask':MASKS[k],'nativeBbox':b,'widthInReferencePx':(b[2]-b[0])/factor,'heightInReferencePx':(b[3]-b[1])/factor,'leftInReferencePx':b[0]/factor,'centerXInReferencePx':(b[0]+b[2])/2/factor}
 M[name]={'source':rel,'nativeSize':list(im.size),'measurements':q};finite[name]=f
ref=finite['original14'];old=finite['android06-39'];new=finite['android07-19'];metrics={'quickTextLeft':('quick_label_ink','leftInReferencePx'),'titleWidth':('title_ink','widthInReferencePx'),'ordinaryFolderWidth':('memo_icon_gold','widthInReferencePx'),'footerFolderCenterX':('footer_folder_gold','centerXInReferencePx'),'footerFolderWidth':('footer_folder_gold','widthInReferencePx'),'footerComposeCenterX':('footer_compose_gold','centerXInReferencePx')}
deltas={n:{'reference14':ref[k][m],'android06':old[k][m],'android07':new[k][m],'delta06MinusReference':old[k][m]-ref[k][m],'delta07MinusReference':new[k][m]-ref[k][m]}for n,(k,m)in metrics.items()}
regions={'title':[20,190,360,320],'search':[0,330,1080,460],'quickLabel':[175,510,450,585],'quickIcon':[60,505,165,592],'ordinaryLabel':[175,930,450,1005],'ordinaryIcon':[60,925,165,1005],'quickCountChevron':[900,510,1000,590],'ordinaryCountChevron':[900,930,1000,1005],'footerLeft':[20,2020,150,2130],'footerRight':[930,2020,1060,2130]}
def diff(a,b,r):
 pairs=list(zip(a.crop(r).getdata(),b.crop(r).getdata()));return{'roi':r,'changedPixels':sum(x!=y for x,y in pairs),'maxChannelDifference':max(abs(v-w)for x,y in pairs for v,w in zip(x,y))}
changes={k:diff(IMS['android06-39'],IMS['android07-19'],r)for k,r in regions.items()};stable={k:diff(IMS['android07-04'],IMS['android07-19'],r)for k,r in regions.items()}
separators={name:{'x':750,'rangeY':[895,1040],'rgbByY':[[y,*IMS[name].getpixel((750,y))]for y in range(895,1040)]}for name in ['android06-39','android07-19']}
observedSeparators={name:[y for y in range(895,1040)if IMS[name].getpixel((750,y))!=(255,255,255)]for name in ['android06-39','android07-19']}
assert observedSeparators['android06-39']==observedSeparators['android07-19']==[908,1029]
result={'scope':'exact Android07 installed-device saved frames; finite eight common ROI metrics; not full pixel PASS','coordinateRule':'native image pixels, half-open rectangles;1080/224 is width normalization only, never CSS/dp/pt/DPR','ratio':S,'rawMeasurements':M,'finiteMeasures':finite,'metricBeforeAfter':deltas,'stableBboxes04And19':{k:finite['android07-04'][k]['nativeBbox']==new[k]['nativeBbox']for k in KEYS},'nativeRoiChanges06To07':changes,'nativeRoiChanges04To19':stable,'separatorScans':separators,'rowPitch':{'originalReference':25,'observedSeparatorsAtX750':observedSeparators,'androidPitch':observedSeparators['android07-19'][1]-observedSeparators['android07-19'][0],'normalizedPitch':(observedSeparators['android07-19'][1]-observedSeparators['android07-19'][0])/S},'systemExclusions':B['system_exclusions'],'limits':['Original224x480 compressed recording has unknown device/logical viewport/DPR.','Original three quick rows and iCloud directory list differ from local quick row and three ordinary/smart rows; no whole-card or absolute physical-group-y score.','Strict versus loose gold thresholds produce1-2 source-pixel boundary variability; no recovered exact path/font/color claim.','Normalized diagnostic images use labeled width-only uniform scaling and nearest enlargement; raw native PNGs remain evidence.']}
(OUT/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
canvas=Image.new('RGB',(896,515),'#ddd');d=ImageDraw.Draw(canvas)
for n,name in enumerate(['original14','original62','android06-39','android07-19']):
 d.text((n*224+4,5),{'original14':'Original14 native224px','original62':'Original62 native224px','android06-39':'Android06 width-only224','android07-19':'Android07 width-only224'}[name],fill='black');im=IMS[name]
 if name.startswith('android'):im=im.resize((224,round(im.height/S)),Image.Resampling.LANCZOS)
 canvas.paste(im,(n*224,30))
canvas.save(OUT/'overview-width-normalized.png')
im=IMS['android07-19'].copy();d=ImageDraw.Draw(im)
for number,k in enumerate(KEYS,1):
 b=new[k]['nativeBbox'];d.rectangle((b[0],b[1],b[2]-1,b[3]-1),outline='#ee2255',width=3);d.text((b[0],max(0,b[1]-12)),str(number),fill='#ee2255')
im.save(OUT/'android07-native-guide.png')
for label,ro,ra in [('quick',(8,111,216,137),(39,489,1041,610)),('ordinary-folder',(13,246,35,270),(60,925,165,1005)),('footer',(4,434,36,463),(20,2020,150,2130)),('title',(5,50,92,80),(20,190,360,320))]:
 crops=[]
 for name in ['original14','android06-39','android07-19']:
  im=IMS[name].crop(ro if name.startswith('original')else ra)
  if name.startswith('android'):im=im.resize((round(im.width/S),round(im.height/S)),Image.Resampling.LANCZOS)
  crops.append(im)
 w=max(100,*[i.width for i in crops])*4;h=max(i.height for i in crops)*4+24;im=Image.new('RGB',(w,h*3),'#ddd');d=ImageDraw.Draw(im)
 for n,(name,crop)in enumerate(zip(['Original14 native nearest4x','Android06 width-normalized nearest4x','Android07 width-normalized nearest4x'],crops)):
  d.text((3,n*h+3),name,fill='black');im.paste(crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST),(0,n*h+20))
 im.save(OUT/(label+'-diagnostic.png'))
print(json.dumps({'metrics':deltas,'stableBboxes04And19':result['stableBboxes04And19'],'stableRois':stable,'unchangedRois06To07':{k:v for k,v in changes.items()if v['changedPixels']==0}},ensure_ascii=False,indent=2))
