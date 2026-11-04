#!/usr/bin/env python3
"""Future explicit platform freeze; runs version tools, never platform builds."""
import argparse
from pathlib import Path
import common as c


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--authorization', type=Path, required=True)
    a = c.authorization(p.parse_args().authorization)
    run = Path(a['runDirectory'])
    c.check_space(Path(a['root']))
    if run.exists():
        raise RuntimeError('Freeze run directory must be new and exclusive')
    run.parent.mkdir(parents=True, exist_ok=True)
    run.mkdir()
    try:
        with c.lock_build():
            before = c.capture(a)
            c.write_new(run / 'input-freeze.json', before)
            c.write_new(run / 'freeze-summary.json', {
                'at': c.now(), 'stage': a['stage'], 'sourceHead': a['sourceHead'],
                'productAggregate': a['productAggregate'], 'inputAggregate': before['aggregate'],
                'freeze': c.identity(run / 'input-freeze.json'),
                'status': 'FROZEN ONLY; root must review exact file SHA before authorizing build'})
    except BaseException as error:
        c.record_new(run / 'freeze-failure.json', {'at': c.now(), 'error': repr(error), 'authorization': a})
        raise
    print(c.identity(run / 'input-freeze.json'))


if __name__ == '__main__':
    main()
