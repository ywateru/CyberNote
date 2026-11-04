from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageChops
import json,hashlib,statistics,re
r=Path.cwd();src=r/'docs/verification/mac-list-heading07-runtime-01';old=r/'docs/verification/mac-sidebar-optical06-runtime-01';out=Path(__file__).resolve().parent
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ident(p):return dict(path=str(p.relative_to(r)),bytes=p.stat().st_size,sha256=H(p))
def dump(n,d):
 p=out/n;assert not p.exists();p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
inputs=list(sorted(p for p in src.iterdir() if p.is_file()))
for stem in ['02-visible228','03-hidden','09-visible208']:
 for suffix in ['.cua-image','.ax.txt']:inputs.append(old/(stem+suffix))
inputs+=[r/'docs/verification/mac-sidebar-optical06-analysis-01/analysis.json',r/'docs/research/mac-list-heading-readiness07/measurements.json']
rows=[ident(p) for p in sorted(set(inputs))];dump('inputs-open.json',dict(scope='All stopped runtime07 files plus finite optical06 image/AX and measured baseline records',files=rows))
formats=[];ims={}
for p in sorted(src.glob('*.cua-image')):
 im=Image.open(p);im.load();formats.append(dict(path=p.name,format=im.format,mode=im.mode,size=list(im.size),identity=ident(p)));assert im.format=='JPEG' and im.mode=='RGB';ims[p.stem]=im.convert('RGB')
def ink(im,roi,t):
 pts=[];cs=[]
 for y in range(roi[1],roi[3]):
  for x in range(roi[0],roi[2]):
   c=im.getpixel((x,y))
   if 299*c[0]+587*c[1]+114*c[2]<t*1000 and max(c)-min(c)<25:pts.append((x,y));cs.append(c)
 if not pts:return dict(roi=list(roi),threshold=t,bbox=None,inkPixels=0)
 b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
 return dict(roi=list(roi),threshold=t,bbox=b,width=b[2]-b[0],height=b[3]-b[1],center=[(b[0]+b[2])/2,(b[1]+b[3])/2],inkPixels=len(pts),medianRGB=[statistics.median(c[i] for c in cs) for i in range(3)])
# Literal finite states; no guessing label positions from file-name alone.
selected={'01-original-visible':456,'02-original-hidden':0,'03-original-restored':456,'09-mac07-visible-active':456,'11-mac07-hidden-stable':0,'12-mac07-direct-restored':456,'16-mac07-menu-restored':456,'19-mac07-sidebar208':416,'20-mac07-sidebar228-restored':456,'24-mac07-cold-visible-zoom':456,'29-mac07-cold-menu-restored':456}
records={}
for stem,left in selected.items():
 im=ims[stem];hidden=left==0;tx=300 if hidden else left+25
 rois={'title':(tx,15,tx+320,55),'count':(tx,55,tx+200,90),'today':(left+20,110,left+110,170)}
 if hidden:rois['toggle']=(200,25,265,80)
 else:rois.update(newFolder=(left-170,25,left-90,80),toggle=(left-80,25,left-10,80))
 text={k:{str(t):ink(im,v,t) for t in [120,160,200]} for k,v in rois.items()}
 samples=[dict(y=y,median=statistics.median(sum(im.getpixel((x,y)))/3 for x in range(left+20,left+300))) for y in range(170,195)];dark=min(x['median'] for x in samples)
 records[stem]=dict(localListLeft=left,measurements=text,divider=dict(rows=[x['y'] for x in samples if x['median']==dark],minimumMedian=dark,samples=samples))
# Previous06 remeasurement under same ROI rules; whole windows differ, these local pixel scales do not.
oldRecords={}
for stem,left in [('02-visible228',456),('03-hidden',0),('09-visible208',416)]:
 im=Image.open(old/(stem+'.cua-image')).convert('RGB');tx=300 if left==0 else left+25
 rois={'title':(tx,15,tx+320,55),'count':(tx,55,tx+200,90),'today':(left+20,110,left+110,170)}
 if left==0:rois['toggle']=(200,25,265,80)
 else:rois.update(newFolder=(left-170,25,left-90,80),toggle=(left-80,25,left-10,80))
 oldRecords[stem]={k:{str(t):ink(im,v,t) for t in [120,160,200]} for k,v in rois.items()}
