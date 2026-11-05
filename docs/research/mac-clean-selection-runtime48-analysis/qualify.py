"""Annotate the single fixed-method measurement after visual inspection."""
from pathlib import Path
import json

O = Path(__file__).resolve().parent
R = O.parents[2]
initial = O / 'measurements-before-visual-qualification.json'
assert not initial.exists(), 'Refuse replacing initial numerical observation'
p = O / 'measurements.json'
initial.write_bytes(p.read_bytes())
d = json.loads(p.read_text())
d['status'] = 'Qualified finite saved48 analysis complete; all three states visually usable; no pixel parity PASS'
d['samplingQualification'] = {
    'method': 'Independent visual inspection of existing native full-form montage and nearest2x glyph montage after one numerical extraction',
    'all': {'threeHostComparisonUsable': True, 'reason': 'No visible pointer tip or grey halo across any of the three name regions'},
    'partial': {'threeHostComparisonUsable': True, 'reason': 'No visible pointer tip or grey halo across selected建文 or adjacent unselected name/background in any host'},
    'natural': {'threeHostComparisonUsable': True, 'reason': 'No visible pointer tip or grey halo across name/background in any host'},
    'coreCaution': '721 fixed common-nine raw<80 positions (partial selected subset289), following exactly47 rule, only screenshot darkness observations, not measured native font/color parameters;47 core430 unchanged',
    'noMethodChange': 'No sampling/ROI/threshold change, repaired pixels, glyph alignment, fitting, recapture or rerender',
    'history': '47 remains independently sealed with partial/natural UNKNOWN and original contaminated scores retained;48 does not rewrite47',
    'naturalAXLimit': 'AX exposes focused name but no caret offset; end position follows sealed keyboard action narrative, not direct AX offset evidence'
}
for record in d['measurements'].values():
    record['threeHostProductComparisonUsable'] = True
d['savedProcessIdentity'] = {h: json.loads((R / 'docs/research/mac-clean-selection-runtime48' / (h + '-process.json')).read_text()) for h in ['mac13', 'mac14']}
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('Visual qualification saved, original metrics unchanged')
