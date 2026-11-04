"""Seal this completed finite device capture and local geometry analysis only."""
from pathlib import Path
import datetime, hashlib, json, shutil
from PIL import Image
import numpy as np
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=ROOT/'docs/verification/android-paper-plain-geometry03'
assert shutil.disk_usage(ROOT).free>=2*1024**3
def ident(p):
    b=p.read_bytes()
    return {'path':str(p.relative_to(ROOT)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
records=[]
for p in sorted(OUT.glob('[0-9][0-9]-*.json')):
    d=json.loads(p.read_text());assert d['status']=='PASS' and d['serial']=='emulator-5580' and d['package']=='com.local.notesclone'
    assert d['hostFreeBefore']>=2*1024**3 and d['hostFreeAfter']>=2*1024**3
    assert d['pidof']=='18341'
    if 'png' in d:
        pp=OUT/d['png']['path'];b=pp.read_bytes()
        assert ident(pp)['sha256']==d['png']['sha256'] and len(b)==d['png']['bytes'] and Image.open(pp).size==(1080,2280)
    records.append(ident(p))
assert len(records)==8
identity=json.loads((OUT/'00-package-identity.json').read_text())
assert identity['installedApk']['sha256']=='843e0c01aad154872851664ced574e1fa07544d8fcf874022698c37a3ee160f8'
roi=[0,240,1080,800]
base=np.array(Image.open(OUT/'01-original-note.png'))[240:800,:1080]
visual=[]
for name in ['03-plain-selected-return','05-grid-large-restored-return','07-final-cancel-note']:
    a=np.array(Image.open(OUT/(name+'.png')))[240:800,:1080]
    count=int(np.count_nonzero(np.any(a!=base,axis=2)))
    assert count==0
    visual.append({'image':name+'.png','comparedTo':'01-original-note.png','roi':roi,'differentPixels':count})
analysis=json.loads((OUT/'analysis.json').read_text())
assert analysis['inputsUnchanged'] and analysis['source']=='347660b352f6becb1f52a9c79fdf5372b50f1f12'
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'conclusion':'Same-plain selected native evidence captured; stable square clone selection contour supports narrow selection-paint candidate, not complete pixel parity',
        'sourceHead':analysis['source'],'packageIdentity':identity['installedApk'],'operationRecords':records,
        'actualChanges':['grid-large to plain via real card tap; closes, saved selection observed on reopen','plain to original grid-large via real card tap; saved selection observed on reopen','cancel returns original note view, keyboard hidden'],
        'noteTitle':'QA-PAPER-INDEPENDENT-20261103C','visibleBody':'Alpha Beta Gamma, Beta bold','visibleDate':'2026年11月3日23:45',
        'visibleRegionComparisons':visual,'plainNativeImage':ident(OUT/'04-plain-saved-reopened.png'),'restoredGridNativeImage':ident(OUT/'06-grid-large-restored-reopened.png'),
        'analysis':ident(OUT/'analysis.json'),'finalPID':'18341','deviceReleased':True,
        'limits':['Visual same-state sample; no DB/revision/selection/Editor/JSON assertions or process-restart persistence test.','No native computed CSS, DOM, engine internals or measured original radius/DPR/color.','No product/native build/download/Mac GUI or private-file export; only authorized QA style changes and restoration.']}
with (OUT/'result.json').open('x') as f:f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
files=[]
for p in sorted(OUT.rglob('*')):
    if p.is_file() and p.name!='manifest.json':
        if p.suffix!='.png':assert all(x==x.rstrip() for x in p.read_text().splitlines()),str(p)
        files.append(ident(p))
aggregate=hashlib.sha256(''.join(f"{x['path']}\t{x['bytes']}\t{x['sha256']}\n" for x in files).encode()).hexdigest()
with (OUT/'manifest.json').open('x') as f:
    f.write(json.dumps({'files':files,'fileCount':len(files),'totalBytes':sum(x['bytes'] for x in files),'aggregateAlgorithm':'SHA256 sorted repo-relative path TAB bytes TAB SHA256 LF records; manifest excludes itself','aggregateSHA256':aggregate},ensure_ascii=False,indent=2)+'\n')
m=ident(OUT/'manifest.json')
print(json.dumps({'manifest':m,'fileCountIncludingManifest':len(files)+1,'totalBytesIncludingManifest':sum(x['bytes'] for x in files)+m['bytes'],'aggregateSHA256':aggregate},ensure_ascii=False))
