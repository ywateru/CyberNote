"""Reproduce this bounded UI evidence from the preserved original, no GUI.

Requires only the already available ffmpeg/ffprobe and Pillow. Never writes input.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import math
import shutil
import subprocess
import tempfile

OUTPUT = Path(__file__).resolve().parent
ROOT = OUTPUT.parents[2]
SOURCE = ROOT / "references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4"
EXPECTED = "2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d"
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
metadata = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(SOURCE)
]))
pts = [float(frame["best_effort_timestamp_time"]) for frame in metadata["frames"]]
quarter = [math.floor(n * 7.5 + .5) for n in range(104, 153)]
extension = [math.floor(n * 7.5 + .5) for n in range(144, 153)]
windows = {"start": list(range(834, 847)), "pause": list(range(915, 925)), "done": list(range(1047, 1063))}
indices = sorted(set(quarter + sum(windows.values(), [])))
representatives = [780, 795, 833, 842, 870, 915, 923, 960, 1020, 1047, 1053, 1065]
representative_dir = OUTPUT / "representative"
representative_dir.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="notes-original-sequence-") as temporary:
    temporary = Path(temporary)
    expression = "+".join(f"eq(n\\,{n})" for n in indices)
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(SOURCE), "-vf", "select=" + expression,
                    "-fps_mode", "passthrough", str(temporary / "frame-%03d.png")], check=True)
    files = sorted(temporary.glob("frame-*.png"))
    assert len(files) == len(indices) == 83
    frames = dict(zip(indices, files))
    rows = []
    for n in indices:
        destination = representative_dir / f"frame-n{n:04d}.png"
        if n in representatives:
            shutil.copyfile(frames[n], destination)
        rows.append({"sourceFrameIndexZeroBased": n, "sourcePtsSeconds": pts[n],
                     "retainedPath": str(destination.relative_to(ROOT)) if n in representatives else None,
                     "sha256": hashlib.sha256(frames[n].read_bytes()).hexdigest()})

    def transition(group):
        canvas = Image.new("RGB", (896, 170 * math.ceil(len(group) / 4)), "#eeeeee")
        draw = ImageDraw.Draw(canvas)
        for j, n in enumerate(group):
            x, y = j % 4 * 224, j // 4 * 170
            canvas.paste(Image.open(frames[n]).crop((0, 330, 224, 480)), (x, y + 20))
            draw.text((x + 5, y + 4), f"{pts[n]:.3f}s n={n}", fill="black")
        return canvas

    start, pause = transition(windows["start"]), transition(windows["pause"])
    combined = Image.new("RGB", (896, start.height + pause.height + 24), "#eeeeee")
    ImageDraw.Draw(combined).text((6, 5), "START TRANSITION / PAUSE TRANSITION; source pixels, bottom crop y330:480", fill="black")
    combined.paste(start, (0, 24)); combined.paste(pause, (0, start.height + 24))
    combined.save(OUTPUT / "transitions-start-pause.png")
    transition(windows["done"]).save(OUTPUT / "transitions-done.png")
    canvas = Image.new("RGB", (896, 1512), "#eeeeee")
    draw = ImageDraw.Draw(canvas)
    for j, n in enumerate(representatives):
        x, y = j % 4 * 224, j // 4 * 504
        canvas.paste(Image.open(frames[n]), (x, y + 24))
        draw.text((x + 5, y + 5), f"{pts[n]:.3f}s n={n}", fill="black")
    canvas.save(OUTPUT / "representative-contact.png")
    canvas = Image.new("RGB", (1120, 1008), "#eeeeee")
    draw = ImageDraw.Draw(canvas)
    for j, n in enumerate(extension):
        x, y = j % 5 * 224, j // 5 * 504
        canvas.paste(Image.open(frames[n]), (x, y + 24))
        draw.text((x + 5, y + 5), f"{pts[n]:.3f}s n={n}", fill="black")
    canvas.save(OUTPUT / "extension-36-38-contact.png")
    (OUTPUT / "frame-index.json").write_text(json.dumps({
        "input": str(SOURCE.relative_to(ROOT)), "inputSha256": EXPECTED,
        "method": "49 samples over 26-38s at nearest real frame to 0.25s targets, plus every source frame in start n834:846, pause n915:924, done n1047:1062. Union contains 83 inspected real source frames. Only 12 representative full images, 2 transition crop sheets and 36-38 contact retained. Other frames reproducible from original by source index. PTS read from ffprobe, no interpolation.",
        "samples": rows,
    }, indent=2) + "\n")
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
print("83 real source frames; 12 representative PNGs; two transition sheets; 36-38 contact; original unchanged.")
