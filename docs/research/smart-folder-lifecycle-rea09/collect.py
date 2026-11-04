#!/usr/bin/env python3
"""Finite identity/excerpt collection; never opens a database or target process."""
import hashlib, json
from pathlib import Path

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/research/smart-folder-lifecycle-rea09'
INPUTS = [
    '/System/Applications/Notes.app/Contents/MacOS/Notes',
    str(ROOT / 'references/desktop/rea-evidence-initial.json'),
    str(ROOT / 'references/desktop/README.md'),
    str(ROOT / 'references/desktop/macos26-smart-folder-tags.ax.txt'),
    str(ROOT / 'references/desktop/macos26-smart-folder-filter-menu.ax.txt'),
    str(ROOT / 'docs/research/smart-folder-original-runtime07/README.md'),
    str(ROOT / 'docs/research/smart-folder-original-runtime07/06-original-before-quit-identity.json'),
    str(ROOT / 'docs/research/smart-folder-original-runtime07/09-original-cold-identity.json'),
    str(ROOT / 'docs/research/smart-folder-original-runtime07-independent-01/README.md'),
    str(ROOT / 'docs/research/smart-folder-delivery07.md'),
    str(ROOT / 'docs/ui/local-features.md'),
    '/Users/water/.agents/skills/reverse-engineer-anything/SKILL.md',
    '/Users/water/.agents/skills/reverse-engineer-anything/references/connection-and-recovery.md',
]

def digest(p):
    b = Path(p).read_bytes()
    return {'path': p, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}

opened = [digest(p) for p in INPUTS]
(OUT / 'inputs-open.json').write_text(json.dumps(opened, ensure_ascii=False, indent=2)+'\n')
selected = [
    ('references/desktop/macos26-smart-folder-tags.ax.txt', 1, 25),
    ('references/desktop/macos26-smart-folder-filter-menu.ax.txt', 1, 27),
    ('docs/ui/local-features.md', 69, 125),
    ('docs/ui/local-features.md', 131, 133),
]
excerpts = []
for rel, start, end in selected:
    p = ROOT / rel
    lines = p.read_text().splitlines()
    excerpts.append({'source': str(p), 'source_sha256': digest(str(p))['sha256'],
                     'start_line': start, 'end_line': end,
                     'lines': [{'line': i, 'text': lines[i-1]} for i in range(start, min(end, len(lines))+1)]})
(OUT / 'source-excerpts.json').write_text(json.dumps(excerpts, ensure_ascii=False, indent=2)+'\n')
prior = json.loads((ROOT / 'references/desktop/rea-evidence-initial.json').read_text())
identity = {'target_path': INPUTS[0], 'actual_digest': opened[0],
            'canonical_app_exists': Path('/System/Applications/Notes.app').is_dir(),
            'mistyped_sys_app_exists': Path('/Sys/Applications/Notes.app').exists(),
            'prior_saved_bundle_counts': {k: len(v) for k, v in prior.items()},
            'target_executed': False, 'database_opened': False,
            'new_target_session_opened': False}
(OUT / 'identity.json').write_text(json.dumps(identity, ensure_ascii=False, indent=2)+'\n')
closed = [digest(p) for p in INPUTS]
(OUT / 'inputs-close.json').write_text(json.dumps({'unchanged': opened == closed, 'inputs': closed}, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'inputs': len(opened), 'unchanged': opened == closed, 'target_sha256': opened[0]['sha256'], 'prior_bundle_record_count': len(prior['records'])}))
assert opened == closed
