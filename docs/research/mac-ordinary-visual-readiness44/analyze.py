from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
from io import BytesIO
import json,hashlib,statistics,math
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
sourceData=json.loads((R/'docs/research/mac-ordinary-typography36-runtime-analysis/result.json').read_text())['sources']
NAMES=['original31-selected','original31-caret','mac13-selected','mac13-caret']
images={};metadata={};iccSRGB=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
for name in NAMES:
 e=sourceData[name];f=R/e['path'];assert hashlib.sha256(f.read_bytes()).hexdigest()==e['sourceSHA256']
 im=Image.open(f);raw=im.convert('RGB');profile=im.info['icc_profile']
 srgb=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(profile)),iccSRGB,outputMode='RGB')
 crop=(688,453,1488,867) if im.size==(2176,1320) else (0,0,800,414)
 images[name]={'raw':raw.crop(crop),'srgb':srgb.crop(crop)}
 metadata[name]={'path':e['path'],'sha256':e['sourceSHA256'],'format':im.format,'size':im.size,'crop':crop,'iccSHA256':hashlib.sha256(profile).hexdigest(),'jpegComponents':im.layer}
 for space,out in images[name].items():out.save(O/(name+'-'+space+'.png'),icc_profile=iccSRGB.tobytes() if space=='srgb' else None)
