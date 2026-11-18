#!/usr/bin/env python3
"""Run review-01 isolated Android build recipe with exact fixed revision in memory."""
from pathlib import Path
recipe = Path(__file__).resolve().parent.parent / 'cyberbus123-platform-01/android-build.py'
source = recipe.read_text()
old = "rev = 'b74eeb637a68370d2b4faae26647be349fa31c50'"
assert source.count(old) == 1
source = source.replace(old, "rev = 'a4c85d3242a4a792b6374696a507e678b4672047'")
exec(compile(source, str(recipe), 'exec'), {'__file__': str(recipe), '__name__': '__main__'})
