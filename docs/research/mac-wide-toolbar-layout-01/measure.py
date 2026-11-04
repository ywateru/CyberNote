"""Offline surface-edge measurements. Run from the repository root; no image writes."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import statistics

OUT = Path("docs/research/mac-wide-toolbar-layout-01")
CASES = {
    "fill_original": ("docs/research/mac-zero-candidate04-geometry-01/original-fill.jpg", [1035, 1108, 1356, 1678, 1926, 2086, 2118, 2768]),
    "fill_clone": ("docs/research/mac-zero-candidate04-geometry-01/clone-fill.jpg", [1034, 1106, 1142, 1464, 1500, 1660, 1692, 2768]),
    "pair_original": ("docs/verification/app-001-fix-02/runtime/pair-original.png", [1105, 1178, 1214, 1536, 1572, 1732, 1764, 2160]),
    "pair_clone": ("docs/verification/app-001-fix-02/runtime/pair-clone.png", [1106, 1179, 1214, 1537, 1572, 1733, 1764, 2160]),
    "format_original": ("references/desktop/macos26-format.png", [1035, 1108, 1144, 1466, 1502, 1662, 1694, 2160]),
}


def identity(path):
    b = Path(path).read_bytes()
    return {"path": path, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}


def proposal(w, start, cap):
    available = w - start - 8
    old_search = available - 329
    search = min(old_search, cap)
    spare = max(0, available - 329 - search)
    gap = 18 + spare / 2
    new = [start, start + 36]
    edit = [new[1] + gap, new[1] + gap + 161]
    share = [edit[1] + gap, edit[1] + gap + 80]
    return {"w": w, "start": start, "cap": cap, "available": available,
            "old_search": old_search, "search": search, "spare": spare,
            "first_two_gaps": [gap, gap], "new": new, "edit": edit,
            "share": share, "search_bounds": [share[1] + 16, share[1] + 16 + search]}


data = {"date": "2026-11-04", "method": {
    "coordinates": "source pixels; half-open surface cross-sections, not AppKit frames",
    "rows": [50, 52, 54], "edge_neighborhood_radius_px": 4,
    "detector": "largest signed adjacent luminance step within a visually selected endpoint neighborhood",
    "uncertainty_px": 2, "half_scale": "divide by 2 only as an interpretation for Fill; no original logical bounds API",
    "limits": "JPEG edge candidates, not lossless native pixels; neighborhoods are endpoint-local, not an automatic whole-image segmenter"
}, "images": {}}
for name, (path, hints) in CASES.items():
    im = Image.open(path)
    gray = im.convert("L")
    entry = identity(path)
    entry.update(format=im.format, size_px=list(im.size), header=Path(path).read_bytes()[:12].hex())
    edges = []
    rows = []
    for k, x in enumerate(hints):
        readings = []
        for y in data["method"]["rows"]:
            strength, edge = max(((gray.getpixel((i, y)) - gray.getpixel((i - 1, y))) * (1 if k % 2 == 0 else -1), i)
                                 for i in range(x - 4, x + 5))
            readings.append({"y": y, "x": edge, "signed_step": strength})
        edges.append(statistics.median(r["x"] for r in readings))
        rows.append(readings)
    surfaces = dict(zip(["new", "edit", "share", "search"], [edges[i:i + 2] for i in range(0, 8, 2)]))
    gaps = [edges[2] - edges[1], edges[4] - edges[3], edges[6] - edges[5]]
    entry.update(endpoint_readings=rows, surfaces_px=surfaces, gaps_px=gaps,
                 search_width_px=edges[7] - edges[6], right_margin_px=im.width - edges[7])
    data["images"][name] = entry
data["source"] = identity("plugins/tauri-plugin-notes-ui/macos/toolbar.m")
data["other_inputs"] = [identity(p) for p in [
    "docs/research/mac-zero-candidate04-geometry-01/identity-and-capture.json",
    "docs/research/mac-zero-candidate04-geometry-01/README.md",
    "docs/verification/app-001-fix-02/runtime/pair-before-capture.json",
    "docs/verification/app-001-fix-02/runtime/pair-after-capture.json",
    "docs/verification/app-001-fix-02/runtime/roi-metrics.json",
    "docs/research/macos-toolbar-geometry/analysis.md",
]]
data["historical_pair_state"] = {}
for phase in ["before", "after"]:
    state = json.loads(Path(f"docs/verification/app-001-fix-02/runtime/pair-{phase}-capture.json").read_text())
    data["historical_pair_state"][phase] = {
        "frontmostBundle": state.get("frontmostBundle"),
        "apps": [{"bundle": a["bundle"], "active": a["active"],
                  "main_bounds": [w["bounds"] for w in a["windows"] if w["bounds"].get("Width") == 1088]}
                 for a in state["apps"]]}
data["proposal_examples_in_source_points_not_measured_original_frames"] = [
    proposal(1392, 517, 326), proposal(1392, 517, 325), proposal(1088, 517, 326), proposal(1180, 517, 326)]
OUT.mkdir(exist_ok=True, parents=True)
(OUT / "measurements.json").write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({"output": str(OUT / "measurements.json"), "source": data["source"]}))
