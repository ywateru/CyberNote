#!/usr/bin/env python3
"""Compare local AppKit symbol candidates with saved, original toolbar pixels.

Dependencies: Python 3 and Pillow. No application UI, network, or font extraction.
Usage: python3 compare.py REPO_ROOT CANDIDATE_DIRECTORY OUTPUT_DIRECTORY
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageStat

root, candidates, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((candidates / "manifest.json").read_text())
references = [
    ("new", "square.and.pencil", "macos26-format.png", 1073, 52),
    ("checklist", "checklist", "macos26-format.png", 1274, 52),
    ("table", "tablecells", "macos26-format.png", 1356, 52),
    ("table-active", "tablecells.badge.ellipsis", "macos26-table.png", 1427, 52),
    ("media", "paperclip", "macos26-format.png", 1430, 52),
    ("share", "square.and.arrow.up", "macos26-format.png", 1538, 52),
    ("more", "ellipsis", "macos26-format.png", 1627, 52),
    ("search", "magnifyingglass", "macos26-format.png", 1730, 52),
]


def points(mask):
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("Empty symbol mask")
    # Normalize only translation. Preserve generated size, shape, and pixels.
    return {(x-bbox[0], y-bbox[1]) for y in range(mask.height)
            for x in range(mask.width) if mask.getpixel((x, y))}, bbox


def compare(target, candidate):
    best = None
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            translated = {(x+dx, y+dy) for x, y in candidate}
            intersection = len(target & translated)
            union = len(target) + len(candidate) - intersection
            score = intersection / union
            if best is None or score > best[0]:
                best = (score, dx, dy)
    return best


def sample_image(sample):
    return Image.open(candidates / sample["file"]).convert("RGBA")


def tile_symbol(canvas, sample, left, top):
    icon = sample_image(sample)
    # Black on white, at original 2x sample size; no glyph resampling.
    canvas.paste(icon, (left, top), icon)


results = []
summary = Image.new("RGB", (1060, 8*158), "white")
summary_draw = ImageDraw.Draw(summary)
overlays = Image.new("RGB", (8*200, 220), "white")
overlay_draw = ImageDraw.Draw(overlays)
for row, (action, name, source_name, cx, cy) in enumerate(references):
    source_path = root / "references/desktop" / source_name
    source = Image.open(source_path).convert("RGB")
    # 54px width excludes the adjacent search-placeholder text.
    rect = [cx-27, cy-32, cx+27, cy+32]
    crop = source.crop(rect)
    crop.save(output / f"original-{action}.png")
    # Approximate 50% composited opacity, including the lighter search glyph.
    gray = crop.convert("L")
    foreground = gray.getextrema()[0]
    background = ImageStat.Stat(gray).median[0]
    source_cutoff = round((foreground+background)/2)
    target_points, target_bbox = points(gray.point(lambda v: 255 if v < source_cutoff else 0))
    ranked = []
    for sample in manifest["samples"]:
        if sample["name"] != name:
            continue
        candidate_points, bbox = points(sample_image(sample).getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        score, dx, dy = compare(target_points, candidate_points)
        ranked.append(dict(sample, iou=score, bboxPx=bbox,
            visibleSizePx=[bbox[2]-bbox[0], bbox[3]-bbox[1]],
            normalizedTranslationPx=[dx, dy]))
    ranked.sort(key=lambda s: (-s["iou"], abs(s["points"]-17), s["weight"] != "regular", s["scale"] != "medium"))
    selected = []
    # Show distinct raster shapes rather than repeated parameter combinations.
    seen = set()
    for sample in ranked:
        alpha = sample_image(sample).getchannel("A")
        signature = alpha.crop(alpha.getbbox()).tobytes()
        if signature in seen:
            continue
        seen.add(signature)
        selected.append(sample)
        if len(selected) == 6:
            break
    y = row*158
    summary_draw.text((8, y+4), f"{action}: source, then six distinct highest-IoU candidates (native 2x pixels)", fill="black")
    summary.paste(crop, (16, y+30))
    summary_draw.text((8, y+104), f"{target_bbox[2]-target_bbox[0]}x{target_bbox[3]-target_bbox[1]}px", fill="black")
    for i, sample in enumerate(selected):
        x = 150 + i*150
        tile_symbol(summary, sample, x, y+22)
        summary_draw.text((x, y+104), f'{sample["points"]:g}pt {sample["weight"]}', fill="black")
        summary_draw.text((x, y+118), f'{sample["scale"]}; {sample["visibleSizePx"]}', fill="black")
        summary_draw.text((x, y+132), f'IoU {sample["iou"]:.4f}', fill="black")
    if ranked:
        sample_image(ranked[0]).save(output / f"candidate-{action}.png")
    best = ranked[0]
    candidate_alpha = sample_image(best).getchannel("A")
    sensitivity = []
    for source_threshold in [source_cutoff-15, source_cutoff, source_cutoff+15]:
        source_points, _ = points(crop.convert("L").point(lambda v: 255 if v < source_threshold else 0))
        for alpha_threshold in [96, 128, 160]:
            candidate_points, _ = points(candidate_alpha.point(lambda v: 255 if v >= alpha_threshold else 0))
            score, _, _ = compare(source_points, candidate_points)
            sensitivity.append(dict(sourceThreshold=source_threshold, alphaThreshold=alpha_threshold, iou=score))
    candidate_points, _ = points(candidate_alpha.point(lambda v: 255 if v >= 128 else 0))
    dx, dy = best["normalizedTranslationPx"]
    aligned = {(x+dx, y+dy) for x, y in candidate_points}
    overlay = Image.new("RGB", (48, 48), "white")
    for x, y in target_points | aligned:
        color = (60,60,60) if (x,y) in target_points & aligned else ((220,40,40) if (x,y) in target_points else (30,100,230))
        overlay.putpixel((x+2, y+2), color)
    overlays.paste(overlay.resize((192,192), Image.Resampling.NEAREST), (row*200,20))
    overlay_draw.text((row*200+4,4),action,fill="black")
    results.append(dict(action=action, systemSymbol=name, source=f"references/desktop/{source_name}",
        sha256=hashlib.sha256(source_path.read_bytes()).hexdigest(), sourceSizePx=list(source.size),
        cropPx=rect, sourceInkBBoxPx=list(target_bbox),
        sourceInkGlobalBBoxPx=[rect[0]+target_bbox[0], rect[1]+target_bbox[1],
            rect[0]+target_bbox[2], rect[1]+target_bbox[3]],
        sourceInkCenterPt=[(2*rect[0]+target_bbox[0]+target_bbox[2])/4,
            (2*rect[1]+target_bbox[1]+target_bbox[3])/4],
        sourceInkSizePx=[target_bbox[2]-target_bbox[0], target_bbox[3]-target_bbox[1]],
        sourceForegroundMin=foreground, sourceBackgroundMedian=background, sourceThreshold=source_cutoff,
        examined=len(ranked), best=ranked[0] if ranked else None, top=ranked[:6],
        bestThresholdSensitivity=sensitivity,
        equalBestConfigurations=[{k:s[k] for k in ("points", "weight", "scale")} for s in ranked
            if ranked and s["iou"] == ranked[0]["iou"]]))
    # Fixed 17pt grid explicitly exposes the interaction of scale and weight.
    grid = Image.new("RGB", (510, 390), "white")
    draw = ImageDraw.Draw(grid)
    draw.text((8, 5), f"{action}: {name}; fixed 17pt, original 2x pixels", fill="black")
    grid.paste(crop, (10, 30))
    draw.text((90, 50), "Original reference", fill="black")
    for sample in ranked:
        if sample["points"] != 17:
            continue
        col = ["small", "medium", "large"].index(sample["scale"])
        line = ["regular", "medium", "semibold"].index(sample["weight"])
        x, y = 10+col*165, 100+line*95
        tile_symbol(grid, sample, x, y)
        draw.text((x+75, y+10), sample["weight"], fill="black")
        draw.text((x+75, y+25), sample["scale"], fill="black")
        draw.text((x+75, y+40), f'IoU {sample["iou"]:.3f}', fill="black")
    grid.save(output / f"matrix-17pt-{action}.png")
summary.save(output / "ranked-contact-sheet.png")
overlays.save(output / "aligned-mask-differences-4x.png")
report = dict(runtime=manifest["operatingSystem"], dpr=manifest["dpr"],
    canvasPoints=manifest["canvasPoints"], unavailable=manifest["unavailable"],
    generatedSamples=len(manifest["samples"]), thresholdOriginalLuminance="< round((minimum + median)/2); per crop",
    thresholdCandidateAlpha=">= 128", alignment="bbox origin plus exhaustive integer translation [-3,3] px in x/y; no resizing",
    score="binary intersection-over-union of glyph masks only; not RGB/pixel parity or application similarity",
    results=results)
(output / "rankings.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
print(json.dumps([{ "action":r["action"], "size":r["sourceInkSizePx"], "best":r["best"]} for r in results], indent=2))
