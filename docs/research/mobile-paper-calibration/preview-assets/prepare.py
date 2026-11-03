#!/usr/bin/env python3
"""Build six preview-only SVG masks; render and inspect using existing local tools."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets/mobile-paper-previews'
RENDERS = HERE / 'renders'
WIDTH, HEIGHT, SCALE, STROKE = 74, 60, 8, 0.45
# Regularized from d22a393 source measurements. Not recovered high-DPI geometry.
SPECS = {
    'lines-small': {'horizontal': [7.5, 15, 22.5, 30, 37.5, 45, 52.5]},
    'lines-medium': {'horizontal': [15, 30, 45]},
    'lines-large': {'horizontal': [15, 45]},
    'grid-small': {'columns': 8, 'rows': 6},
    'grid-medium': {'columns': 4, 'rows': 3},
    'grid-large': {'columns': 2, 'rows': 2},
}

def number(value):
    return f'{value:.8f}'.rstrip('0').rstrip('.')

def geometry(spec):
    if 'horizontal' in spec:
        return [(7, y, 67, y) for y in spec['horizontal']]
    columns, rows = spec['columns'], spec['rows']
    return ([(7, 7 + 44 * index / rows, 67, 7 + 44 * index / rows) for index in range(rows + 1)]
            + [(7 + 60 * index / columns, 7, 7 + 60 * index / columns, 51) for index in range(columns + 1)])

def clusters(positions):
    result = []
    for value in positions:
        if not result or value > result[-1][-1] + 1:
            result.append([value])
        else:
            result[-1].append(value)
    return result

def identity(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

ASSETS.mkdir(parents=True, exist_ok=True)
RENDERS.mkdir(parents=True, exist_ok=True)
magick = shutil.which('magick')
if not magick:
    raise RuntimeError('Existing ImageMagick is required; this script does not install dependencies.')
measurements = json.loads((HERE.parent / 'measurements.json').read_text())
report = {'viewBox': [0, 0, WIDTH, HEIGHT], 'strokeWidth': STROKE, 'renderScale': SCALE,
          'renderer': subprocess.run([magick, '-version'], text=True, capture_output=True, check=True).stdout.splitlines()[0],
          'source': identity(ROOT / 'references/mobile/frames-2s/frame-044.png'),
          'measurementSource': identity(HERE.parent / 'measurements.json'),
          'normalization': 'Regularized raw-coordinate geometry: horizontal x7..67; lines at fractions of 60; grid x7..67/y7..51. Counts fixed; sparse cells30x22. Not a pixel parity claim.',
          'results': []}
for name, spec in SPECS.items():
    segments = geometry(spec)
    svg = '\n'.join([
        '<svg xmlns="http://www.w3.org/2000/svg" width="74" height="60" viewBox="0 0 74 60">',
        '  <!-- Preview-only alpha mask. Stroke width is an engineering starting value. -->',
        '  <g fill="none" stroke="#000" stroke-width="0.45" stroke-opacity="1" stroke-linecap="butt" stroke-linejoin="miter">',
        *['    <line x1="{}" y1="{}" x2="{}" y2="{}"/>'.format(*(number(v) for v in line)) for line in segments],
        '  </g>', '</svg>', ''])
    asset = ASSETS / f'{name}.svg'
    asset.write_text(svg)
    tree = ET.fromstring(svg)
    assert tree.attrib['viewBox'] == '0 0 74 60'
    assert [child.tag.split('}')[-1] for child in tree] == ['g']
    group = list(tree)[0]
    assert group.attrib == {'fill': 'none', 'stroke': '#000', 'stroke-width': '0.45', 'stroke-opacity': '1', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter'}
    assert all(child.tag.endswith('}line') for child in group)
    parsed = [tuple(float(child.attrib[key]) for key in ['x1', 'y1', 'x2', 'y2']) for child in group]
    horizontal = [line for line in parsed if line[1] == line[3]]
    vertical = [line for line in parsed if line[0] == line[2]]
    expected_h = len(spec['horizontal']) if 'horizontal' in spec else spec['rows'] + 1
    expected_v = 0 if 'horizontal' in spec else spec['columns'] + 1
    assert len(horizontal) == expected_h and len(vertical) == expected_v
    assert all(line[0] == 7 and line[2] == 67 for line in horizontal)
    assert all(line[1] == 7 and line[3] == 51 for line in vertical)
    assert all(0 < min(line[0], line[2]) <= max(line[0], line[2]) < WIDTH and
               0 < min(line[1], line[3]) <= max(line[1], line[3]) < HEIGHT for line in parsed)
    render = RENDERS / f'{name}@8x.png'
    command = [magick, '-background', 'none', '-density', str(96 * SCALE), str(asset), str(render)]
    subprocess.run(command, check=True, text=True, capture_output=True)
    image = Image.open(render).convert('RGBA')
    assert image.size == (WIDTH * SCALE, HEIGHT * SCALE), image.size
    alpha = image.getchannel('A')
    assert all(pixel[:3] == (0, 0, 0) for pixel in image.getdata() if pixel[3] > 0)
    # Coverage checks avoid grid intersections; boundary lines are included explicitly.
    xs = range(8 * SCALE, 66 * SCALE)
    ys = range(8 * SCALE, 50 * SCALE)
    horizontal_rows = [y for y in range(image.height) if sum(alpha.getpixel((x, y)) >= 64 for x in xs) / len(xs) >= 0.75]
    vertical_columns = [x for x in range(image.width) if sum(alpha.getpixel((x, y)) >= 64 for y in ys) / len(ys) >= 0.75]
    h_runs, v_runs = clusters(horizontal_rows), clusters(vertical_columns)
    assert len(h_runs) == expected_h, (name, 'horizontal raster', h_runs)
    assert len(v_runs) == expected_v, (name, 'vertical raster', v_runs)
    assert alpha.crop((0, 0, 4 * SCALE, image.height)).getbbox() is None
    assert alpha.crop(((WIDTH - 4) * SCALE, 0, WIDTH * SCALE, image.height)).getbbox() is None
    assert alpha.crop((0, 0, image.width, 4 * SCALE)).getbbox() is None
    assert alpha.crop((0, (HEIGHT - 4) * SCALE, image.width, HEIGHT * SCALE)).getbbox() is None
    # Every segment endpoint retains alpha locally; no terminal grid line is clipped away.
    for line in parsed:
        for x, y in [(line[0], line[1]), (line[2], line[3])]:
            cx, cy = round(x * SCALE), round(y * SCALE)
            patch = alpha.crop((cx - 3, cy - 3, cx + 4, cy + 4))
            assert patch.getextrema()[1] >= 64, (name, 'missing endpoint', x, y)
    bounds = [min(p[0] for p in parsed), min(p[1] for p in parsed), max(p[2] for p in parsed), max(p[3] for p in parsed)]
    result = {'name': name, 'asset': identity(asset), 'render': identity(render),
              'horizontalLines': expected_h, 'verticalLines': expected_v,
              'segmentCenterBounds': bounds,
              'centerlineInsets': [bounds[0], bounds[1], WIDTH - bounds[2], HEIGHT - bounds[3]],
              'rasterAlphaBoundsAt8x': alpha.getbbox(),
              'rasterHorizontalCenters': [round(sum(run) / len(run) / SCALE, 4) for run in h_runs],
              'rasterVerticalCenters': [round(sum(run) / len(run) / SCALE, 4) for run in v_runs],
              'transparentOuter4Units': True, 'endpointsPresent': True, 'monochromeAlphaOnly': True}
    source_card = measurements['images']['reference']['cards'][name]
    source_box = source_card['box']
    source_pattern = source_card['pattern']
    normalized_h = [(value - source_box[1]) * HEIGHT / source_card['height'] for value in source_pattern['horizontal_centers']]
    normalized_v = [(value - source_box[0]) * WIDTH / source_card['width'] for value in source_pattern['vertical_centers']]
    result['sourceNormalization'] = {'sourceCardBox': source_box, 'normalizedMeasuredHorizontalCenters': normalized_h, 'normalizedMeasuredVerticalCenters': normalized_v,
        'maxRegularizationDeltaY': max(abs(a - b[1]) for a, b in zip(normalized_h, horizontal)),
        'maxRegularizationDeltaX': max((abs(a - b[0]) for a, b in zip(normalized_v, vertical)), default=0)}
    if expected_v:
        result.update({'cells': [spec['columns'], spec['rows']], 'cellSize': [60 / spec['columns'], 44 / spec['rows']]})
    report['results'].append(result)

# Contact sheet is research presentation only; checkerboard and labels are not in assets.
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(font_path, 17)
small = ImageFont.truetype(font_path, 14)
contact = Image.new('RGB', (1080, 700), '#f2f2f5')
draw = ImageDraw.Draw(contact)
draw.text((28, 18), 'PREVIEW MASKS / 74 x 60 / 4x display / stroke 0.45 source units', fill='#202124', font=font)
draw.text((28, 45), 'Counts and inset geometry only. No host integration or pixel-parity claim.', fill='#55565a', font=small)
for index, result in enumerate(report['results']):
    col, row = index % 3, index // 3
    left, top = 28 + col * 350, 86 + row * 300
    preview = Image.open(ROOT / result['render']['path']).convert('RGBA').resize((296, 240), Image.Resampling.LANCZOS)
    checker = Image.new('RGBA', preview.size)
    check_draw = ImageDraw.Draw(checker)
    for y in range(0, 240, 16):
        for x in range(0, 296, 16):
            color = '#ffffff' if (x // 16 + y // 16) % 2 == 0 else '#ececf0'
            check_draw.rectangle((x, y, x + 15, y + 15), fill=color)
    checker.alpha_composite(preview)
    contact.paste(checker.convert('RGB'), (left, top))
    label = result['name'] + (f" / {result['cells'][0]} x {result['cells'][1]} cells" if 'cells' in result else f" / {result['horizontalLines']} lines")
    draw.text((left, top + 247), label, fill='#202124', font=font)
    draw.text((left, top + 271), f"H{result['horizontalLines']} / V{result['verticalLines']} / transparent", fill='#55565a', font=small)
contact_path = HERE / 'contact-sheet.png'
contact.save(contact_path)
report['contactSheet'] = identity(contact_path)
(HERE / 'selfcheck.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f"PASS: {len(report['results'])} assets; XML counts, raster counts, endpoints, alpha color and margins checked.")
for result in report['results']:
    print(f"{result['name']}: H{result['horizontalLines']} V{result['verticalLines']}; bounds={result['segmentCenterBounds']}" + (f"; cells={result['cells']} cellSize={result['cellSize']}" if 'cells' in result else ''))
print('Renderer: ' + report['renderer'])
