"""Only save matches for the exact previously recorded build/collector groups."""
from pathlib import Path
import datetime, json, subprocess

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE = ROOT / 'docs/verification/unified-candidate06'
ATT = BASE / 'android-compose-anchor-build08/android-attempt01'
OUT = BASE / 'android-compose-anchor-independent08'
build = json.loads((ATT / 'result.json').read_text())
collector = json.loads((ATT / 'collection/result.json').read_text())
groups = sorted({build['ownedProcessGroup']} | {c['ownedProcessGroup'] for c in collector['commands']})
assert groups == [61080, 61630]
argv = ['/bin/ps', '-axo', 'pid=,pgid=,comm=']
p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
remaining = [r.strip() for r in p.stdout.splitlines() if len(r.split(None, 2)) >= 2 and int(r.split(None, 2)[1]) in groups]
value = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'argv': argv,
         'exitCode': p.returncode, 'deadlineSeconds': 15, 'checkedOwnedGroupIds': groups,
         'remainingOwnedGroupMembers': remaining, 'stderr': p.stderr,
         'scope': 'Only matching owned groups retained; all other process rows discarded.'}
name = 'fresh-owned-group-check.json' if p.returncode == 0 else 'owned-group-permission-attempt.json'
with (OUT / name).open('x') as f:
    json.dump(value, f, indent=2)
    f.write('\n')
print(json.dumps(value))
assert p.returncode == 0 and not remaining
