from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
from io import BytesIO
from collections import deque
import json,hashlib,statistics,re
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
sources={host:('docs/research/mac-clean-selection-runtime48',{state:host+'-'+state for state in ['all','partial','natural']}) for host in ['original','mac13','mac14']}
raw={};srgb={};metadata={};outputProfile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
# Bright four-connected modal component; fixed search/seed, no glyph position fitting.
def component(im,threshold,search,seed):
 box=im.crop(search);w,h=box.size;pix=list(box.getdata());allowed=bytearray(min(v)>=threshold for v in pix);sx=seed[0]-search[0];sy=seed[1]-search[1];start=sy*w+sx
 if not allowed[start]:raise ValueError('Modal seed not bright at '+str(threshold))
 q=deque([start]);allowed[start]=0;minx=maxx=sx;miny=maxy=sy;count=0
 while q:
  z=q.popleft();y,x=divmod(z,w);count+=1;minx=min(minx,x);maxx=max(maxx,x);miny=min(miny,y);maxy=max(maxy,y)
  for nxt in ((z-1 if x else -1),(z+1 if x+1<w else -1),(z-w if y else -1),(z+w if y+1<h else -1)):
   if nxt>=0 and allowed[nxt]:allowed[nxt]=0;q.append(nxt)
 return {'bbox':[search[0]+minx,search[1]+miny,search[0]+maxx+1,search[1]+maxy+1],'componentPixels':count}
for host,(dirname,states)in sources.items():
 for state,stem in states.items():
  n=host+'-'+state;path=R/dirname/(stem+'.cua-image');axPath=R/dirname/(stem+'.ax.txt');im=Image.open(path);im.load();profile=im.info['icc_profile'];decoded=im.convert('RGB')
  if im.size==(2176,1320):search=(650,400,1520,900);seed=(1088,720)
  elif im.size==(800,414):search=(0,0,800,414);seed=(400,207)
  else:raise ValueError('Unexpected source size '+str(im.size))
  geometry={str(t):component(decoded,t,search,seed)for t in [190,195,200]};bboxes=[d['bbox']for d in geometry.values()];assert all(b==bboxes[0]for b in bboxes),geometry
  crop=tuple(bboxes[0]);assert crop[2]-crop[0]==800 and crop[3]-crop[1]==414
  raw[n]=decoded.crop(crop);srgb[n]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(profile)),outputProfile,outputMode='RGB').crop(crop)
  srgb[n].save(O/(n+'-form-srgb.png'),icc_profile=outputProfile.tobytes())
  ax=axPath.read_text();match=re.search(r'Selected text: ```\n(.*?)\n```',ax,re.S);selected=match.group(1)if match else None
  if state=='all':assert selected=='新建文件夹',n
  elif state=='partial':assert selected=='建文',n
  else:assert selected is None and ('focused UI element' in ax),n
  metadata[n]={'path':str(path.relative_to(R)),'sourceSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourcePixels':im.size,'format':im.format,'jpegComponents':im.layer,'iccBytes':len(profile),'iccSHA256':hashlib.sha256(profile).hexdigest(),'search':search,'seed':seed,'geometryByThreshold':geometry,'crop':crop,'cropPixels':raw[n].size,'axPath':str(axPath.relative_to(R)),'selectedText':selected,'requestedUTF16Selection':[0,5]if state=='all'else[1,3]if state=='partial'else[5,5]}
ROIS={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}
def pts(r,caret=False):return[(x,y)for y in range(r[1],r[3])for x in range(r[0],r[2])if not(caret and 268<=x<280)]
def coverage(im,ps,t):
 m=[p for p in ps if max(im.getpixel(p))<t];return{'pixels':len(m),'bbox':[min(x for x,y in m),min(y for x,y in m),max(x for x,y in m)+1,max(y for x,y in m)+1]if m else None}
