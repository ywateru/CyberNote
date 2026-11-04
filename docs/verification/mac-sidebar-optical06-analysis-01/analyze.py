"""Independent finite JPEG/AX analysis; no GUI, build, source edits, or runtime-directory sealing."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageChops
import json,hashlib,statistics,shutil
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
RUN=ROOT/'docs/verification/mac-sidebar-optical06-runtime-01';OLD=ROOT/'docs/verification/mac-same-columns-runtime05'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
assert shutil.disk_usage(OUT).free>=2*1024**3
opening=json.loads((OUT/'inputs-open.json').read_text())
for row in opening['files']:assert sha(ROOT/row['path'])==row['sha256'] and (ROOT/row['path']).stat().st_size==row['bytes']
prior=ROOT/'docs/verification/mac-sidebar-visible05-analysis-01/analysis.json'
assert sha(prior)=='8598aab166f24cdf52a50e4009de77ee04c8d38e8d918c1d4815700cbfcd4938'
priorRow={'path':str(prior.relative_to(ROOT)),'bytes':prior.stat().st_size,'sha256':sha(prior)}
dump('inputs-append01.json',{'scope':'Read-only sealed05 method/results, for explicit before/after comparison only','files':[priorRow]})
oldAnalysis=json.loads(prior.read_text());corpus=json.loads((ROOT/'docs/verification/mac-body-typography-runtime-01/corpus.json').read_text())['text']
records={};measurements={}
def measure(im,roi,t=160):
 pts=[];rgb=[];yellow=0
 for y in range(roi[1],roi[3]):
  for x in range(roi[0],roi[2]):
   c=im.getpixel((x,y));r,g,b=c
   if r>170 and g>90 and r-b>60 and g-b>20:yellow+=1
   if 299*r+587*g+114*b<t*1000 and max(c)-min(c)<25:pts.append((x,y));rgb.append(c)
 box=None if not pts else [min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
 return {'roi':roi,'threshold':t,'inkPixels':len(pts),'box':box,'center':None if box is None else [(box[0]+box[2])/2,(box[1]+box[3])/2],'medianRGB':None if not rgb else [statistics.median(c[i] for c in rgb) for i in range(3)],'yellowPixels':yellow}
def getBody(text):
 lines=text.splitlines()
 for i,l in enumerate(lines):
  if not l.startswith('The focused') and 'Value: QA-TYPE-' in l and ('text entry area' in l or '文本输入区' in l):
   result=[l.split('Value: ',1)[1]]
   for tail in lines[i+1:]:
    if tail.startswith('\t') or tail.startswith('The focused'):break
    result.append(tail)
   return '\n'.join(result).rstrip('\n')
 return None
for row in opening['files']:
 p=ROOT/row['path'];name=p.stem
 if p.suffix=='.cua-image':
  raw=Image.open(p);im=raw.convert('RGB');records[row['path']]={'kind':'image','format':raw.format,'size':list(raw.size),'mode':raw.mode}
  hidden='hidden' in name;narrow='208' in name or name=='06-original-narrow'
  rois={'toggle':[190,20,265,80]} if hidden else ({'newFolder':[250,20,320,80],'toggle':[340,20,405,80]} if narrow else {'newFolder':[290,20,360,80],'toggle':[380,20,445,80]})
  measurements[name]={a:{str(t):measure(im,roi,t) for t in [120,160,200]} for a,roi in rois.items()}
 elif p.name.endswith('.ax.txt'):
  text=p.read_text();b=getBody(text);assert b==corpus,(p,'finite corpus mismatch')
  records[row['path']]={'kind':'AX','chars':len(text),'bodyEqualsFiniteCorpus':True,'bodyCodepoints':len(b),'bodySha256':hashlib.sha256(b.encode()).hexdigest(),'focus':next((l for l in text.splitlines() if l.startswith('The focused')),''),'splitters':[l.strip() for l in text.splitlines() if 'splitter ' in l or '分离器 ' in l],'sidebarButtons':[l.strip() for l in text.splitlines() if 'button 显示或隐藏文件夹' in l or 'button 新建文件夹' in l or 'Description: 文件夹' in l]}
surface={}
for name in ['03-hidden','15-cold-qa-hidden','18-original-hidden']:
 im=Image.open(RUN/(name+'.cua-image')).convert('RGB');rows=[]
 for y in [48,50,52,54,56]:
  lum=lambda x:sum(im.getpixel((x,y)))/3
  left=max(range(184,205),key=lambda x:lum(x)-lum(x-1));right=min(range(260,282),key=lambda x:lum(x)-lum(x-1))
  rows.append({'y':y,'leftStrongestEdge':left,'rightStrongestEdge':right,'intervalWidth':right-left,'leftLuminanceJump':lum(left)-lum(left-1),'rightLuminanceJump':lum(right)-lum(right-1)})
 surface[name]={'centerRows':rows,'surfaceSample':{'point':[203,50],'RGB':list(im.getpixel((203,50)))},'titlePrefix':measure(im,[300,20,395,65]),'todayLabel':measure(im,[20,110,110,170])}

pairs=[('visible228','02-visible228','17-original-visible228'),('visible208','09-visible208','06-original-narrow'),('restored228','10-visible228-restored','19-original-restored'),('hidden','03-hidden','18-original-hidden'),('coldHidden','15-cold-qa-hidden','18-original-hidden')]
deltas={}
for state,new,ref in pairs:
 deltas[state]={}
 for icon,byThreshold in measurements[new].items():
  deltas[state][icon]={}
  for t,m in byThreshold.items():
   o=measurements[ref][icon][t]
   deltas[state][icon][t]={'clone':m,'original':o,'centerDeltaCloneMinusOriginal':[m['center'][i]-o['center'][i] for i in range(2)],'exactInkBoxEqual':m['box']==o['box'],'medianGrayDelta':m['medianRGB'][0]-o['medianRGB'][0]}
beforeAfter={}
for state,new,old,reference in [('visible228','02-visible228','04-new-visible-focused','17-original-visible228'),('visible208','09-visible208','11-visible-narrow','06-original-narrow'),('hidden','03-hidden','05-top-hide','18-original-hidden')]:
 beforeAfter[state]={}
 for icon in measurements[new]:
  b=oldAnalysis['measurements'][old][icon]['160'];n=measurements[new][icon]['160'];r=measurements[reference][icon]['160']
  beforeAfter[state][icon]={'old05CenterDelta':[b['center'][i]-r['center'][i] for i in range(2)],'new06CenterDelta':[n['center'][i]-r['center'][i] for i in range(2)],'old05Box':b['box'],'new06Box':n['box'],'originalBox':r['box']}

font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',17);small=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',13);cropChecks=[]
def comparison(filename,title,rows,roi):
 rh=roi[3]-roi[1]+42;out=Image.new('RGB',(640,62+rh*len(rows)),'#eeeeee');d=ImageDraw.Draw(out)
 d.text((12,6),title,font=font,fill='black');d.text((12,32),'来源 JPEG，1:1 原图裁剪；无缩放、无平移配准、无像素通过结论',font=small,fill='black')
 for i,(label,p) in enumerate(rows):
  y=62+i*rh;d.text((12,y),label+'  原图范围 '+str(roi),font=small,fill='black');crop=Image.open(p).convert('RGB').crop(roi);out.paste(crop,(12,y+28));cropChecks.append({'output':filename,'source':str(p.relative_to(ROOT)),'sourceRoi':roi,'destinationXY':[12,y+28]})
 out.save(OUT/filename)
comparison('visible228.png','侧栏可见 228 pt：原版与第06包',[('原版 17',RUN/'17-original-visible228.cua-image'),('第06包 02',RUN/'02-visible228.cua-image'),('第06包 10：改窄后恢复228',RUN/'10-visible228-restored.cua-image')],[180,0,480,110])
comparison('visible208.png','侧栏可见 208 pt：原版与第06包',[('原版 05封存06',OLD/'06-original-narrow.cua-image'),('第06包 09',RUN/'09-visible208.cua-image')],[180,0,480,110])
comparison('hidden.png','隐藏侧栏：背景、图标与标题',[('原版 18',RUN/'18-original-hidden.cua-image'),('第06包 03',RUN/'03-hidden.cua-image'),('第06包 15：冷启动后再次隐藏',RUN/'15-cold-qa-hidden.cua-image')],[180,0,600,100])
comparison('restored.png','可见228恢复端点：原版与第06包',[('原版 19：恢复',RUN/'19-original-restored.cua-image'),('第06包 10：恢复228',RUN/'10-visible228-restored.cua-image')],[280,10,450,90])
def compact(filename,title,roi,original,clone):
 w=roi[2]-roi[0];height=roi[3]-roi[1];out=Image.new('RGB',(max(350,2*w+48),height+82),'#eeeeee');d=ImageDraw.Draw(out)
 d.text((12,4),title,font=font,fill='black');d.text((12,29),'JPEG 裁剪 1:1；非像素通过结论',font=small,fill='black')
 for label,p,x in [('原版',original,12),('第06包',clone,w+36)]:
  d.text((x,50),label,font=small,fill='black');out.paste(Image.open(p).convert('RGB').crop(roi),(x,75));cropChecks.append({'output':filename,'source':str(p.relative_to(ROOT)),'sourceRoi':roi,'destinationXY':[x,75]})
 out.save(OUT/filename)
compact('visible228-compact.png','可见侧栏：两枚图标',[290,20,445,80],RUN/'17-original-visible228.cua-image',RUN/'02-visible228.cua-image')
compact('hidden-compact.png','隐藏侧栏：恢复按钮背景',[180,10,285,95],RUN/'18-original-hidden.cua-image',RUN/'03-hidden.cua-image')
for entry in cropChecks:
 im=Image.open(OUT/entry['output']).convert('RGB');p=Image.open(ROOT/entry['source']).convert('RGB').crop(entry['sourceRoi']);x,y=entry['destinationXY'];assert ImageChops.difference(p,im.crop((x,y,x+p.width,y+p.height))).getbbox() is None;entry['decodedPixelsExactlyEqual']=True
assert measurements['02-visible228']==measurements['10-visible228-restored'] or all(measurements['02-visible228'][a][t]['box']==measurements['10-visible228-restored'][a][t]['box'] for a in measurements['02-visible228'] for t in ['120','160','200'])
for name in ['03-hidden','15-cold-qa-hidden']:assert measurements[name]['toggle']['160']['center']==[232.5,52.5]
result={'scope':opening['scope'],'method':'Decoded original JPEG RGB; half-open boxes, local window top-left origin. Neutral 299R+587G+114B < t*1000, channel spread<25, t120/160/200. No scaling/registration/masking. Yellow R>170,G>90,R-B>60,G-B>20.','records':records,'measurements':measurements,'deltas':deltas,'before05After06':beforeAfter,'hiddenSurface':surface,'cropChecks':cropChecks,'identityRecord':json.loads((RUN/'01-identity.json').read_text()),'limits':['Only explicit finite inputs; do not seal dynamic runtime directory.','Images prove sampled endpoints, not unobserved menu/event sequence or object identity.','Original and clone whole canvases differ in dimensions; no whole-window pixel PASS.','No actual Dark/HC reference analyzed.','Selected note/folder/count differs from original data; finite QA body text equality is not full app or persistence identity.']}
dump('analysis.json',result)
for row in opening['files']+[priorRow]:assert sha(ROOT/row['path'])==row['sha256'] and (ROOT/row['path']).stat().st_size==row['bytes']
dump('author-recheck.json',{'kind':'Analysis author self-check, not a second independent external audit','inputFilesUnchanged':21,'fullAXCorpusMatches':sum(x['kind']=='AX' for x in records.values()),'cropPixelIdentityChecks':len(cropChecks),'noWholeWindowPixelPass':True})
print(json.dumps({'inputsUnchanged':21,'AXCorpusMatches':sum(x['kind']=='AX' for x in records.values()),'cropChecks':len(cropChecks),'delta160':{state:{icon:x['160']['centerDeltaCloneMinusOriginal'] for icon,x in icons.items()} for state,icons in deltas.items()},'surface':surface},ensure_ascii=False,indent=2))
