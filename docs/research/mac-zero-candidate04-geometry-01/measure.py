from pathlib import Path
from PIL import Image, ImageStat
import json
p = Path(__file__).resolve().parent
scans, supplements = {}, {}
for name in ["original-fill", "clone-fill"]:
    im = Image.open(p / (name + ".jpg")).convert("RGB")
    def lum(box):
        return sum(ImageStat.Stat(im.crop(box)).mean) / 3
    def bounds(box, threshold):
        points = [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2])
                  if max(im.getpixel((x, y))) < threshold]
        return [min(x for x, y in points), min(y for x, y in points),
                max(x for x, y in points) + 1, max(y for x, y in points) + 1] if points else None
    scans[name] = {
        "verticalDividerScan": [(x, round(lum((x, 300, x + 1, 1600)), 3)) for x in range(1008, 1023)],
        "horizontalHeaderRuleScan": [(y, round(lum((465, y, 1000, y + 1)), 3)) for y in range(176, 190)],
        "searchTitleDarkPixelBounds": bounds((480, 15, 600, 55), 110),
        "noResultsSubtitleDarkPixelBounds": bounds((480, 55, 600, 86), 110),
        "newNoteIconDarkPixelBounds": bounds((1040, 20, 1100, 85), 110),
        "tableIconDarkPixelBounds": bounds((1530, 20, 1600, 85) if name == "original-fill" else (1320, 20, 1390, 85), 110),
    }
    supplements[name] = {
        "subtitleThreshold180Bounds": bounds((485, 55, 590, 85), 180),
        "tableIconThreshold210Bounds": bounds((1535, 25, 1595, 78) if name == "original-fill" else (1320, 25, 1385, 78), 210),
        "searchMagnifierThreshold210Bounds": bounds((2130, 25, 2180, 80) if name == "original-fill" else (1705, 25, 1745, 80), 210),
        "sidebarBoundaryPixelsAtY1000": [(x, im.getpixel((x, 1000))) for x in range(450, 460)],
    }
for filename, data in [("measurement-scan.json", scans), ("measurement-supplement.json", supplements)]:
    expected = json.loads((p / filename).read_text())
    actual = json.loads(json.dumps(data))
    assert expected == actual, filename + " differs"
print("Saved JPEG measurement scans reproduced; no new images written.")