def median(im,ps):return[statistics.median(im.getpixel(p)[c]for p in ps)for c in range(3)]
def mae(a,b,ps):return sum(abs(x-y)for p in ps for x,y in zip(a.getpixel(p),b.getpixel(p)))/(len(ps)*3)
# Exact same positions in all9 endpoints; fixed dark-core criterion, no per-image pixel selection.
core=[p for p in pts((141,125,268,149))if all(max(im.getpixel(p))<80 for im in raw.values())];partialCore=[p for p in core if 167<=p[0]<219]
measurements={};commonUnions={}
for state in ['all','partial','natural']:
 commonUnions[state]={}
 for key,roi in ROIS.items():
  sample=pts(roi,state=='natural'and key=='name');commonUnions[state][key]=[p for p in sample if any(max(raw[h+'-'+state].getpixel(p))<200 for h in sources)]
 for host in sources:
  n=host+'-'+state;ref='original-'+state;record={'ink':{},'errors':{},'core':{'commonNineEndpointPixels':len(core),'rawMedian':median(raw[n],core),'srgbMedian':median(srgb[n],core),'partialSelectedCorePixels':len(partialCore),'partialSelectedCoreSrgbMedian':median(srgb[n],partialCore)}}
  for key,roi in ROIS.items():
   sample=pts(roi,state=='natural'and key=='name');record['ink'][key]={space:{str(t):coverage(im,sample,t)for t in [100,160,200]}for space,im in [('raw',raw[n]),('srgb',srgb[n])]}
   record['errors'][key]={'roi':roi,'samplePixels':len(sample),'naturalCommonCaretExclusion':[268,115,280,158]if state=='natural'and key=='name'else None,'fullRoiMAESrgb':mae(srgb[n],srgb[ref],sample),'commonThreeHostUnion200Pixels':len(commonUnions[state][key]),'commonThreeHostUnionMAESrgb':mae(srgb[n],srgb[ref],commonUnions[state][key]),'maskXor':{space:{str(t):sum((max(images[n].getpixel(p))<t)!=(max(images[ref].getpixel(p))<t)for p in sample)for t in [100,160,200]}for space,images in [('raw',raw),('srgb',srgb)]}}
  strip=(172,120,215,124)if state=='partial'else(145,120,265,124)
  record['backgroundStrip']={'roi':strip,'pixels':len(pts(strip)),'rawMedian':median(raw[n],pts(strip)),'srgbMedian':median(srgb[n],pts(strip)),'meaning':'natural background, not selection'if state=='natural'else'active saved selection no-glyph strip'}
  record['ringStrip']={'roi':[300,107,340,111],'rawMedian':median(raw[n],pts((300,107,340,111))),'srgbMedian':median(srgb[n],pts((300,107,340,111)))}
  measurements[n]=record
comparisons={}
for state in ['all','partial','natural']:
 a,b='mac13-'+state,'mac14-'+state;comparisons[state]={}
 for key,roi in ROIS.items():
  ps=pts(roi,state=='natural'and key=='name');comparisons[state][key]={'rawChangedPixels':sum(raw[a].getpixel(p)!=raw[b].getpixel(p)for p in ps),'srgbChangedPixels':sum(srgb[a].getpixel(p)!=srgb[b].getpixel(p)for p in ps),'rawMAE':mae(raw[a],raw[b],ps),'srgbMAE':mae(srgb[a],srgb[b],ps)}
comparisons['natural']['fullFormRawChangedPixels']=sum(a!=b for a,b in zip(raw['mac13-natural'].getdata(),raw['mac14-natural'].getdata()))
# Selected/unselected partial spans are fixed cells, not fitted glyph advances.
partialSpans={}
for host in sources:
 n=host+'-partial';partialSpans[host]={}
 for label,roi in [('selectedJianWen',(167,115,219,158)),('unselectedXin',(135,115,167,158)),('unselectedJiaJia',(219,115,268,158))]:
  sample=pts(roi);ref='original-partial';partialSpans[host][label]={'roi':roi,'coreMedianSrgb':median(srgb[n],[p for p in core if roi[0]<=p[0]<roi[2]]),'fullRoiMAESrgb':mae(srgb[n],srgb[ref],sample),'rawMaskXor160':sum((max(raw[n].getpixel(p))<160)!=(max(raw[ref].getpixel(p))<160)for p in sample)}
