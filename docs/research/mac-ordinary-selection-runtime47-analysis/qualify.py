from pathlib import Path
import json
O=Path(__file__).resolve().parent;p=O/'measurements.json';data=json.loads(p.read_text())
# Preserve all original metrics. Qualification changes no coordinate, pixel, threshold, or image.
original=O/'measurements-before-visual-qualification.json'
if original.exists():raise RuntimeError('Refuse overwrite initial metrics')
original.write_bytes(p.read_bytes())
data['status']='Qualified actual saved-image analysis complete: all usable, partial/natural three-host comparison UNKNOWN; no full pixel PASS'
data['samplingQualification']={
 'method':'Native full-form and nearest2x montage visual QA after numerical extraction; no new sample, mask exclusion, repaired image, re-render, alignment, or fit',
 'all':{'threeHostComparisonUsable':True,'reason':'All3 selected name/label/background ROIs have no visible pointer or grey halo'},
 'partial':{'threeHostComparisonUsable':False,'status':'UNKNOWN','reason':'Original46 and Mac13-46 pointers and grey halos visibly overlap selected建文, adjacent unselected text and parts of nearby background; Mac14 name region clear'},
 'natural':{'threeHostComparisonUsable':False,'status':'UNKNOWN','reason':'Original46 and Mac13-46 pointers and grey halos visibly overlap name glyphs/background; Mac14 name region clear'},
 'coreCaution':'430 same positions were selected by the pre-QA common9 raw<80 rule, which includes halo-affected endpoints; report their fixed values only, not a native foreground or representative all-only core estimate',
 'retainedButNotProductScores':['Partial/natural complete name MAE/masks/coverage and three-host core medians','Partial selected/unselected cell scores','Natural Mac13->Mac14 full-form changed pixels','Partial/natural nearby smartLabel deltas potentially affected by halo/JPEG'],
 'mac14Standalone':'Partial AX selects建文 and image shows black selected text with unselected text retained; natural name has raw1601166 and bbox142125268149. No clean original46/Mac13-46 whole-name parity conclusion from these frames.',
 'followup':'Root will separately seal fresh48 observations. No48 data read in this47 task; old47 input unchanged.'}
for n,record in data['measurements'].items():
 state=n.split('-',1)[1];record['threeHostProductComparisonUsable']=state=='all'
 if state!='all':record['quality']='Retained raw numerical observation only; three-host appearance verdict UNKNOWN due original/Mac13 pointer/halo overlap'
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Qualified without changing any samples/images. all usable; partial/natural UNKNOWN.')
