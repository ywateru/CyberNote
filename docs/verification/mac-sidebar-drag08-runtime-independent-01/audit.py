from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import hashlib,json,re,statistics
r=Path.cwd();a=r/'docs/verification/mac-sidebar-drag08-runtime-01';o=Path(__file__).resolve().parent;old=r/'docs/verification/mac-list-heading07-runtime-01'
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def J(n):return json.loads((a/(n+'.json')).read_text())
def dump(n,d):
 p=o/n;assert not p.exists();p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
inputs=json.loads((o/'inputs-open.json').read_text())['files'];assert len(inputs)==51
for row in inputs:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256']
assert len(list(a.iterdir()))==45 and len(list(a.glob('*.cua-image')))==18 and len(list(a.glob('*.ax.txt')))==21 and len(list(a.glob('*.json')))==5
formats=[];images={}
for p in sorted(a.glob('*.cua-image')):
 im=Image.open(p);im.load();assert im.format=='JPEG' and im.mode=='RGB'
 expected=(2176,1320) if p.stem[:2] in ['03','20','21','22','23','25'] else (2788,1806);assert im.size==expected
 formats.append(dict(path=p.name,format=im.format,mode=im.mode,size=list(im.size)));images[p.stem]=im.convert('RGB')
# Exact process identities and actual sealed executable; saved process evidence only, no live queries.
expected='9de0996603eaa91d4185a85f462ae73e3adaa6c22b8320de339208622143b65b'
assert J('00-mac07-before-quit-identity')['stdout'].startswith('95696 ') and J('00-mac07-before-quit-identity')['sha256']=='0de1ab851b06f6da59fe3d37a3843af0b0cf46557effe69d2c72bb7bcf63ffd1'
for name,pid in [('01-mac07-exited','95696'),('18-mac08-exited','4556')]:
 d=J(name);assert d['command']==['/bin/ps','-p',pid,'-o','pid=,comm='] and d['returncode']==1 and d['stdout']==d['stderr']==''
for name,pid in [('02-mac08-identity','4556'),('19-mac08-cold-identity','4772')]:
 d=J(name);assert d['sha256']==expected and d['psExitCode']==0 and d['stderr']=='' and d['processes']==[pid+' '+d['executable']];assert H(Path(d['executable']))==expected
# Complete finite AX body, counts, time and explicit selected strings; menu-only AX deliberately excluded.
menuNames={'14-menu-visible','16-menu-hidden-label','24-cold-menu-show'};ax={};corpus=[]
reference=(old/'09-mac07-visible-active.ax.txt').read_text()
def body(s):
 needle='Value: QA-TYPE-20261104-01\n';assert needle in s
 return 'QA-TYPE-20261104-01\n'+re.split(r'\n\t+\d+ ',s.split(needle,1)[1],maxsplit=1)[0]
ref=body(reference);assert len(ref)==257 and len(ref.encode())==547 and hashlib.sha256(ref.encode()).hexdigest()=='69fc53a7926291444f2a846074f92f625c945d997fa8e33c7c957038ff90cd82'
for p in sorted(a.glob('*.ax.txt')):
 s=p.read_text();stem=p.name[:-7];ax[stem]=s
 if stem in menuNames:assert not (a/(stem+'.cua-image')).exists();continue
 b=body(s);assert b==ref
 assert 'Notes Clone UI 对照 7 个备忘录' in s and '2026年11月4日 14:19' in s
 selected=re.findall(r'Selected text: ```\n(.*?)\n```',s,re.S)
 expect=['ABCDE'] if stem[:2] in ['07','08','09','10','11'] else []
 assert selected==expect,(stem,selected)
 corpus.append(dict(path=p.name,codepoints=len(b),utf8Bytes=len(b.encode()),sha256=hashlib.sha256(b.encode()).hexdigest(),selectedText=selected))
assert len(corpus)==18
for name in ['12-hidden','15-menu-hidden','21-cold-hidden','23-cold-hidden-again']:
 s=ax[name];assert 'button 显示或隐藏文件夹' in s and 'button 新建文件夹' not in s
for name in ['13-direct-restored','17-menu-restored','22-cold-direct-restored','25-cold-menu-restored']:
 s=ax[name];assert 'button 显示或隐藏文件夹' in s and 'button 新建文件夹' in s
assert '2 隐藏文件夹' in ax['14-menu-visible'] and '2 显示文件夹' in ax['16-menu-hidden-label'] and '2 显示文件夹' in ax['24-cold-menu-show']
# Blue-highlight diagnostic is combined with actual crop inspection, not a generic selection oracle.
def blue(im,roi):
 pts=[]
 for y in range(roi[1],roi[3]):
  for x in range(roi[0],roi[2]):
   R,G,B=im.getpixel((x,y))
   if B>=220 and G>=170 and B-R>=25 and G-R>=12 and B-G>=10 and R>=100:pts.append((x,y))
 return dict(roi=list(roi),pixels=len(pts),bbox=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None)
