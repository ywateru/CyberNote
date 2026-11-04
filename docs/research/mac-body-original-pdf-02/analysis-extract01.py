"""Read-only PDF export typography diagnostic; writes own analysis-* files only."""
from pathlib import Path
import collections,datetime,hashlib,importlib.metadata,io,json,logging,math,shutil,subprocess,unicodedata
import pdfplumber
from pypdf import PdfReader
from pypdf.generic import ContentStream,TextStringObject,ByteStringObject,NameObject
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
PDF=OUT/'QA-TYPE-20261104-01.pdf'
CORPUS_PATH=ROOT/'docs/verification/mac-body-typography-runtime-01/corpus.json'
BUDGET=5*1024**2
MIN_FREE=2*1024**3
OWN_NAMES=['analysis-result01.json','analysis-content-operators01.json','analysis-page01.png','analysis-command01.json']
if any((OUT/n).exists() for n in OWN_NAMES):raise RuntimeError('Own output already exists; do not overwrite')
def guard():
 if shutil.disk_usage(OUT).free<MIN_FREE:raise RuntimeError('2GiB guard; no output write')
 if sum(p.stat().st_size for p in OUT.glob('analysis-*') if p.is_file())>BUDGET:raise RuntimeError('5MiB analysis budget exceeded')
def identity(p):
 b=p.read_bytes();return {'path':str(p.relative_to(ROOT)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def save(name,value):
 guard();text=json.dumps(value,ensure_ascii=False,indent=2)+'\n'
 if len(text.encode())+sum(p.stat().st_size for p in OUT.glob('analysis-*') if p.is_file())>BUDGET:raise RuntimeError('Refuse over-budget output')
 with (OUT/name).open('x') as f:f.write(text)
def simplify(obj):
 if isinstance(obj,TextStringObject):
  try:raw=obj.original_bytes.hex()
  except Exception:raw=None
  return {'type':'TextStringObject','pypdfDecoded':str(obj),'rawHex':raw}
 if isinstance(obj,(bytes,ByteStringObject)):return {'type':'bytes','rawHex':bytes(obj).hex()}
 if isinstance(obj,NameObject):return str(obj)
 if isinstance(obj,list):return [simplify(x) for x in obj]
 if isinstance(obj,dict):return {str(k):simplify(v) for k,v in obj.items()}
 if isinstance(obj,(int,float,str)) or obj is None:return obj
 try:return float(obj)
 except Exception:return str(obj)
guard();started=datetime.datetime.now(datetime.timezone.utc).isoformat();free=shutil.disk_usage(OUT).free
protected=[PDF,OUT/'01-save-panel.ax.txt',OUT/'01-save-panel.cua-image',OUT/'02-export-return.ax.txt',CORPUS_PATH]
before=[identity(p) for p in protected]
assert before[0]['bytes']==28146
corpus=json.loads(CORPUS_PATH.read_text())['text'];expected=corpus.replace('\n','')
warning_buffer=io.StringIO();handler=logging.StreamHandler(warning_buffer);logging.getLogger('pypdf').addHandler(handler)
reader=PdfReader(PDF);page=reader.pages[0];assert len(reader.pages)==1
fonts=[]
for alias,ref in page['/Resources']['/Font'].items():
 f=ref.get_object();descriptor=f['/FontDescriptor'].get_object();streams=[]
 for name in ['/FontFile','/FontFile2','/FontFile3']:
  if name in descriptor:
   raw=descriptor[name].get_object().get_data();streams.append({'key':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
 tu=f.get('/ToUnicode');tu_text=tu.get_object().get_data().decode('latin1') if tu else None
 fonts.append({'alias':str(alias),'subtype':str(f.get('/Subtype')),'baseFont':str(f.get('/BaseFont')),'fontDescriptor':{str(k):simplify(v) for k,v in descriptor.items() if str(k) not in ['/FontFile','/FontFile2','/FontFile3']},'encoding':simplify(f.get('/Encoding')),'firstChar':int(f.get('/FirstChar',0)),'lastChar':int(f.get('/LastChar',0)),'widths':list(f.get('/Widths',[])),'toUnicode':tu_text,'embeddedPrograms':streams})
ops=[{'index':i,'operator':op.decode('latin1'),'operands':simplify(args)} for i,(args,op) in enumerate(ContentStream(page.get_contents(),reader).operations)]
with pdfplumber.open(PDF) as pdf:
 p=pdf.pages[0];chars=[]
 for i,c in enumerate(p.chars):
  keys=['text','fontname','size','matrix','adv','x0','x1','y0','y1','top','bottom','width','height','upright']
  chars.append({'index':i,**{k:c[k] for k in keys}})
 extracted=p.extract_text();page_size=[p.width,p.height]
rows_map=collections.defaultdict(list)
for c in chars:rows_map[round(c['matrix'][5],7)].append(c)
rows=[]
for base,cs in sorted(rows_map.items(),reverse=True):
 cs=sorted(cs,key=lambda c:c['x0']);text=''.join(c['text'] for c in cs)
 rows.append({'row':len(rows)+1,'baselinePageY':base,'charCount':len(cs),'rawText':text,'nfkcText':unicodedata.normalize('NFKC',text),'x0':min(c['x0'] for c in cs),'x1':max(c['x1'] for c in cs),'characters':cs})
advances=[rows[i]['baselinePageY']-rows[i+1]['baselinePageY'] for i in range(len(rows)-1)]
flat=[c for row in rows for c in row['characters']]
raw_no_newline=''.join(c['text'] for c in flat)
assert len(flat)==len(expected)==247
alignment=[]
for i,(c,e) in enumerate(zip(flat,expected)):
 actual=c['text'];kind='exact' if actual==e else ('NFKC-equivalent' if unicodedata.normalize('NFKC',actual)==unicodedata.normalize('NFKC',e) else 'known-corpus alignment only; not direct extraction')
 alignment.append({'index':i,'extracted':actual,'expectedFromCorpus':e,'classification':kind,'fontname':c['fontname'],'x0':c['x0'],'x1':c['x1'],'baselinePageY':c['matrix'][5],'nextGlyphOriginAdvance':(flat[i+1]['x0']-c['x0'] if i+1<len(flat) and abs(flat[i+1]['matrix'][5]-c['matrix'][5])<1e-5 else None)})
text_ops=[x for x in ops if x['operator'] in ['cm','Tm','Tf','Tc','TJ','Tj','Tz']]
cm=[x['operands'] for x in ops if x['operator']=='cm'];tm=[x['operands'] for x in ops if x['operator']=='Tm'];tf=[x['operands'] for x in ops if x['operator']=='Tf']
assert all(v==[0.9798793,0,0,-0.9798793,54,788] for v in cm)
assert all(v[0:4]==[12,0,0,-12] for v in tm)
assert all(v[1]==1 for v in tf)
font_stats=collections.Counter((c['fontname'],round(c['size'],7)) for c in chars)
result={'schema':1,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceIdentities':before,'metadata':{str(k):str(v) for k,v in reader.metadata.items()},'pageCount':1,'pageSizePoints':page_size,'mediaBox':list(page.mediabox),'cropBox':list(page.cropbox),'rotation':page.get('/Rotate',0),'userUnit':page.get('/UserUnit',1),'fonts':fonts,'fontCharacterCounts':[{'fontname':k[0],'effectivePageSizePoints':k[1],'glyphCount':v} for k,v in font_stats.items()],'textMatrices':{'allTextMatrixLinearParts':[12,0,0,-12],'allFontTfScalar':1,'commonCTM':[0.9798793,0,0,-0.9798793,54,788],'nominalTextEm':12,'effectiveEmInPagePoints':12*0.9798793,'textRunOrigins':[[x[4],x[5]] for x in tm],'explanation':'Tf=1 multiplied by text-matrix em12 and outer CTM0.9798793. These are export coordinates, not screen/AppKit/CSS font-size measurements.'},'lineBaselinesPageY':[x['baselinePageY'] for x in rows],'lineBaselineAdvancesPagePoints':advances,'nominalRegularLineAdvance':16,'regularAdvancePagePoints':16*0.9798793,'emptyLineGapPagePoints':32*0.9798793,'rawPdfplumberText':extracted,'rawGlyphSequenceWithoutLineBreaks':raw_no_newline,'corpusCheck':{'expectedText':corpus,'expectedNonnewlineCharacters':len(expected),'actualGlyphCount':len(flat),'rawUnicodeEqualsCorpusWithoutLineBreaks':raw_no_newline==expected,'nfkcUnicodeEqualsCorpusWithoutLineBreaks':unicodedata.normalize('NFKC',raw_no_newline)==unicodedata.normalize('NFKC',expected),'classificationCounts':dict(collections.Counter(x['classification'] for x in alignment)),'nonEquivalentMappings':[x for x in alignment if x['classification'].startswith('known-corpus')],'alignmentMethod':'Known corpus in order aligned to247 glyphs for diagnosis only; does not repair or prove missing PDF ToUnicode mappings. Direct extraction strings preserved.','returnedAxContainsCompleteCorpus':'Value: '+corpus in (OUT/'02-export-return.ax.txt').read_text()},'punctuationRowAlignment':[x for x in alignment if abs(x['baselinePageY']-rows[4]['baselinePageY'])<1e-5],'rows':rows,'pypdfWarnings':warning_buffer.getvalue().splitlines(),'versions':{k:importlib.metadata.version(k) for k in ['pypdf','pdfplumber','pdfminer.six','Pillow']},'diskFreeBefore':free,'limits':['PDF export fonts/positioning do not establish live screen font identity or CSS/AppKit size.','A4 export wraps the long paragraph into3 rows; screen sample has2; do not align PDF and screen directly.','ToUnicode uses compatibility radicals and omits7 punctuation mappings; literal extracted corpus equality is false. Known-corpus alignment must remain labeled.','Export evidence supports a shaping/positioning lead, not a proved cause or fix for the on-screen74-pixel punctuation-width residual.','No GUI, target/cache, platform bundle, dependency install, font installation, source/PDF/root evidence edit or main commit.']}
save('analysis-content-operators01.json',{'operators':ops,'textRelatedOperators':text_ops})
render=['/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm','-f','1','-singlefile','-scale-to','1100','-png',str(PDF),str(OUT/'analysis-page01')]
guard();run=subprocess.run(render,cwd=ROOT,text=True,capture_output=True,timeout=30)
command={'argv':render,'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr,'timeoutSeconds':30,'sourcePdfUnmodified':identity(PDF)==before[0]}
save('analysis-command01.json',command)
assert run.returncode==0
from PIL import Image
with Image.open(OUT/'analysis-page01.png') as im:result['render']={**identity(OUT/'analysis-page01.png'),'size':list(im.size),'method':'Existing bundled Poppler, scale-to1100, one page; diagnostic preview only.'}
result['sourcesUnchangedAfter']=before==[identity(p) for p in protected];assert result['sourcesUnchangedAfter']
result['diskFreeAfter']=shutil.disk_usage(OUT).free;result['analysisBytesBeforeResult']=sum(p.stat().st_size for p in OUT.glob('analysis-*') if p.is_file())
save('analysis-result01.json',result);guard()
print(json.dumps({'fonts':result['fontCharacterCounts'],'effectiveEmPagePoints':result['textMatrices']['effectiveEmInPagePoints'],'lineAdvances':advances,'corpusCheck':{k:v for k,v in result['corpusCheck'].items() if k not in ['expectedText','nonEquivalentMappings','alignmentMethod']},'warnings':result['pypdfWarnings'],'render':result['render'],'analysisBytes':sum(p.stat().st_size for p in OUT.glob('analysis-*') if p.is_file())},ensure_ascii=False,indent=2))