# No alignment: exact same unscaled physical coordinates for original/new paired local ROIs.
pairs=[('visible228','01-original-visible','09-mac07-visible-active'),('restored228','03-original-restored','29-mac07-cold-menu-restored'),('hidden','02-original-hidden','11-mac07-hidden-stable')]
differences=[]
for label,a,b in pairs:
 for name,thresholds in records[a]['measurements'].items():
  roi=thresholds['160']['roi'];aa=ims[a].crop(roi);bb=ims[b].crop(roi);diff=ImageChops.difference(aa,bb)
  differences.append(dict(pair=label,roiName=name,roi=roi,changedPixels=sum(any(c) for c in diff.getdata()),maxChannelDifference=max(x[1] for x in diff.getextrema()),bbox=diff.getbbox(),scope='Decoded JPEG same absolute ROI, no scaling/registration; count text differs and hidden original title may be pointer-obscured. Not pixel acceptance.'))
# Each original/top crop is unchanged decoded source; labels live outside crops.
font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',15)
def sheet(name,items,roi,size):
 w,h=size;dst=Image.new('RGB',(w,h),'white');draw=ImageDraw.Draw(dst);deliver=[]
 for i,(label,stem) in enumerate(items):
  pos=(8,8+i*(roi[3]-roi[1]+40));draw.text(pos,label,font=font,fill=(25,25,25));crop=ims[stem].crop(roi);dest=(8,pos[1]+26);dst.paste(crop,dest);assert dst.crop((dest[0],dest[1],dest[0]+crop.width,dest[1]+crop.height)).tobytes()==crop.tobytes()
  deliver.append(dict(source=stem+'.cua-image',sourceROI=list(roi),outputBox=[dest[0],dest[1],dest[0]+crop.width,dest[1]+crop.height],decodedPixelsExact=True))
 dst.save(out/name);return deliver
crops={}
crops['visible-header.png']=sheet('visible-header.png',[('原版01 · JPEG局部1:1','01-original-visible'),('Mac07 09 · JPEG局部1:1','09-mac07-visible-active'),('Mac07 冷启动29 · JPEG局部1:1','29-mac07-cold-menu-restored')],(280,12,810,205),(546,707))
crops['hidden-header.png']=sheet('hidden-header.png',[('原版02 · 标题处指针待排除 · JPEG1:1','02-original-hidden'),('Mac07 11 · JPEG局部1:1','11-mac07-hidden-stable')],(190,12,650,205),(476,474))
crops['today.png']=sheet('today.png',[('原版01 · JPEG局部1:1','01-original-visible'),('Mac07 09 · JPEG局部1:1','09-mac07-visible-active'),('Mac07 恢复12 · JPEG局部1:1','12-mac07-direct-restored'),('Mac07 冷启29 · JPEG局部1:1','29-mac07-cold-menu-restored')],(456,104,760,205),(320,572))
# Exact fixed QA-TYPE full text at finite measured states; do not infer all-note integrity.
corpus={}
for stem in selected:
 s=(src/(stem+'.ax.txt')).read_text();needle='Value: QA-TYPE-20261104-01\n';assert needle in s,stem
 body='QA-TYPE-20261104-01\n'+re.split(r'\n\t+\d+ ',s.split(needle,1)[1],maxsplit=1)[0]
 corpus[stem]=dict(codepoints=len(body),sha256=hashlib.sha256(body.encode()).hexdigest())
assert len({x['sha256'] for x in corpus.values()})==1 and {x['codepoints'] for x in corpus.values()}=={257}
result=dict(method='Unscaled original decoded JPEG RGB; half-open absolute boxes; neutral299R+587G+114B<threshold*1000 and channel spread<25; thresholds120/160/200; no registration',formats=formats,records=records,old06=oldRecords,rawRoiDifferences=differences,deliveryCrops=crops,qaCorpus=corpus,limits=['Hidden original02 title needs pointer inspection/exclusion before interpreting full-title metrics.','Counts11 vs7 are different strings; only vertical bands/height support comparison.','208 clone labels derive physical456→416 movement plus root recorded actions, not numeric clone AX frame.','All screenshots JPEG; local boxes do not prove full pixel or native frame identity.'])
dump('measurements.json',result)
for row in rows:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256']
dump('inputs-close.json',dict(files=rows,unchangedCount=len(rows),allUnchanged=True))
print(json.dumps(dict(inputs=len(rows),imageFormats={x['path']:[x['format'],x['size']] for x in formats},results160={k:{n:v['160'] for n,v in x['measurements'].items()} for k,x in records.items()},old06160={k:{n:v['160'] for n,v in x.items()} for k,x in oldRecords.items()},corpus=corpus),ensure_ascii=False,indent=2))
