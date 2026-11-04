from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
import json,statistics,hashlib
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
P=json.loads((OUT/'preparation.json').read_text());NAMES=list(P['sources']);RAW={n:Image.open(OUT/(n+'-raw.png')).convert('RGB')for n in NAMES};SRGB={n:Image.open(OUT/(n+'-srgb.png')).convert('RGB')for n in NAMES}
INK={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)};CARET=(268,115,280,158);THRESHOLDS=[100,160,200]
def inside(p,r):return r[0]<=p[0]<r[2]and r[1]<=p[1]<r[3]
def pts(r,exclude=None):return[(x,y)for y in range(r[1],r[3])for x in range(r[0],r[2])if not(exclude and inside((x,y),exclude))]
def coverage(im,points,t):
 found=[p for p in points if max(im.getpixel(p))<t]
 return{'pixels':len(found),'bbox':[min(x for x,y in found),min(y for x,y in found),max(x for x,y in found)+1,max(y for x,y in found)+1]if found else None}
def median(im,r):return[statistics.median(p[c]for p in im.crop(r).getdata())for c in range(3)]
def mae(a,b,points):return sum(abs(x-y)for p in points for x,y in zip(a.getpixel(p),b.getpixel(p)))/(len(points)*3)if points else None
records={}
for name in NAMES:
 natural='caret'in name;ref='original31-caret'if natural else'original31-selected';record={'pairedOriginal':ref,'ink':{},'errors':{}}
 for key,roi in INK.items():
  points=pts(roi);sample=pts(roi,CARET if natural and key=='name'else None)
  record['ink'][key]={space:{str(t):coverage(im,points,t)for t in THRESHOLDS}for space,im in [('raw',RAW[name]),('srgb',SRGB[name])]}
  union=[p for p in sample if max(RAW[name].getpixel(p))<200 or max(RAW[ref].getpixel(p))<200]
  record['errors'][key]={'roi':roi,'commonCaretExcluded':CARET if natural and key=='name'else None,'samplePixels':len(sample),'wholeRoiMAESrgb':mae(SRGB[name],SRGB[ref],sample),'glyphUnionPixelsRaw200':len(union),'glyphUnionMAESrgb':mae(SRGB[name],SRGB[ref],union),'rawMaskDisagreement':{str(t):sum((max(RAW[name].getpixel(p))<t)!=(max(RAW[ref].getpixel(p))<t)for p in sample)for t in THRESHOLDS},'rawCoverageOnCommonSample':{str(t):coverage(RAW[name],sample,t)for t in THRESHOLDS}}
 record['selectionBackground']={'roi':[145,120,265,124],'samplePixels':480,'rawMedian':median(RAW[name],(145,120,265,124)),'srgbMedian':median(SRGB[name],(145,120,265,124)),'state':'not selection; natural white background'if natural else'full-selected no-glyph strip'}
 record['coreRing']={'roi':[300,107,340,111],'rawMedian':median(RAW[name],(300,107,340,111)),'srgbMedian':median(SRGB[name],(300,107,340,111))}
 records[name]=record
comparisons={}
for a,b in [('original31-selected','original29-selected'),('mac13-initial','mac13-selected'),('mac12-selected','mac13-initial')]:
 comparisons[a+' vs '+b]={k:{'rawChangedPixels':sum(RAW[a].getpixel(p)!=RAW[b].getpixel(p)for p in pts(roi)),'srgbChangedPixels':sum(SRGB[a].getpixel(p)!=SRGB[b].getpixel(p)for p in pts(roi))}for k,roi in INK.items()}
prior=json.loads((ROOT/'docs/research/mac-name-focus-runtime29-analysis/measurements.json').read_text());priorChecks={}
for name,old in [('original29-selected','original-all'),('mac12-selected','mac12-all')]:
 priorChecks[name]=all(records[name]['ink'][k]['raw']==prior['measurements'][old]['inkRaw'][k]for k in INK)
assert all(priorChecks.values()),priorChecks
summary={}
for n in ['mac12-selected','mac13-initial','mac13-selected','mac13-caret']:
 ref=records[n]['pairedOriginal'];summary[n]={}
 for k in INK:
  orig=records[ref]['ink'][k]['raw']['160']['pixels'];now=records[n]['ink'][k]['raw']['160']['pixels'];summary[n][k]={'originalRaw160Pixels':orig,'capturedRaw160Pixels':now,'differencePercent':100*(now-orig)/orig,'capturedBBoxRaw160':records[n]['ink'][k]['raw']['160']['bbox'],'wholeRoiMAESrgb':records[n]['errors'][k]['wholeRoiMAESrgb'],'glyphUnionMAESrgb':records[n]['errors'][k]['glyphUnionMAESrgb']}
result={'status':'Finite actual saved-image analysis complete; no product/interaction/full-pixel PASS','scope':'Ordinary Mac13 typography runtime36 endpoints05/11/12 only, compared to original31 and exact baseline runtime29','sources':P['sources'],'coordinates':'Native800x414; half-open fixed prior26/29/31 ROIs; bright threshold crop only; no resizing/alignment/glyph fitting','inkRois':INK,'commonNaturalNameCaretExclusion':CARET,'thresholdsRawAndSrgb':THRESHOLDS,'colorHandling':'Seven source JPEGs independently ICC converted using their embedded Display profile to sRGB; raw retained separately; no screenshot repair','measurements':records,'raw160Summary':summary,'pixelComparisons':comparisons,'reproducedPrior29RawMeasurements':priorChecks,'limits':['Full selected and natural endpoints are paired separately; caret is common-excluded from name error metrics.','03original29 and01original31 glyph regions are duplicate samples, not independent observations.','Pointer halo around x450 kept outside all three text ROIs and fixed color strips; no08-10 misclick state used.','JPEG4:2:0/ICC/AA/host differences remain; threshold counts do not identify font family/weight or native parameters.','No GUI/runtime/new rendering/build/product changes, no original/current Tab equality claim; runtime36 17/18/19 focus discrepancy remains separate.','No whole-window or cross-platform pixel acceptance; frozen screenshot identity only, not fresh package/PID proof.']}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'raw160Summary':summary,'pixelComparisons':comparisons,'prior29Reproduced':priorChecks},ensure_ascii=False,indent=2))
# Correct first preparation montage overlap without overwriting the original attempt.
old=OUT/'glyphs-nearest2x-srgb.png'
if old.exists():old.rename(OUT/'glyphs-overlap-attempt01-nearest2x-srgb.png')
canvas=Image.new('RGB',(950,145*len(NAMES)),'#ddd');d=ImageDraw.Draw(canvas)
for i,name in enumerate(NAMES):
 y=i*145;d.text((5,y+5),name+' | nearest2x | left=name-label+name, right=smart-label',fill='black');canvas.paste(SRGB[name].crop((35,115,280,158)).resize((490,86),Image.Resampling.NEAREST),(0,y+28));canvas.paste(SRGB[name].crop((75,190,280,230)).resize((410,80),Image.Resampling.NEAREST),(520,y+28))
canvas.save(OUT/'glyphs-nearest2x-srgb.png',icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
