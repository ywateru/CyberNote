from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image
out=Path(__file__).resolve().parent
root=out.parents[2]
run=out/'run02'
d=json.loads((run/'result.json').read_text())
assert d['pass'] and d['errors']==[] and d['externalRequests']==[]
assert d['cssSHA256']['candidate']=='d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7'
styles=['plain','lines-small','lines-medium','lines-large','grid-small','grid-medium','grid-large']
assert [x['style'] for x in d['paintPairs']]==styles
report={'scope':'Independent saved actual-App Chrome checks and raster read; no Android execution or pixel acceptance.','browser':d['browser'],'CSSSHA256':d['cssSHA256'],'pairs':[],'runs':[]}
for pair in d['paintPairs']:
 a=np.asarray(Image.open(run/f"mobile-{pair['style']}-baseline.png").convert('RGB'));b=np.asarray(Image.open(run/f"mobile-{pair['style']}-candidate.png").convert('RGB'))
 assert a.shape==b.shape and np.array_equal(a,b)
 assert len(pair['candidate'])==7
 for before,after in zip(pair['baseline'],pair['candidate']):
  assert before['id']==after['id'] and before['rect']==after['rect'] and before['preview']==after['preview'] and before['hits']==after['hits']
  assert {k:v for k,v in before['computed'].items() if not k.startswith('outline')}=={k:v for k,v in after['computed'].items() if not k.startswith('outline')}
  # The actual interior center still hits each original button; corner misses remain unchanged.
  assert before['hits'][3]['target']==before['id']==after['hits'][3]['target']
 selected=next(x for x in pair['candidate'] if x['selected'])
 assert selected['after']['pointerEvents']=='none' and selected['after']['borderRadius']=='7px' and selected['after']['top']=='-2px'
 assert selected['computed']['borderRadius']=='5px' and selected['computed']['borderTopWidth']=='0px' and selected['computed']['position']=='relative'
 x,y,w,h=selected['rect'];l=math.floor((x-4)*2);t=math.floor((y-20-4)*2);r=math.ceil((x+w+4)*2);bottom=math.ceil((y-20+h+4)*2);c=b[t:bottom,l:r]
 masks=[(c[:,:,0]>100)&(c[:,:,1]>60)&(c[:,:,0]>c[:,:,1])&(c[:,:,2]<80),(c[:,:,0]>160)&(c[:,:,1]>120)&(c[:,:,2]<50),(c[:,:,0]==198)&(c[:,:,1]==158)&(c[:,:,2]==0)]
 stats=[]
 for mask in masks:
  ys,xs=np.nonzero(mask);assert len(xs)>0
  x0,x1,y0,y1=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max());corners=[bool(mask[y0,x0]),bool(mask[y0,x1]),bool(mask[y1,x0]),bool(mask[y1,x1])];assert not any(corners)
  stats.append({'goldPixels':len(xs),'inclusiveBounds':[l+x0,t+y0,l+x1,t+y1],'boundingBoxCornersGold':corners})
 report['pairs'].append({'style':pair['style'],'PNGShape':list(b.shape),'changedRGBPixels':int(np.any(a!=b,axis=2).sum()),'cardRectCSS':selected['rect'],'selectedPseudoComputed':selected['after'],'cardCentersHitOriginalButtons':True,'all35SampledTargetsUnchanged':True,'masks':stats})
for runstate in d['runs']:
 assert [x['style'] for x in runstate['choices']]==styles
 for n,choice in enumerate(runstate['choices']):
  assert choice['after']['document']==runstate['initial']['document'] and choice['after']['stored']==choice['style']
  if n==0:
   assert not choice['selectionPreserved'] and not choice['keyPreserved'] and not choice['historyPreserved'] and not any(choice['after']['pathIdentity'].values())
  else:
   assert choice['selectionPreserved'] and choice['keyPreserved'] and choice['historyPreserved'] and all(choice['after']['pathIdentity'].values())
 assert runstate['short']['before']==runstate['short']['after']
 assert all(c['preserved'] for c in runstate['closes'])
 assert runstate['desktop']['baseline']==runstate['desktop']['candidate']
 a=np.asarray(Image.open(run/f"desktop-{runstate['version']}-baseline.png"));b=np.asarray(Image.open(run/f"desktop-{runstate['version']}-candidate.png"));assert np.array_equal(a,b)
 report['runs'].append({'version':runstate['version'],'actualChoices':len(runstate['choices']),'firstCurrentPlainSelectionKeyHistoryRebuildConfirmed':True,'remainingSixPathsPreserved':True,'shortScreenFullStatePreserved':True,'shortSheet':runstate['short']['sheet'],'desktopRasterEqual':True})
report['pass']=True
(out/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'pass':True,'browser':d['browser'],'pairs':len(report['pairs']),'actualChoices':14,'rasterChangePixels':[x['changedRGBPixels'] for x in report['pairs']],'preexistingFirstPlainFailure':True}))
