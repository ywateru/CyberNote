"""Additional deterministic cases executed by exact extracted production methods."""
import hashlib
import json
import math
import os
from pathlib import Path
import random
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
SCRATCH = ROOT / 'scratch/exact-run01'
assert os.statvfs(ROOT).f_bavail * os.statvfs(ROOT).f_frsize >= 2 * 1024**3
ACTIONS = ['newNote', 'format', 'checklist', 'table', 'attachment', 'share', 'more']
AUX = ['newFolder', 'toggleSidebar', 'viewOptions']
rng = random.Random(20261104)
cases = []
for i in range(960):
    layout = rng.choice(['threeColumn'] * 5 + ['galleryBrowse', 'galleryExpanded', 'independentNote'])
    actions = [a for a in AUX + ACTIONS if rng.random() < .9]
    if layout == 'galleryExpanded':
        actions.append('backToGallery')
    cases.append(dict(name=f'independent-{i:04d}', width=rng.randrange(240, 2561) + rng.choice([0, .125, .5]),
                      layout=layout, sidebarVisible=rng.choice([True, False]),
                      sidebarWidth=rng.choice([100, 184, 228, 272, 320]),
                      listWidth=rng.choice([30, 160, 229, 280, 347, 440]),
                      actions=actions, search=rng.choice(['present'] * 5 + ['missing', 'null']),
                      fullSize=rng.choice([True, False])))
# Every complete-group candidate is tested across independently varied boundaries,
# including subpoint widths and no helper controls.
for side in [184, 228, 272, 320]:
    for listing in [160, 229, 280, 347, 440]:
        for width in [1100.125, 1392, 1720.5, 2048]:
            cases.append(dict(name=f'complete-{side}-{listing}-{width}', width=width, layout='threeColumn',
                              sidebarVisible=True, sidebarWidth=side, listWidth=listing,
                              actions=AUX + ACTIONS, search='present', fullSize=True))
for width in [900.125, 950.875, 951.125, 1179.125, 1800]:
    cases.append(dict(name=f'no-helpers-{width}', width=width, layout='threeColumn', sidebarVisible=False,
                      sidebarWidth=0, listWidth=280, actions=ACTIONS, search='present', fullSize=True))
executions = {}
for kind in ['baseline', 'candidate']:
    p = subprocess.run([str(SCRATCH / kind)], input=json.dumps(cases), capture_output=True, text=True)
    assert p.returncode == 0, (kind, p.returncode, p.stderr)
    executions[kind] = json.loads(p.stdout)
assert len(cases) == len(executions['baseline']) == len(executions['candidate'])
changed = []
unchanged = []
close = lambda a, b: math.isclose(a, b, rel_tol=0, abs_tol=1e-8)
for config, old, new in zip(cases, executions['baseline'], executions['candidate']):
    eligible = (config['layout'] == 'threeColumn' and config['search'] == 'present'
                and all(a in config['actions'] for a in ACTIONS) and not old['overflow'])
    baseline_width = old['groups'].get('search', {}).get('frame', [0, 0, 0, 0])[2]
    if not eligible or baseline_width <= 325:
        assert old == new, config['name']
        unchanged.append(config['name'])
        continue
    # Check externally visible invariants rather than reproducing the new formula.
    for key in ['overflow', 'visibility', 'titleFrame', 'countFrame', 'titleHidden', 'countHidden', 'rootFrame']:
        assert old[key] == new[key], (config['name'], key)
    for group in ['sidebar', 'view', 'back', 'browse', 'overflow']:
        assert old['groups'].get(group) == new['groups'].get(group), (config['name'], group)
    frames = [new['groups'][g]['frame'] for g in ['new', 'edit', 'share', 'search']]
    nf, ef, sf, qf = frames
    assert nf == old['groups']['new']['frame'], config['name']
    for group in ['new', 'edit', 'share']:
        assert new['groups'][group]['actions'] == old['groups'][group]['actions'], config['name']
        assert new['groups'][group]['frame'][1:] == old['groups'][group]['frame'][1:], config['name']
    assert close(qf[2], 325) and close(qf[0] + qf[2], config['width'] - 8), config['name']
    gap1, gap2 = ef[0] - nf[0] - nf[2], sf[0] - ef[0] - ef[2]
    assert gap1 >= 18 and close(gap1, gap2), config['name']
    assert close(qf[0] - sf[0] - sf[2], 16), config['name']
    assert all(a[0] + a[2] <= b[0] for a, b in zip(frames, frames[1:])), config['name']
    assert new['searchFieldFrame'][1:] == [4, 305, 28], config['name']
    changed.append(config['name'])
result = dict(status='pass', seed=20261104, checks=len(cases), changedCount=len(changed), unchangedCount=len(unchanged),
              changedCases=changed, unchangedCases=unchanged, cases=cases,
              methodBinarySha256={kind: hashlib.sha256((SCRATCH / kind).read_bytes()).hexdigest() for kind in executions},
              limits=['Recording view/window ports; exact extracted production widthFor/layout only.',
                      'No actual AppKit controls, field editor, IME, events, menus, hit dispatch, GUI or pixels.'])
(EVIDENCE / 'independent-matrix-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['status', 'seed', 'checks', 'changedCount', 'unchangedCount']}))