blueResults={};geometry={}
for stem in ['03-initial-visible','04-visible-wide','05-sidebar-narrow','06-sidebar-restored','07-body-selection','08-selected-sidebar-narrow','09-selected-sidebar-restored','10-selected-list-narrow','11-selected-list-restored']:
 im=images[stem];narrow=stem[:2] in ['05','08'];left=416 if narrow else 456;right=1138 if stem[:2] in ['05','08','10'] else 1178
 regions=dict(interface=blue(im,(left+16,104,right-16,im.height-40)),footer=blue(im,(0,im.height-206,left,im.height)),body=blue(im,(1130,240,1500,340)))
 assert regions['interface']['pixels']==regions['footer']['pixels']==0
 assert (regions['body']['pixels']>1000)==(stem[:2] in ['07','08','09','10','11'])
 blueResults[stem]=regions
 if stem[:2]!='03':
  samples={x:statistics.median(sum(im.getpixel((x,y)))/3 for y in range(450,1550,10)) for x in range(1090,1200)};mn=min(samples.values());edge=[x for x,v in samples.items() if v==mn];assert edge==[right],(stem,edge)
  # The visible date left ink anchor independently tracks sidebar content movement; no font audit.
  pts=[(x,y) for y in range(120,165) for x in range(left+20,left+110) if max(im.getpixel((x,y)))-min(im.getpixel((x,y)))<25 and sum(im.getpixel((x,y)))<480]
  anchor=min(x for x,y in pts);assert anchor==left+33
  geometry[stem]=dict(rootRecordedSidebarBoundary=left,dateLeftInkAnchor=anchor,listRightDarkColumn=edge,profileScope='Raw screenshot pixels, no image registration or internal clone frame read')
# Positive controls preserve old failures; no rewriting or rerender.
positive={}
for stem in ['19-mac07-sidebar208','20-mac07-sidebar228-restored']:
 im=Image.open(old/(stem+'.cua-image')).convert('RGB');roi=(0,1600,416,1806) if stem.startswith('19') else (476,110,760,170)
 positive[stem]=blue(im,roi);assert positive[stem]['pixels']>100
# Limited unscaled inspection sheets, exact copied raw RGB crops with labels outside.
font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',14);cropMaps={}
def sheet(filename,items,roi):
 w,h=roi[2]-roi[0],roi[3]-roi[1];dst=Image.new('RGB',(w+16,(h+34)*len(items)+8),'white');draw=ImageDraw.Draw(dst);maps=[]
 for i,(label,path) in enumerate(items):
  im=Image.open(path).convert('RGB');cropped=im.crop(roi);y=8+i*(h+34);draw.text((8,y),label,font=font,fill='black');dst.paste(cropped,(8,y+25));assert dst.crop((8,y+25,w+8,y+25+h)).tobytes()==cropped.tobytes()
  maps.append(dict(source=str(path.relative_to(r)),roi=list(roi),outputBox=[8,y+25,w+8,y+25+h],decodedPixelsExact=True))
 dst.save(o/filename);cropMaps[filename]=maps
sheet('body-selection-contact.png',[(x+' · JPEG1:1',a/(x+'.cua-image')) for x in ['07-body-selection','08-selected-sidebar-narrow','09-selected-sidebar-restored','10-selected-list-narrow','11-selected-list-restored']],(1130,248,1470,318))
sheet('date-selection-before-after.png',[('07失败20 · 日期蓝选 · JPEG1:1',old/'20-mac07-sidebar228-restored.cua-image'),('08拖窄05 · 无日期蓝选 · JPEG1:1',a/'05-sidebar-narrow.cua-image'),('08恢复06 · 无日期蓝选 · JPEG1:1',a/'06-sidebar-restored.cua-image')],(416,104,800,205))
sheet('footer-selection-before-after.png',[('07失败19 · footer蓝选 · JPEG1:1',old/'19-mac07-sidebar208.cua-image'),('08拖窄05 · footer · JPEG1:1',a/'05-sidebar-narrow.cua-image'),('08恢复06 · footer · JPEG1:1',a/'06-sidebar-restored.cua-image')],(0,1650,600,1806))
result=dict(verdict='PASS_FINITE_EXACT_PACKAGE_DRAG_SELECTION_AND_RECOVERY',rawFiles=45,inputs=51,formats=formats,exeSha256=expected,processChain=['Mac07 95696','exited','Mac08 4556','normal quit exited','Mac08 4772'],bodyCorpus=corpus,menuOnlyAX=sorted(menuNames),geometry=geometry,blueDiagnostic=blueResults,old07FailurePositiveControls=positive,blueRule='B>=220 G>=170 B-R>=25 G-R>=12 B-G>=10 R>=100; fixed local raw RGB diagnostic, not complete visual/selection oracle',cropMaps=cropMaps,limits=['Root authored live CUA; independent audit only re-read saved exact-package evidence and decoded raw images.','No screenshot exists for menu14/16/24; AX-only labels preserved, no reconstructed menu image.','Specific ABCDE selection/drag paths only, no all focus/IME/history/capture lifecycle proof or DB/revision/ACK export.','Normal quit/reopen tested with sidebar visible at exit; hidden-state persistence not claimed.','All images JPEG; no font/full-window/Apple pixel parity re-audit.'])
for row in inputs:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256']
dump('inputs-close.json',dict(files=inputs,unchangedCount=51,allUnchanged=True));dump('result.json',result)
print(json.dumps(dict(verdict=result['verdict'],inputs=51,rawFiles=45,normalAX=18,menuOnlyAX=3,bodySelectionStates=5,interfaceBluePixels=0,footerBluePixels=0,old07PositiveControls=positive,exeSha256=expected),ensure_ascii=False))
