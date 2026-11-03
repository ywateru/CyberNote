"""Raw RGB comparison of the captured same-size inactive toolbar pair; no registration/rescaling."""
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance
import hashlib, json, math
base = Path(__file__).resolve().parent.parent / 'docs/verification/app-001-fix-02/runtime'
region = (1096, 8, 2168, 104)
original = Image.open(base / 'pair-original.png').convert('RGB')
clone = Image.open(base / 'pair-clone.png').convert('RGB')
assert original.size == clone.size == (2176, 1322)
a, b = original.crop(region), clone.crop(region)
a.save(base / 'roi-original.png'); b.save(base / 'roi-clone.png')
Image.blend(a,b,.5).save(base / 'roi-overlay.png')
diff = ImageChops.difference(a,b); diff.save(base / 'roi-diff.png')
ImageEnhance.Brightness(diff).enhance(4).save(base / 'roi-diff-x4.png')
values = list(diff.getdata()); n = len(values); sums = [sum(p[c] for p in values) for c in range(3)]
mae = sum(sums)/(3*n); mse = sum(v*v for p in values for v in p)/(3*n)
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
metrics = {'status':'fail: not pixel-identical; limited baseline only', 'inputs': {name: {'sha256':digest(base/name)} for name in ['pair-original.png','pair-clone.png']},
 'imagePixels':[2176,1322], 'windowPoints':[1088,661], 'scale':2,
 'roiPixels':list(region), 'roiMeaning':'Common new/edit/share/search strip in gallery-expanded note; absolute window pixels, excludes different folder counts/title, sidebar, date, system sharing indicator and body/caret/cursor.',
 'focus':'Both apps inactive before and after paired passive captures; frontmost com.openai.codex. Last editor target is same synthetic plain-text note; contemporaneous intra-capture key-window flag unavailable.',
 'content':'每日 TODO\\n记录每一个想法\\n今天的计划\\n整理需求与交互\\n完成本地保存',
 'theme':'Light appearance as observed in images', 'registration':'None; same absolute ROI, no rescale/threshold/color normalization', 'masks':[],
 'pixels':n,'maeRGB':mae,'maePerChannel':[v/n for v in sums],'rmseRGB':math.sqrt(mse),
 'exactChangedPixelRatio':sum(any(p) for p in values)/n,'maxChannelDeltaOver8PixelRatio':sum(max(p)>8 for p in values)/n,'maximumChannelDelta':max(max(p) for p in values),
 'knownDifferences':['Original format label is Chinese 格式; clone uses Aa SF symbol.', 'Original and clone symbol ink, spacing, foreground and glass RGB differ.', 'Shared ROI does not evaluate title/count, sidebar, full-page, active window or open menus.'],
 'limitations':['App windows have equal size but different screen positions; glass backdrop and system material can depend on surroundings.', 'Inactive pair does not validate active-state parity.', 'Original has 6 synthetic notes, clone has 1; count excluded from ROI.']}
(base/'roi-metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(metrics,ensure_ascii=False,indent=2))
