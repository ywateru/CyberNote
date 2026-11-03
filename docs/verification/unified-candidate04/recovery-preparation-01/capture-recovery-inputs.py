#!/usr/bin/env python3
"""Explicit future Android-only recovery freeze; never builds."""
import argparse
from pathlib import Path
from recovery_common import c, supplemental
p = argparse.ArgumentParser()
p.add_argument('expected_head')
p.add_argument('run_directory', type=Path)
a = p.parse_args()
run = a.run_directory.resolve()
if run.exists():
    raise SystemExit('Recovery run directory must be new')
current = c.capture(a.expected_head)
extra = supplemental(current)
c.check_space()
run.mkdir(parents=True, exist_ok=False)
c.write_new(run / 'source-inputs-before.json', current)
c.write_new(run / 'recovery-inputs-before.json', extra)
print(str(run))
