"""Finite preserved-evidence analysis. No product mutations or runtime actions."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, hashlib, statistics, re, shutil

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
RUN = ROOT / 'docs/verification/mac-sidebar-visible05-runtime-01'
REF = ROOT / 'docs/verification/mac-same-columns-runtime05'
assert shutil.disk_usage(OUT).free >= 2 * 1024**3
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
names = ['00-old-identity.json', '01-old-before-quit.ax.txt', '01-old-before-quit.cua-image', '02-new-identity.json']
for stem in ['03-new-visible228','04-new-visible-focused','05-top-hide','06-top-restore','07-view-visible','08-menu-hide','09-view-hidden','10-menu-restore','11-visible-narrow','12-visible-restored-width','17-original-visible228','18-original-hidden']:
    names.append(stem + '.ax.txt')
    if stem[:2] not in ['07','09']: names.append(stem + '.cua-image')
inputs = [RUN / n for n in names]
for stem in ['04-original-body-focused','05-original-hidden','06-original-narrow','07-original-width-restored']:
    inputs.extend([REF / (stem + '.ax.txt'), REF / (stem + '.cua-image')])
corpus_path = ROOT / 'docs/verification/mac-body-typography-runtime-01/corpus.json'
inputs.append(corpus_path)
before = {str(p.relative_to(ROOT)): {'bytes':p.stat().st_size,'sha256':sha(p)} for p in inputs}
corpus=json.loads(corpus_path.read_text())['text']
records={}
def body(text):
    lines=text.splitlines(); result=[]
    for i,line in enumerate(lines):
        if not line.startswith('The focused') and 'Value: QA-TYPE-' in line and ('text entry area' in line or '文本输入区' in line):
            result=[line.split('Value: ',1)[1]]
            for tail in lines[i+1:]:
                if tail.startswith('\t') or tail.startswith('The focused'):break
                result.append(tail)
            return '\n'.join(result).rstrip('\n')
    return None
for p in inputs:
    if p.name.endswith('.ax.txt'):
        text=p.read_text(); b=body(text)
        records[str(p.relative_to(ROOT))]={'kind':'AX','snapshotState':'unchanged delta' if text.startswith('There has been no change') else ('menu only' if p.name[:2] in ['07','09'] and p.parent==RUN else 'full tree'),'chars':len(text),'bodyPresent':b is not None,'bodyEqualsFiniteCorpus':None if b is None else b==corpus,'bodyCodepoints':None if b is None else len(b),'bodySha256':None if b is None else hashlib.sha256(b.encode()).hexdigest(),'focus':next((l for l in text.splitlines() if l.startswith('The focused')),''),'menuFolderState':[l.strip() for l in text.splitlines() if '隐藏文件夹' in l or '显示文件夹' in l], 'splitters':[l.strip() for l in text.splitlines() if 'splitter ' in l or '分离器 ' in l]}
    elif p.name.endswith('.cua-image'):
        im=Image.open(p); records[str(p.relative_to(ROOT))]={'kind':'image','format':im.format,'size':list(im.size),'mode':im.mode}

def measure(path,roi,t=160):
    im=Image.open(path).convert('RGB'); points=[]; yellows=0; colors=[]
    for y in range(roi[1],roi[3]):
        for x in range(roi[0],roi[2]):
            r,g,b=im.getpixel((x,y))
            if r>170 and g>90 and r-b>60 and g-b>20:yellows+=1
            if 299*r+587*g+114*b<t*1000 and max(r,g,b)-min(r,g,b)<25:points.append((x,y)); colors.append((r,g,b))
    box=None if not points else [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1]
    return {'roi':roi,'threshold':t,'inkPixels':len(points),'box':box,'center':None if box is None else [(box[0]+box[2])/2,(box[1]+box[3])/2],'yellowPixels':yellows,'inkMedianRGB':None if not colors else [statistics.median(c[i] for c in colors) for i in range(3)]}

specs=[]
for stem in ['03-new-visible228','04-new-visible-focused','06-top-restore','10-menu-restore','12-visible-restored-width','17-original-visible228']:
    specs.append((stem,RUN/(stem+'.cua-image'),{'newFolder':[290,20,360,80],'toggle':[380,20,445,80]}))
specs.append(('11-visible-narrow',RUN/'11-visible-narrow.cua-image',{'newFolder':[250,20,320,80],'toggle':[340,20,405,80]}))
for stem in ['05-top-hide','18-original-hidden']:
    specs.append((stem,RUN/(stem+'.cua-image'),{'toggle':[190,20,265,80]}))
for stem in ['04-original-body-focused','07-original-width-restored']:
    specs.append((stem,REF/(stem+'.cua-image'),{'newFolder':[290,20,360,80],'toggle':[380,20,445,80]}))
specs.append(('06-original-narrow',REF/'06-original-narrow.cua-image',{'newFolder':[250,20,320,80],'toggle':[340,20,405,80]}))
specs.append(('05-original-hidden',REF/'05-original-hidden.cua-image',{'toggle':[190,20,265,80]}))
measurements={name:{icon:{str(t):measure(path,roi,t) for t in [120,160,200]} for icon,roi in icons.items()} for name,path,icons in specs}
old_color={icon:measure(RUN/'01-old-before-quit.cua-image',roi) for icon,roi in {'newFolder':[195,20,255,80],'toggle':[265,20,325,80]}.items()}

surface={}
for stem in ['05-top-hide','18-original-hidden']:
    im=Image.open(RUN/(stem+'.cua-image')).convert('RGB'); rows=[]
    for y in [48,50,52,54,56]:
        lum=lambda x:sum(im.getpixel((x,y)))/3
        left=max(range(184,202),key=lambda x:lum(x)-lum(x-1))
        right=min(range(254,279),key=lambda x:lum(x)-lum(x-1))
        rows.append({'y':y,'brightLeft':left,'brightRightExclusive':right,'brightWidth':right-left,'leftJump':lum(left)-lum(left-1),'rightJump':lum(right)-lum(right-1)})
    sample=[198 if stem=='05-top-hide' else 203,50]
    surface[stem]={'centerRows':rows,'titlePrefix':measure(RUN/(stem+'.cua-image'),[300,20,395,65]),'todayLabel':measure(RUN/(stem+'.cua-image'),[20,110,110,170]),'surfaceSamplePoint':sample,'surfaceSampleRGB':list(im.getpixel(tuple(sample)))}

font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',17)
small=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',13)
def compare(name,title,rows,roi):
    w=640;rh=roi[3]-roi[1]+42
    out=Image.new('RGB',(w,62+rh*len(rows)),'#eeeeee');draw=ImageDraw.Draw(out)
    draw.text((12,6),title,font=font,fill='black')
    draw.text((12,32),'JPEG 原图裁剪，1:1；无缩放、无平移配准、无像素通过结论',font=small,fill='black')
    for i,(label,path) in enumerate(rows):
        y=62+i*rh;draw.text((12,y),label+'  裁剪 '+str(roi),font=small,fill='black')
        out.paste(Image.open(path).convert('RGB').crop(roi),(12,y+28))
    out.save(OUT/name)
compare('visible228.png','侧栏可见：228 pt',[('原版 17，本次新增',RUN/'17-original-visible228.cua-image'),('克隆 04，修复后',RUN/'04-new-visible-focused.cua-image')],[180,0,480,110])
compare('visible208.png','侧栏可见：208 pt',[('原版 06，既有对照',REF/'06-original-narrow.cua-image'),('克隆 11，修复后',RUN/'11-visible-narrow.cua-image')],[180,0,480,110])
compare('hidden-context.png','隐藏侧栏：按钮背景和标题位置',[('原版 05，既有对照',REF/'05-original-hidden.cua-image'),('原版 18，本次新增',RUN/'18-original-hidden.cua-image'),('克隆 05，修复后',RUN/'05-top-hide.cua-image')],[0,0,550,90])

source=ROOT/'plugins/tauri-plugin-notes-ui/macos/toolbar.m'
source_text=source.read_text(); excerpts=[]
for start,end in [(45,68),(270,315),(329,340),(355,383)]:
    excerpts.extend(f'{i}: {l}' for i,l in enumerate(source_text.splitlines(),1) if start<=i<=end)
(OUT/'source-read-context.txt').write_text('Read-only source context SHA256 '+sha(source)+'\n\n'+'\n'.join(excerpts)+'\n')
result={'scope':'Explicit runtime00–12 plus fresh original17/18; existing originals04–07; frozen finite QA corpus. Runtime13–16 and later arrivals excluded. No dynamic-directory seal.','coordinateConvention':'Decoded JPEG image pixels, top-left origin; half-open boxes. Same local window left edge; global screen coordinates not asserted. No scaling/registration.','segmentation':'299R+587G+114B < threshold*1000, max(R,G,B)-min(R,G,B)<25; thresholds120/160/200. Yellow R>170,G>90,R-B>60,G-B>20.','inputs':records,'measurements':measurements,'oldBaselineColors':old_color,'hiddenSurface':surface,'sourceReadSha256':sha(source),'exclusions':['03 AX is unchanged-delta text, not a full tree; do not count it as body equality.','08 menu-hide cursor halo overlaps restore icon; visual endpoint only, no numeric ink fit.','Menu07/09 are AX-only with no screenshot, expected scope; body absent there.','No whole-window pixel PASS, no editor identity or universal parity claim.']}
(OUT/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for rel,meta in before.items():assert sha(ROOT/rel)==meta['sha256'],rel
assert len(inputs)==35,len(inputs)
print(json.dumps({'inputs':len(inputs),'AX':{Path(p).name:r for p,r in records.items() if r['kind']=='AX'},'measure160':{n:{i:ms['160'] for i,ms in icons.items()} for n,icons in measurements.items()},'surfaces':surface,'oldColors':old_color},ensure_ascii=False,indent=2))
(OUT/'input-manifest.json').write_text(json.dumps({'inputs':before,'aggregateSha256':hashlib.sha256('\n'.join(f'{k}\t{v["sha256"]}\t{v["bytes"]}' for k,v in sorted(before.items())).encode()).hexdigest()},ensure_ascii=False,indent=2)+'\n')
