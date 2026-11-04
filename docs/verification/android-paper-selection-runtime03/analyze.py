from pathlib import Path
import hashlib,json
from PIL import Image,ImageChops
import numpy as np
R=Path.cwd();O=R/'docs/verification/android-paper-selection-runtime03';ident=lambda p:dict(path=str(p.relative_to(R)),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
specs={'oldGrid':(O/'03-before-grid-large.png',[590,1760,980,2090]),'newGrid':(O/'11-upgraded-grid-large.png',[590,1760,980,2090]),'oldPlain':(R/'docs/verification/android-paper-plain-geometry03/04-plain-saved-reopened.png',[105,520,495,840]),'newPlain':(O/'25-plain-rounded-reopened.png',[105,520,495,840])};out={}
for name,(p,roi) in specs.items():
 a=np.array(Image.open(p).convert('RGB'),dtype=int);x0,y0,x1,y1=roi;sub=a[y0:y1,x0:x1];r,g,b=sub[:,:,0],sub[:,:,1],sub[:,:,2];m=(r>170)&(g>100)&(r-g>12)&(g-b>25);ys,xs=np.where(m);box=[int(xs.min()+x0),int(ys.min()+y0),int(xs.max()+x0+1),int(ys.max()+y0+1)];xx0,yy0,xx1,yy1=[box[0]-x0,box[1]-y0,box[2]-x0,box[3]-y0];v=m[yy0:yy1,xx0:xx1]
 rows=[]
 for yy in [0,1,2,v.shape[0]-3,v.shape[0]-2,v.shape[0]-1]:
  xx=np.where(v[yy])[0];rows.append(dict(row=yy,leftInset=int(xx.min()),rightInset=int(v.shape[1]-1-xx.max()),count=len(xx)))
 cols=[]
 for xx in [0,1,2,v.shape[1]-3,v.shape[1]-2,v.shape[1]-1]:
  yy=np.where(v[:,xx])[0];cols.append(dict(column=xx,topInset=int(yy.min()),bottomInset=int(v.shape[0]-1-yy.max()),count=len(yy)))
 out[name]=dict(input=ident(p),bbox=box,edgeRows=rows,edgeColumns=cols,fourOuterCornersInset=all(r['leftInset']>5 and r['rightInset']>5 for r in [rows[0],rows[-1]]) and all(c['topInset']>5 and c['bottomInset']>5 for c in [cols[0],cols[-1]]))
assert not out['oldGrid']['fourOuterCornersInset'] and not out['oldPlain']['fourOuterCornersInset'];assert out['newGrid']['fourOuterCornersInset'] and out['newPlain']['fourOuterCornersInset']
pairs=[]
for first,last,roi,meaning in [('02-before-note.png','10-upgraded-qa-note.png',[0,240,1080,800],'upgrade visible title/date/body'),('10-upgraded-qa-note.png','12-first-current-grid-return.png',[0,240,1080,800],'first current grid selection visible note'),('02-before-note.png','42-final-cancel-note.png',[60,335,1020,510],'final title restored'),('02-before-note.png','42-final-cancel-note.png',[60,520,540,580],'final body and bold Beta restored')]:
 a=np.array(Image.open(O/first).convert('RGB').crop(roi));b=np.array(Image.open(O/last).convert('RGB').crop(roi));diff=np.abs(a.astype(int)-b.astype(int));pairs.append(dict(before=first,after=last,roi=roi,meaning=meaning,differentPixels=int(np.any(diff,axis=2).sum()),maxChannelDifference=int(diff.max())))
assert all(x['differentPixels']==0 for x in pairs),pairs
result=dict(status='PASS',coordinateConvention='Decoded1080x2280 source pixels, bbox half-open, no DPR inference',cornerThreshold='r>170 g>100 r-g>12 g-b>25, within fixed gold ROIs',corners=out,visualPairs=pairs,limits=['Four inset outer corner extrema support curved stroke vs prior square; exact radius/color/full Apple pixel equality not established.','Visible same note region equality does not expose database/PM revision or prove all stored records.','Final date intentionally differs due authorized QA text edits; excluded only from final title/body comparison, included in pre-edit upgrade comparison.'])
(O/'analysis.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(status='PASS',corners={k:dict(bbox=v['bbox'],inset=v['fourOuterCornersInset']) for k,v in out.items()},visualPairs=pairs),indent=2))