def points(roi):return [(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])]
def med(im,pts):return [statistics.median(im.getpixel(p)[c] for p in pts)for c in range(3)]
def quantile(v,q):v=sorted(v);return v[round((len(v)-1)*q)]
ROIS={'name':(135,115,268,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}
summary={};glyphs={};core={};mix={};colors={};reproduced={}
for state in ['selected','caret']:
 a=images['original31-'+state]['raw'];b=images['mac13-'+state]['raw']
 summary[state]={}
 for name,roi in ROIS.items():
  ps=points(roi);stats={}
  for t in [100,160,200]:
   ma={p for p in ps if max(a.getpixel(p))<t};mb={p for p in ps if max(b.getpixel(p))<t}
   stats[str(t)]={'original':len(ma),'mac13':len(mb),'xor':len(ma^mb),'onlyOriginal':len(ma-mb),'onlyMac13':len(mb-ma)}
  summary[state][name]=stats
 # Fixed 26px glyph cells; no resizing, shifting, or fitted glyph alignment.
 glyphs[state]=[]
 for char,left,right in zip('新建文件夹',[141,167,193,219,245],[167,193,219,245,268]):
  ps=points((left,120,right,153));masks=[];item={'char':char,'cell':[left,120,right,153]}
  for key,im in [('original',a),('mac13',b)]:
   mask=[p for p in ps if max(im.getpixel(p))<160];masks.append(set(mask))
   item[key]={'count160':len(mask),'bbox160':[min(x for x,y in mask),min(y for x,y in mask),max(x for x,y in mask)+1,max(y for x,y in mask)+1],'binaryCentroid160':[statistics.mean(p[i] for p in mask)for i in range(2)]}
  item['xor160']=len(masks[0]^masks[1]);item['centroidDelta']=[item['mac13']['binaryCentroid160'][i]-item['original']['binaryCentroid160'][i]for i in range(2)]
  glyphs[state].append(item)
# Fixed common dark core: same positions in all four images, max rawRGB below80.
corePts=[p for p in points((141,125,268,149))if all(max(images[n]['raw'].getpixel(p))<80 for n in NAMES)]
for n in NAMES:
 core[n]={'commonCorePixels':len(corePts),'rawMedian':med(images[n]['raw'],corePts),'srgbMedian':med(images[n]['srgb'],corePts)}
 # No-glyph selection plateau, independent of text cores and caret.
 colors[n]={space:{'median':med(im,points((145,120,265,124))),'min':[min(v[c]for v in im.crop((145,120,265,124)).getdata())for c in range(3)],'max':[max(v[c]for v in im.crop((145,120,265,124)).getdata())for c in range(3)]}for space,im in images[n].items()}
# Pixel-only mixing diagnostic: within each host estimate selected foreground using natural alpha.
# Alpha derives from natural text with fixed foreground32 and white255. No spatial fit.
for host in ['original31','mac13']:
 mix[host]={}
 for space in ['raw','srgb']:
  selected=images[host+'-selected'][space];natural=images[host+'-caret'][space];bg=colors[host+'-selected'][space]['median']
  ps=[p for p in points((141,125,268,149)) if max(natural.getpixel(p))<200]
  channels=[]
  for c in range(3):
   samples=[(max(0,min(1,(255-natural.getpixel(p)[c])/(255-32))),selected.getpixel(p)[c])for p in ps]
   fitted=sum(alpha*(value-(1-alpha)*bg[c])for alpha,value in samples)/sum(alpha*alpha for alpha,value in samples)
   def err(fg):return sum(abs(value-((1-alpha)*bg[c]+alpha*fg))for alpha,value in samples)/len(samples)
   channels.append({'foregroundFit':fitted,'MAEForeground0':err(0),'MAEForeground32':err(32),'MAEFitted':err(fitted)})
  mix[host][space]={'method':'Per-channel selected=(1-alpha)*selectionPlateau+alpha*foreground; alpha=(255-natural)/223 clamped; fixed pixels/no glyph alignment; diagnostic only','samplePixels':len(ps),'channels':channels}
# Uniform scalar foreground curve diagnostic on natural image: no translation or font parameter fitting.
# Single common white-to-ink scaling, fit clone intensity from original, then preserve residual.
naturalCurve={}
for space in ['raw','srgb']:
 a=images['original31-caret'][space];b=images['mac13-caret'][space]
 ps=[p for p in points((141,125,268,149))if max(a.getpixel(p))<200 or max(b.getpixel(p))<200]
 channels=[]
 for c in range(3):
  vals=[(255-a.getpixel(p)[c],255-b.getpixel(p)[c])for p in ps];slope=sum(x*y for x,y in vals)/sum(x*x for x,y in vals)
  before=sum(abs(x-y)for x,y in vals)/len(vals);after=sum(abs(slope*x-y)for x,y in vals)/len(vals)
  channels.append({'darknessScaleFit':slope,'maeBefore':before,'maeAfter':after,'residualFraction':after/before})
 naturalCurve[space]={'samplePixels':len(ps),'channels':channels,'meaning':'Diagnostic cannot identify weight/raster/font. High residual rejects a uniform ink-density explanation on this sample.'}
prior=json.loads((R/'docs/research/mac-ordinary-typography36-runtime-analysis/result.json').read_text())
reproduced['selectedMask201']=summary['selected']['name']['160']['xor']==201
reproduced['naturalMask192']=summary['caret']['name']['160']['xor']==192
reproduced['selectionOriginalSrgb']=colors['original31-selected']['srgb']['median']==[252,234,193]
reproduced['selectionMac13Srgb']=colors['mac13-selected']['srgb']['median']==[250,232,200]
assert all(reproduced.values()),reproduced
result={'scope':'One finite saved-image diagnostic only; no WK run/product change/full pixel acceptance','sources':metadata,'reproduced':reproduced,'fixedRois':ROIS,'thresholdCounts':summary,'fixedGlyphCells':glyphs,'commonDarkCore':core,'selectionPlateau':colors,'selectedNaturalMixingDiagnostic':mix,'naturalUniformDensityDiagnostic':naturalCurve,'limits':['JPEG4:2:0, ICC, text AA and native/WK host remain inseparable in saved images.','Foreground fit is an approximate pixel-only mixing model, not native foreground or font identity proof.','No translated/scaled/repaired glyphs, no CSS parameter matrix or extra WK render.','Five26px character cells are fixed analysis windows, not measured glyph advances or font metrics.','No evidence here identifies exact native font weight/family or authorizes changing them.']}
(O/'image-analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
# Native fixed crops plus explicitly nearest-neighbor3x diagnostic: no image used for numeric measurement.
canvas=Image.new('RGB',(900,4*180),'#ddd');d=ImageDraw.Draw(canvas)
for i,n in enumerate(NAMES):
 y=i*180;d.text((8,y+4),n+' | fixed name crop, nearest3x',fill='black');crop=images[n]['srgb'].crop((135,115,280,158));canvas.paste(crop.resize((435,129),Image.Resampling.NEAREST),(8,y+28));d.text((470,y+28),'Common dark-core RGB: '+str(core[n]['srgbMedian']),fill='black');d.text((470,y+52),'Selection strip RGB: '+str(colors[n]['srgb']['median']),fill='black')
canvas.save(O/'name-core-comparison-nearest3x-srgb.png',icc_profile=iccSRGB.tobytes())
print(json.dumps({'reproduced':reproduced,'core':core,'mix':mix,'naturalCurve':naturalCurve,'glyphCentroidDeltas':{k:[e['centroidDelta']for e in v]for k,v in glyphs.items()}},ensure_ascii=False,indent=2))
