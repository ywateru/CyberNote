#!/usr/bin/env python3
"""Future local adhoc derived bundle; preserved original is never edited."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import common as c

p = argparse.ArgumentParser()
p.add_argument('expected_head')
p.add_argument('run_directory', type=Path)
a = p.parse_args()
run = a.run_directory.resolve()
before = json.loads((run / 'source-inputs-before.json').read_text())
if not all(c.same_inputs(before, c.capture(a.expected_head)).values()):
    raise SystemExit('Frozen source inputs/environment changed')
c.check_space()
original = json.loads((run / 'mac-original-identity.json').read_text())
source = Path(original['preservedApp'])
derived = Path('/private/tmp/notes-unified-candidate04-' + run.name + '-mac-sealed.app')
archive = derived.with_suffix('.zip')
if derived.exists() or archive.exists():
    raise SystemExit('Refuse overwrite derived bundle/archive')
old = c.tree(source)
subprocess.run(['/usr/bin/ditto', str(source), str(derived)], check=True)
sign = c.command(['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', str(derived)])
verify = c.command(['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(derived)])
displays = [c.command(['/usr/bin/codesign', '-d', '--verbose=4', str(derived)]), c.command(['/usr/bin/codesign', '-d', '--entitlements', '-', str(derived)]), c.command(['/usr/bin/codesign', '-d', '-r-', str(derived)])]
c.write_new(run / 'mac-sealed-signature.json', {'at': c.now(), 'sign': sign, 'verify': verify, 'displays': displays})
if sign['exit'] or verify['exit']:
    raise SystemExit('Signing failure retained; no successful sealed identity')
new = c.tree(derived)
if c.tree(source) != old:
    raise SystemExit('Preserved original changed')
oldmap, newmap = ({r['path']: r for r in rows} for rows in [old, new])
changes = [{'path': p, 'before': oldmap.get(p), 'after': newmap.get(p)} for p in sorted(oldmap.keys() | newmap.keys()) if oldmap.get(p) != newmap.get(p)]
if {r['path'] for r in changes} - {'Contents/MacOS/notes-clone', 'Contents/_CodeSignature/CodeResources'}:
    c.write_new(run / 'mac-unexpected-sealing-changes.json', changes)
    raise SystemExit('Unexpected signing payload change; review without blessing')
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(derived), str(archive)], check=True)
result = {'at': c.now(), 'expectedHead': a.expected_head, 'sourceAggregate': before['aggregate'], 'sourceApp': str(source), 'derivedApp': str(derived), 'preservedOriginalUnchanged': True, 'executable': c.identity(derived / 'Contents/MacOS/notes-clone'), 'bundleFiles': new, 'bundleAggregate': hashlib.sha256(''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in new).encode()).hexdigest(), 'changes': changes, 'archive': c.identity(archive), 'scope': 'Complete local adhoc bundle signature only. No Developer ID, notarization, distribution, TCC permission or runtime acceptance claim.'}
c.write_new(run / 'mac-sealed-identity.json', result)
print({k: v for k, v in result.items() if k not in ['bundleFiles', 'changes']})
