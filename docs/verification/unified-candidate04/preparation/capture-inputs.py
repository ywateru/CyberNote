#!/usr/bin/env python3
"""Run only after root authorizes final source SHA and recorded generation preflight."""
import argparse
import common as c

p = argparse.ArgumentParser()
p.add_argument('expected_head')
p.add_argument('output')
a = p.parse_args()
c.check_space()
result = c.capture(a.expected_head)
c.write_new(a.output, result)
print({k: result[k] for k in ['head', 'count', 'aggregate']})
