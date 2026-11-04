from pathlib import Path
from PIL import Image, ImageDraw
import json

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
RATIO = 1080/224
SOURCES = {
    'original14':('references/mobile/frames-2s/frame-008.png',(192,434,220,463)),
    'original62':('references/mobile/frames-2s/frame-032.png',(192,434,220,463)),
    'android07-04':('docs/verification/android-folder-visual-runtime29/04-stable-folders.png',(930,2020,1060,2130)),
    'android07-19':('docs/verification/android-folder-visual-runtime29/19-after-restart.png',(930,2020,1060,2130)),
}
PRED = {
    'gold_strict':lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0] and p[0]>1.06*p[1],
    'gold_loose':lambda p:p[0]>140 and p[1]>95 and p[2]<.80*p[0] and p[0]>1.03*p[1],
}
records, crops = {}, {}
for name,(source,roi) in SOURCES.items():
    src=Image.open(ROOT/source);im=src.convert('RGB');crops[name]=im.crop(roi)
    boxes={}
    for mask,pred in PRED.items():
        pts=[(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2]) if pred(im.getpixel((x,y)))]
        b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
        factor=RATIO if name.startswith('android') else 1
        boxes[mask]={'nativeBbox':b,'pixels':len(pts),'widthInReferencePx':(b[2]-b[0])/factor,
                     'heightInReferencePx':(b[3]-b[1])/factor,'leftInReferencePx':b[0]/factor,
                     'rightInReferencePx':b[2]/factor,'centerXInReferencePx':(b[0]+b[2])/2/factor}
    records[name]={'source':source,'nativeSize':list(im.size),'roi':roi,'embeddedIccBytes':len(src.info.get('icc_profile',b'')),'masks':boxes}

cdp=json.loads((OUT/'read-only-cdp-result.json').read_text())
g=cdp['geometry'];dpr=g['viewport']['devicePixelRatio'];s=g['svg'];b=g['button']['rect']
svgcenter=s['rect']['x']+s['rect']['width']/2
buttoncenter=b['x']+b['width']/2
geometrycenter=s['screenCTM']['e']+s['bbox']['centerX']*s['screenCTM']['a']
stroke=float(s['computed']['stroke-width'].removesuffix('px'))
predleft=(s['screenCTM']['e']+(s['bbox']['x']-stroke/2)*s['screenCTM']['a'])*dpr
predright=(s['screenCTM']['e']+(s['bbox']['x']+s['bbox']['width']+stroke/2)*s['screenCTM']['a'])*dpr
observed=records['android07-19']['masks']['gold_strict']['nativeBbox']
arithmetic={'buttonCenterCssPx':buttoncenter,'svgBoxCenterCssPx':svgcenter,
            'svgBoxVsButtonCenterCssPx':svgcenter-buttoncenter,
            'viewBoxGeometryCenter':s['bbox']['centerX'],'pathGeometryVsViewBoxCenter':s['bbox']['centerX']-12,
            'currentDeviceDpr':dpr,'geometryCenterCssPx':geometrycenter,
            'geometryCenterTimesDpr':geometrycenter*dpr,'observedGoldBboxCenterNativePx':(observed[0]+observed[2])/2,
            'observedMinusGeometryCenterNativePx':(observed[0]+observed[2])/2-geometrycenter*dpr,
            'strokeExpandedGeometryModelTimesDpr':{'left':predleft,'right':predright,'width':predright-predleft},
            'modelLimit':'Geometric getBBox plus half stroke, no independent rasterization. Thresholded captured paint bounds include antialiasing and integer quantization; model is a local explanation, not full pixel prediction.',
            'viewportLimit':'App CSS width times DPR is ~1081 but saved image width1080. Width-only reference ratio and current CSS/DPR coordinates remain distinct; original CSS viewport/DPR unknown.',
            'targetCssValueSelected':False}
result={'scope':'Compose-only saved-image diagnostic and one read-only current07 DOM geometry; no other ROI rerun or new rendering',
        'ratio':RATIO,'coordinateRule':'Half-open native image bboxes;1080/224 normalizes width only, never reconstructs original CSS/dp/pt/DPR',
        'records':records,'current07SlotAndPath':arithmetic,'limits':['224x480 source recording is compressed/low resolution.','Strict/loose thresholds cannot recover exact native path, corner radii, stroke or color.','Known current07 DPR applies to current Android geometry only.','Original slot/button/viewBox remains unavailable; no original CSS value inferred.']}
(OUT/'compose-local.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

# Crops retain native sample positions. The diagram has no fitted glyph registration.
canvas=Image.new('RGB',(560,170),'#ddd');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(SOURCES):
    draw.text((i*140+4,5),name+' native crop',fill='black')
    canvas.paste(crops[name],(i*140,30))
canvas.save(OUT/'compose-native-crops.png')
canvas=Image.new('RGB',(340,4*265),'#ddd');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(SOURCES):
    im=crops[name]
    if name.startswith('android'):
        im=im.resize((round(im.width/RATIO),round(im.height/RATIO)),Image.Resampling.LANCZOS)
    draw.text((4,i*265+5),name+' | width-only normalized; nearest8x',fill='black')
    draw.text((4,i*265+20),'ROI origins differ; topology aid, no pixel score',fill='black')
    canvas.paste(im.resize((im.width*8,im.height*8),Image.Resampling.NEAREST),(4,i*265+34))
canvas.save(OUT/'compose-width-normalized-nearest8x.png')
print(json.dumps({'composeOnly':records,'slotPath':arithmetic},ensure_ascii=False,indent=2))
