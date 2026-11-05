from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
import json,statistics
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent;REF=R/'docs/research/mac-ordinary-visual-readiness44'
NAMES=['baseline-all','candidate-all','baseline-partial','candidate-partial','baseline-natural','candidate-natural']
ims={};qa=[];profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
for n in NAMES:
 im=Image.open(O/(n+'.png'));im.load();assert im.size==(2176,1320) and im.info.get('srgb')==0
 ims[n]=im.convert('RGB').crop((688,453,1488,867));ims[n].save(O/(n+'-form-srgb.png'),icc_profile=profile)
 qa.append({'name':n,'sourcePixels':im.size,'sRGBChunk':0,'crop':[688,453,1488,867],'resize':False})
refs={}
for state,key in [('all','selected'),('natural','caret')]:
 refs[state]={space:Image.open(REF/('original31-'+key+'-'+space+'.png')).convert('RGB')for space in ['raw','srgb']}
ROIS={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}
def pts(roi,exclude=False):return[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if not(exclude and 268<=x<280)]
def med(im,roi):return[statistics.median(v[c]for v in im.crop(roi).getdata())for c in range(3)]
def coverage(im,ps,t):
 m={p for p in ps if max(im.getpixel(p))<t};return{'pixels':len(m),'bbox':[min(p[0]for p in m),min(p[1]for p in m),max(p[0]for p in m)+1,max(p[1]for p in m)+1]if m else None}
def error(a,b,ps):return sum(abs(x-y)for p in ps for x,y in zip(a.getpixel(p),b.getpixel(p)))/(len(ps)*3)
measurements={}
for n,im in ims.items():
 state='natural'if n.endswith('natural')else'all';record={'state':'partial selection, no original-partial pixel reference used'if n.endswith('partial')else state,'ink':{},'errorsVsFullOrNaturalReference':{}}
 for k,roi in ROIS.items():
  ps=pts(roi,n.endswith('natural')and k=='name');record['ink'][k]={str(t):coverage(im,ps,t)for t in [100,160,200]}
  if n.endswith('partial'):continue
  record['errorsVsFullOrNaturalReference'][k]={}
  for space,ref in refs[state].items():
   union=[p for p in ps if max(im.getpixel(p))<200 or max(ref.getpixel(p))<200]
   record['errorsVsFullOrNaturalReference'][k][space]={'roi':roi,'caretExcluded':n.endswith('natural')and k=='name','fullMAE':error(im,ref,ps),'glyphUnionMAE':error(im,ref,union),'maskXor':{str(t):sum((max(im.getpixel(p))<t)!=(max(ref.getpixel(p))<t)for p in ps)for t in [100,160,200]}}
 record['selectionStrip']={'roi':(222,120,265,124)if n.endswith('partial')else(145,120,265,124),'median':med(im,(222,120,265,124)if n.endswith('partial')else(145,120,265,124)),'meaning':'natural background, no selection'if n.endswith('natural')else'declaration-mapped selection, inactive WK'}
 measurements[n]=record
# Reuse the exact fixed720 common-core coordinates from44; no new core position fitting.
old={n:Image.open(REF/(n+'-raw.png')).convert('RGB')for n in ['original31-selected','original31-caret','mac13-selected','mac13-caret']}
corePts=[p for p in pts((141,125,268,149))if all(max(im.getpixel(p))<80 for im in old.values())];assert len(corePts)==720
cores={n:[statistics.median(im.getpixel(p)[c]for p in corePts)for c in range(3)]for n,im in ims.items()if not n.endswith('partial')};cores['original-all']=[statistics.median(refs['all']['srgb'].getpixel(p)[c]for p in corePts)for c in range(3)]
comparisons={}
for state in ['all','partial','natural']:
 a,b=ims['baseline-'+state],ims['candidate-'+state];changed=[p for p in pts((0,0,800,414))if a.getpixel(p)!=b.getpixel(p)]
 comparisons[state]={'formChangedPixels':len(changed),'bbox':[min(x for x,y in changed),min(y for x,y in changed),max(x for x,y in changed)+1,max(y for x,y in changed)+1]if changed else None,'outsideNameRoiChanged':sum(not(135<=x<280 and 115<=y<158)for x,y in changed),'threeRoiChanged':{k:sum(a.getpixel(p)!=b.getpixel(p)for p in pts(roi))for k,roi in ROIS.items()},'selectionStripChanged':sum(a.getpixel(p)!=b.getpixel(p)for p in pts((222,120,265,124)if state=='partial'else(145,120,265,124)))}
result={'scope':'One candidate CSS ink change in same production React/full CSS; all/partial selection paint explicitly focus-declaration mapping, not active package','colorHandling':'WK PNG declares sRGB chunk0; original fixed44 JPEG derivatives independently ICC-converted sRGB; original raw threshold masks retained separately as prior31 convention','fixedRois':ROIS,'qa':qa,'measurements':measurements,'core720SrgbMedians':cores,'baselineCandidatePixelComparisons':comparisons,'open':['No original-partial comparison; actual active host capture still required','natural residual, selection background and full pixel acceptance remain open','No glyph alignment/resizing or new rendering in this measurement']}
(O/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
canvas=Image.new('RGB',(950,5*145),'#ddd');draw=ImageDraw.Draw(canvas)
rows=[('original31-selected',refs['all']['srgb']),('baseline-all mapped',ims['baseline-all']),('candidate-all mapped',ims['candidate-all']),('baseline-partial mapped',ims['baseline-partial']),('candidate-partial mapped',ims['candidate-partial'])]
for i,(name,im)in enumerate(rows):
 y=i*145;draw.text((5,y+4),name+' | nearest2x for view only',fill='black');canvas.paste(im.crop((35,115,280,158)).resize((490,86),Image.Resampling.NEAREST),(0,y+28));canvas.paste(im.crop((75,190,280,230)).resize((410,80),Image.Resampling.NEAREST),(520,y+28))
canvas.save(O/'selected-comparison-nearest2x-srgb.png',icc_profile=profile)
for n in ['baseline-all','candidate-all','baseline-natural','candidate-natural']:
 print(n,json.dumps({'ink160':measurements[n]['ink']['name']['160'],'nameError':measurements[n]['errorsVsFullOrNaturalReference']['name'],'selectionStrip':measurements[n]['selectionStrip'],'core':cores[n]},ensure_ascii=False))
print(json.dumps({'core':cores,'comparisons':comparisons},ensure_ascii=False))
