#!/usr/bin/env python3
"""Review exact decoded frames 810..945, every 3 frames, without GUI interaction."""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw
import hashlib
import json
import subprocess

source = Path("references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4")
output = Path(__file__).resolve().parent
indices = list(range(810, 946, 3))
with TemporaryDirectory(prefix="notes-recording-review-", dir="/tmp") as temporary:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
                    "-vf", "select='between(n,810,945)*not(mod(n-810,3))'",
                    "-vsync", "0", str(Path(temporary)/"frame-%03d.png")], check=True)
    contact = Image.new("RGB", (224*8, 504*6), "white")
    contact_draw = ImageDraw.Draw(contact)
    detail = Image.new("RGB", (180*10, 180*5), "white")
    detail_draw = ImageDraw.Draw(detail)
    for i, n in enumerate(indices):
        frame = Image.open(Path(temporary)/f"frame-{i+1:03d}.png")
        assert frame.size == (224, 480)
        x, y = (i % 8)*224, (i // 8)*504
        contact.paste(frame, (x, y+24))
        contact_draw.text((x+4, y+5), f"{n/30:.1f}s frame {n}", fill="black")
        x, y = (i % 10)*180, (i // 10)*180
        detail_draw.text((x+3, y+3), f"{n/30:.1f}s", fill="black")
        detail.paste(frame.crop((60,315,170,350)), (x+3,y+25))
        button = frame.crop((74,405,150,450)).resize((152,90), Image.Resampling.NEAREST)
        detail.paste(button, (x+3,y+75))
    contact.save(output/"recording-start-27-31.5-contact.png")
    detail.save(output/"recording-start-27-31.5-details.png")
data = dict(source=str(source), sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            fps=30, frameIndices=indices, timestampsSeconds=[n/30 for n in indices],
            contactResampling="none; original 224x480 frames plus 24px labels",
            detailCropsPx=dict(timer=[60,315,170,350], button=[74,405,150,450]),
            detailResampling="timer native pixels; button 2x nearest neighbor for visual inspection",
            findings=["27.0-27.9s sampled frames: 00:00.00 and large filled red circle",
                      "28.0s: 00:00.00 with control shape transition",
                      "28.1s: 00:00.17 and red pause bars; later samples advance through 30.5s",
                      "30.6-31.5s: 00:02.60 holds; continue and enabled done visible after transition"],
            startTrigger="unknown: no decisive touch marker; cannot establish automatic versus manual start",
            limits="0.1s sampling and 224px compressed source; no claim of precise transition timing or causal input")
(output/"recording-start-review.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