result={'status':'Finite clean saved48 image analysis complete; pending independent visual qualification; no full pixel PASS','scope':'Fresh sealed48 original/Mac13/Mac14 genuine all/建文[1,3]/end-caret endpoints only;47 contamination history unchanged','identity':{'mac14Source':'d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46','mac14ExeSHA256':'c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f','mac14SavedPID':81752,'mac13Source':'182464bcc3055caadcd78fe4c7ce1a0ec31eea6a','mac13SavedPID':81681,'method':'Saved sealed process/index records only; no live process/package re-verification by this analysis'},'sources':metadata,'coordinates':'Native800x414, three independent bright-component thresholds, integer modal crop only; no glyph shift/alignment/resizing/fit','ROIs':ROIS,'coreDefinition':'Same positions in all9 raw endpoints maxRGB<80 inside[141,125,268,149); partialselected subset x[167,219)','colorHandling':'Each of9 JPEGs independently embedded Display ICC -> sRGB; raw separately retained in numeric tables; derived PNG includes sRGB profile','measurements':measurements,'mac13vsMac14':comparisons,'partialSpans':partialSpans,'limits':['JPEG4:2:0, ICC and AA/host artifacts retained; no zero-difference or internal font/color parameter claim','Original sources already800x414 modal crops; external original framing cannot be reconstructed','Natural error sample excludes common x[268,280)caret region; full unexcluded raw counts not used to hide caret','Fixed cells and core sets are image diagnostics, not measured glyph metrics','Only local actual screenshot appearance is assessed; no keyboard/IME/all-platform/fullwindow PASS','47 pointer/halo-contaminated observations remain sealed and unchanged;48 is independently measured, not substituted into47']}
(O/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
# Native full-form montage: original,13,14 columns; all,partial,natural rows.
canvas=Image.new('RGB',(2400,3*440),'#ddd');draw=ImageDraw.Draw(canvas)
for i,state in enumerate(['all','partial','natural']):
 for j,host in enumerate(sources):
  n=host+'-'+state;draw.text((j*800+8,i*440+5),n+' | native800x414 | '+('JianWen[1,3]'if state=='partial'else state),fill='black');canvas.paste(srgb[n],(j*800,i*440+24))
canvas.save(O/'three-host-three-state-native-srgb.png',icc_profile=outputProfile.tobytes())
canvas=Image.new('RGB',(950,9*130),'#ddd');draw=ImageDraw.Draw(canvas)
for i,(n,im)in enumerate(srgb.items()):
 y=i*130;draw.text((5,y+3),n+' | nearest2x view only',fill='black');canvas.paste(im.crop((35,115,280,158)).resize((490,86),Image.Resampling.NEAREST),(0,y+25));canvas.paste(im.crop((75,190,280,230)).resize((410,80),Image.Resampling.NEAREST),(520,y+25))
canvas.save(O/'glyphs-nearest2x-srgb.png',icc_profile=outputProfile.tobytes())
print(json.dumps({'geometry':{n:m['crop']for n,m in metadata.items()},'commonCore':len(core),'partialCore':len(partialCore),'summary':{n:{'core':v['core']['srgbMedian'],'partialCore':v['core']['partialSelectedCoreSrgbMedian'],'raw160':v['ink']['name']['raw']['160'],'mae':v['errors']['name']['fullRoiMAESrgb'],'maskRaw':v['errors']['name']['maskXor']['raw'],'maskSrgb':v['errors']['name']['maskXor']['srgb'],'bg':v['backgroundStrip']['srgbMedian']}for n,v in measurements.items()},'mac13vs14':comparisons,'partialSpans':partialSpans},ensure_ascii=False,indent=2))
