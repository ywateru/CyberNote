#!/usr/bin/env python3
"""Preserve exact decoded recording/scanner evidence, using ffmpeg and Pillow.

Run from the repository root. Writes only this research directory and /tmp.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw
import hashlib
import json
import subprocess

source = Path("references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4")
output = Path(__file__).resolve().parent
times = [28, 30, 32, 34, 36, 80]
indices = [t*30 for t in times]
with TemporaryDirectory(prefix="notes-media-sampling-", dir="/tmp") as directory:
    pattern = str(Path(directory) / "frame-%02d.png")
    select = "select='" + "+".join(f"eq(n,{n})" for n in indices) + "'"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
                    "-vf", select, "-vsync", "0", pattern], check=True)
    image = Image.new("RGB", (224*6, 504), "white")
    draw = ImageDraw.Draw(image)
    for i, t in enumerate(times):
        frame = Image.open(Path(directory) / f"frame-{i+1:02d}.png")
        assert frame.size == (224, 480)
        image.paste(frame, (224*i, 24))
        draw.text((224*i+8, 5), f"{t}s, frame {t*30}", fill="black")
    image.save(output / "mobile-recording-scanner.png")
data = dict(source=str(source), sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            sourceSizePx=[224, 480], fps=30, decodedFrameIndices=indices,
            timestampsSeconds=times, resampling="none; 24px time labels above original frames")
(output / "mobile-sampling.json").write_text(json.dumps(data, indent=2))
