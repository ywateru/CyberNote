#!/usr/bin/env python3
"""Offline geometry records from retained 2x Notes captures; no app/GUI access."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import hashlib
import json

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
DPR = 2
NAMES = ['format', 'gallery-open-note', 'gallery']
images = {name: Image.open(ROOT / f'references/desktop/macos26-{name}.png').convert('RGB') for name in NAMES}
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)

def identity(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def rect(box):
    return {'px': box, 'pt': [v / DPR for v in box], 'sizePx': [box[2]-box[0], box[3]-box[1]], 'sizePt': [(box[2]-box[0])/DPR, (box[3]-box[1])/DPR], 'centerPx': [(box[0]+box[2])/2, (box[1]+box[3])/2], 'centerPt': [(box[0]+box[2])/4, (box[1]+box[3])/4]}

def ink(name, box, threshold=190, color=False):
    im = images[name]
    points = []
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            p = im.getpixel((x, y))
            good = (p[0] > 120 and p[2] > 120 and p[1] < 120 and max(p)-min(p) > 50) if color else (max(p)<threshold and max(p)-min(p)<18)
            if good:
                points.append((x, y))
    if not points:
        return None
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points)+1, max(p[1] for p in points)+1]

# Fixed visible-surface anchors, manually read in unscaled sources and supported
# by centerline/edge RGB cuts. They are neither hit rects nor AppKit frames.
SURFACES = {
 'format': {'list_options': [928,16,1000,88], 'new': [1034,16,1108,88], 'format_checklist_table_media': [1144,16,1466,88], 'share_more': [1502,16,1662,88], 'search': [1694,16,2160,88]},
 'gallery-open-note': {'back': [472,16,544,88], 'new': [1104,16,1178,88], 'format_checklist_table_media': [1214,16,1536,88], 'share_more': [1572,16,1732,88], 'search': [1764,16,2160,88]},
 'gallery': {'options_new': [1302,16,1444,88], 'search': [1510,16,2160,88]},
}
ROIS = {
 'format': {'folder_title':[480,20,800,54], 'folder_count':[480,55,700,85], 'add_folder':[296,28,354,76], 'sidebar_toggle':[385,28,443,76], 'search_placeholder':[1750,32,1830,78]},
 'gallery-open-note': {'back':[487,30,526,75], 'folder_title':[555,20,860,54], 'folder_count':[555,55,780,85], 'new':[1110,22,1170,82], 'format_label':[1226,30,1294,78], 'checklist':[1314,24,1372,80], 'table':[1397,26,1454,79], 'attachment':[1473,23,1530,81], 'share':[1583,24,1638,79], 'more':[1670,32,1723,74], 'search_icon':[1776,28,1822,78], 'search_placeholder':[1825,32,1900,78]},
 'gallery': {'folder_title':[465,20,830,54], 'folder_count':[465,55,720,85], 'more':[1310,30,1358,76], 'new':[1380,24,1440,80], 'search_icon':[1510,26,1565,80], 'search_placeholder':[1570,32,1650,78]},
}
POP_ROIS = {'bold':[1036,130,1075,180], 'italic':[1097,130,1133,180], 'underline':[1151,130,1193,180], 'strike':[1206,130,1253,180], 'highlight':[1266,130,1315,180], 'highlight_color':[1320,134,1350,170], 'style_title':[1074,206,1180,262], 'style_heading':[1074,267,1200,315], 'style_subheading':[1074,329,1180,371], 'style_body':[1074,389,1160,431], 'body_check':[1035,388,1072,432], 'style_mono':[1074,447,1200,489], 'style_bullet':[1074,503,1280,546], 'style_dash':[1074,561,1280,606], 'style_number':[1074,620,1280,666], 'style_quote':[1074,703,1210,751]}
rank_path = ROOT / 'docs/research/assets/macos-symbols/rankings.json'
rankings = json.loads(rank_path.read_text())
report = {'date':'2026-11-03', 'scope':'saved original screenshots only; no GUI/runtime/production edits', 'coordinates':'top-left source origin; rectangles [left,top,right,bottom); px / 2 = pt', 'method':{'surface':'manual visible face boundary, excluding diffuse shadow; edge RGB profiles retained', 'ink':'neutral max(RGB)<190 and channel spread<18 in recorded ROI; sensitivity thresholds175/205; color swatch separately hue-filtered', 'uncertaintyPx':{'neutralInk':'typically ±1–2; threshold sensitivity retained', 'cleanGlassFace':'±2 per edge; white-on-white and antialiasing prevent an exact control frame', 'cursorOccludedFormatGroupLeft':'±6, pointer halo overlaps; left anchor only approximate', 'popoverBody':'±2–4; diffuse boundary', 'popoverCornerRadius':'approximate 36±4, no exact curve fit', 'arrowTip':'±4 or unknown under pointer halo'}, 'noInference':['hit rectangles','AppKit layout constraints','exact toolbar frame height','font baselines or row hit heights','glass blur radius','active/key-window state']}, 'symbolReuse':identity(rank_path), 'reference52PtBand':rect([0,0,2176,104]), 'bandMeaning':'host integration reference only; actual AX toolbar frame unavailable', 'images':{}, 'popover':{}}
for name, im in images.items():
    assert im.size == (2176,1320)
    entry = {'source':identity(ROOT / f'references/desktop/macos26-{name}.png'), 'sizePx':list(im.size), 'sizePt':[1088,660], 'windowActivity':'unknown; visible gray foreground only; filename not used as active proof', 'surfaces':{}, 'ink':{}}
    for label, box in SURFACES[name].items():
        entry['surfaces'][label] = {**rect(box), 'kind':'visible face envelope, not hit/frame', 'shape':'rounded capsule or near-circle; visible cap radius roughly34–38px, not exact curve fit', 'edgeErrorPx':6 if name=='format' and label=='format_checklist_table_media' else 2}
        samples=[]
        for y in [16,18,26,36,52,68,78,86,87]:
            if name=='format' and label=='format_checklist_table_media':
                samples.append({'yPx':y,'leftPx':None,'rightExclusivePx':None,'reason':'pointer overlaps left cap; not sampled'})
                continue
            left=[x for x in range(box[0],min(box[0]+39,box[2])) if min(im.getpixel((x,y)))>=254]
            right=[x for x in range(max(box[0],box[2]-39),box[2]) if min(im.getpixel((x,y)))>=254]
            samples.append({'yPx':y,'leftPx':min(left) if left else None,'rightExclusivePx':max(right)+1 if right else None})
        entry['surfaces'][label]['whiteFaceContourSamples']=samples
    for label, roi in ROIS[name].items():
        b=ink(name,roi)
        entry['ink'][label] = {**rect(b), 'roiPx':roi, 'threshold':190, 'sensitivityBoundsPx':{str(t):ink(name,roi,t) for t in [175,205]}, 'kind':'ink only; not control frame'}
    if name=='format':
        for result in rankings['results']:
            if result['source']=='references/desktop/macos26-format.png':
                entry['ink'][result['action']]={**rect(result['sourceInkGlobalBBoxPx']), 'kind':'reused glyph mask; not remeasured', 'threshold':result['sourceThreshold'], 'source':'symbolReuse'}
    entry['edgeProfiles'] = [{'axis':'vertical','xPx':x,'samples':[[y,*im.getpixel((x,y))] for y in [14,15,16,17,86,87,88,89,92,100,104]]} for x in ([1070,1360,1600,1950] if name=='format' else [1140,1300,1620,1950] if name=='gallery-open-note' else [1370,1950])]
    report['images'][name]=entry

report['galleryTitleComparison']={'browsingTitleLeftPx':report['images']['gallery']['ink']['folder_title']['px'][0], 'openedTitleLeftPx':report['images']['gallery-open-note']['ink']['folder_title']['px'][0], 'deltaPx':88, 'deltaPt':44, 'browsingCountLeftPx':481, 'openedCountLeftPx':569, 'backVisibleInBrowsing':False, 'backVisibleInOpened':True, 'openedBackVisibleFace':rect(SURFACES['gallery-open-note']['back']), 'titleInkToBackRightPx':26, 'titleInkToBackRightPt':13, 'browsingTitleInkFromSidebarRightPx':26, 'sidebarRightReferencePx':456, 'limitation':'same literal text and raster size; visible ink displacement only, no layout-mode/placeholder constraint inferred'}
report['toolbarRelations']={'cleanFacesYRangePx':[16,88], 'cleanFacesYRangePt':[8,44], 'faceHeightPx':72, 'faceHeightPt':36, 'visualFaceCenterYPx':52, 'visualFaceCenterYPt':26, 'spaceFromFaceBottomTo52PtBandPx':16, 'searchRightMarginPx':16, 'searchRightMarginPt':8, 'format':{'newToEditingFaceGapPx':36,'editingToShareFaceGapPx':36,'shareToSearchFaceGapPx':32,'searchSizePt':[233,36]}, 'gallery-open-note':{'newToEditingFaceGapPx':36,'editingToShareFaceGapPx':36,'shareToSearchFaceGapPx':32,'searchSizePt':[198,36]}, 'gallery':{'optionsNewToSearchFaceGapPx':66,'searchSizePt':[325,36]}, 'editingActionShiftBetweenFormatAndOpenedPx':70,'editingActionShiftBetweenFormatAndOpenedPt':35,'limitation':'gaps measured between face envelopes, not item spacing constraints; uncertainty sums across edges'}
ax_path=ROOT / 'references/desktop/macos26-format.ax.txt'
report['ax']={'source':identity(ax_path), 'observed':'toolbar roles/names; popup top controls40–45, style buttons47–54 and56; style body selected; all popup controls recorded disabled; focused collection38', 'geometry':'no AXPosition/AXSize/frame in saved text', 'gallerySpecificAx':'no gallery*.ax/.json/.txt found in bounded references/desktop inventory; gallery semantics from screenshot and capture README only'}
pop={'body':{**rect([1014,114,1366,764]), 'edgeErrorPx':4, 'shape':'rounded body, approximate corner radius36±4px (18±2pt); excludes arrow/shadow'}, 'arrow':{'approxTipPx':[1190,94], 'approxJoinPx':[[1162,114],[1218,114]], 'tipErrorPx':4, 'limitation':'pointer halo overlaps; approximate visible outline only'}, 'separators':[rect([1026,190,1354,191]),rect([1026,681,1354,682]),rect([1258,132,1259,176])], 'ink':{}}
for label,roi in POP_ROIS.items():
    b=ink('format',roi,color=label=='highlight_color')
    pop['ink'][label]={**rect(b), 'roiPx':roi, 'kind':'visible ink only', 'threshold':'hue mask' if label=='highlight_color' else 190}
    if label!='highlight_color':pop['ink'][label]['sensitivityBoundsPx']={str(t):ink('format',roi,t) for t in [175,205]}
styles=['style_title','style_heading','style_subheading','style_body','style_mono','style_bullet','style_dash','style_number','style_quote']
pop['styleRows']=[{'name':s,'inkRectPx':pop['ink'][s]['px'],'inkCenterYPx':pop['ink'][s]['centerPx'][1],'inkCenterYPt':pop['ink'][s]['centerPt'][1]} for s in styles]
pop['relations']={'styleLeftInkPx':1085,'styleLeftInsetFromBodyPx':71,'styleLeftInsetFromBodyPt':35.5,'separatorInsetPx':12,'firstDividerFromBodyTopPx':76,'firstDividerFromBodyTopPt':38,'secondDividerFromBodyTopPx':567,'quoteAreaAfterSecondDividerPx':82,'topControlInkCenterXPx':[pop['ink'][s]['centerPx'][0] for s in ['bold','italic','underline','strike','highlight','highlight_color']],'topControlCenterMeaning':'ink centers, not button centers', 'regularTextTopStepsPx':[pop['ink'][styles[i+1]]['px'][1]-pop['ink'][styles[i]]['px'][1] for i in range(7)], 'limitation':'row text sizes vary; 58px repeated ink-top steps do not establish actual row hit height or baseline'}
report['popover']=pop
report['uncertainRegions']={'format':[{'boxPx':[1112,0,1262,120],'reason':'pointer/highlight overlay; formatting label, group left and arrow tip not reliable for exact outline/color'}], 'gallery-open-note':[{'boxPx':[610,345,737,456],'reason':'body pointer halo; outside measured toolbar'}], 'gallery':[{'boxPx':[1000,70,1145,210],'reason':'body pointer halo extends into cropped header; not a Notes control and outside measured title/action faces'}], 'all':[{'boxPx':[32,32,165,73],'reason':'purple screen-sharing system overlay; excluded from Notes design'}]}
(OUT/'measurements.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

# Native-pixel annotated crops: no scaling or perspective transform.
comparison=Image.new('RGB',(2176,3*180),'white')
colors={'surface':'#00a2c7','ink':'#d57900','uncertain':'#d13562'}
for index,name in enumerate(NAMES):
    canvas=Image.new('RGB',(2176,180),'#f4f4f6');canvas.paste(images[name].crop((0,0,2176,120)),(0,0));d=ImageDraw.Draw(canvas)
    for label,box in SURFACES[name].items():
        d.rectangle((box[0],box[1],box[2]-1,box[3]-1),outline=colors['surface'],width=2)
        for sample in report['images'][name]['surfaces'][label]['whiteFaceContourSamples']:
            for x in [sample['leftPx'],sample['rightExclusivePx']]:
                if x is not None:d.ellipse((x-1,sample['yPx']-1,x+1,sample['yPx']+1),fill='#00875e')
    for label,item in report['images'][name]['ink'].items():
        if label in ['folder_title','folder_count','back','search_placeholder']:
            b=item['px'];d.rectangle((b[0],b[1],b[2]-1,b[3]-1),outline=colors['ink'],width=1)
    for x in range(0,2176,16):d.line((x,104,min(x+8,2175),104),fill='#d13562',width=1)
    if name=='format':d.rectangle((1112,0,1261,119),outline=colors['uncertain'],width=1)
    d.text((20,126),f'{name} / 2x native px / cyan=visible face, amber=selected ink bounds / green=cap samples / pink y104=52pt reference only',fill='#202124',font=font)
    d.text((20,152),'No hit frames, active state, internal constraints, blur radius or pixel pass inferred.',fill='#55565a',font=small)
    comparison.paste(canvas,(0,index*180))
comparison.save(OUT/'toolbar-comparison-annotated.png')

# Popup at native resolution, with separate label gutter to avoid covering evidence.
origin=(1000,85);crop=images['format'].crop((1000,85,1380,780));canvas=Image.new('RGB',(900,695),'#f4f4f6');canvas.paste(crop,(0,0));d=ImageDraw.Draw(canvas)
for b,c,w in [([1014,114,1366,764],colors['surface'],2),([1162,94,1218,114],colors['uncertain'],1)]:d.rectangle((b[0]-1000,b[1]-85,b[2]-1001,b[3]-86),outline=c,width=w)
for label,item in pop['ink'].items():
    b=item['px'];d.rectangle((b[0]-1000,b[1]-85,b[2]-1001,b[3]-86),outline=colors['ink'],width=1)
for item in pop['separators']:
    b=item['px'];d.line((b[0]-1000,b[1]-85,b[2]-1000,b[3]-86),fill='#009d6e',width=1)
d.text((400,12),'FORMAT POPOVER / original 2x pixels',fill='#202124',font=font)
lines=['Body [1014,114,1366,764)px =176x325pt','Face edges ±2-4px; radius approx18±2pt','Arrow near(1190,94)px; cursor halo overlaps','Controls: B / I / U / S / highlighter / color','Dividers y190 and681px; x1026..1354','All popup controls disabled in saved AX','Body selected in AX; no AX frame values','Styles: ink boxes only; no inferred hit areas','Title y216..251; heading y276..305','Subheading y338..362; body y396..420','Mono y454..477; bullet y512..536','Dash y570..594; number y628..652','Quote y714..738; separator above at681','Style text left mostly1085px (542.5pt)','No font baseline/row height inference','No app launch / GUI / pixel-parity pass']
for i,line in enumerate(lines):d.text((400,52+i*31),line,fill='#44464a',font=small)
canvas.save(OUT/'format-popover-annotated.png')
print('Saved geometry for3 sources; reused format glyph bounds; no GUI or app execution.')
print('Gallery title delta:',report['galleryTitleComparison'])
print('Popup top-control ink centers:',pop['relations']['topControlInkCenterXPx'])
