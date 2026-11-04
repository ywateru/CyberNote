#!/usr/bin/env python3
"""Read-only input, exact git blob and preserved artifact checks. No platform tools."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent
PREP = ROOT / 'docs/verification/unified-candidate06/preparation'
sys.path.insert(0, str(PREP))
import common as c

def load(path):
    return json.loads(path.read_text())

def check_rows(rows):
    checked = []
    for row in rows:
        actual = c.identity(ROOT / row['path'])
        assert actual['bytes'] == row['bytes'] and actual['sha256'] == row['sha256'], row['path']
        checked.append({**actual, 'path': row['path']})
    return checked

def main():
    target = OUT / sys.argv[1]
    assert not target.exists()
    assert shutil.disk_usage(ROOT).free >= 2 * 1024 ** 3
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assert head == '93e0e13da6e3e0efe2450684f9f909e795aeda6b', head
    author = ROOT / 'docs/verification/tools-android-offline-init14'
    manifest_path = author / 'tool-manifest.json'
    manifest = load(manifest_path)
    assert c.sha_file(manifest_path) == 'a1634e41759706d2e654e71c9196e5654d5230cb0940084a6e62d6a5c3efe0f3'
    tools = check_rows(manifest['files'])
    assert len(tools) == 14 and c.aggregate(tools) == manifest['aggregate'] == 'e4ac8930de9a43a86f53c4a33d6eec088fb4f802db27e2de2c00d40f16e20a3e'
    for row in tools:
        blob = subprocess.check_output(['git', 'show', head + ':' + row['path']], cwd=ROOT)
        assert hashlib.sha256(blob).hexdigest() == row['sha256'], row['path']
    before, after = (load(author / name) for name in ['inputs-before.json', 'inputs-after.json'])
    assert before['inputs'] == after['inputs'] and before['protected'] == after['protected']
    inputs, protected = check_rows(before['inputs']), check_rows(before['protected'])
    assert len(inputs) == 320 and c.aggregate(inputs) == before['inputAggregate'] == 'abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6'
    freeze = load(ROOT / 'docs/verification/unified-candidate06/mac-smart-u-build09/input-freeze.json')
    product = check_rows(freeze['productFiles'])
    assert len(product) == 301 and c.aggregate(product) == before['productAggregate'] == 'b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897'
    diff = subprocess.check_output(['git', 'diff', '--name-only', '8e8fe7e320e34a2b9c27bf7c7e794662ad988da4', head, '--'] + [r['path'] for r in product], cwd=ROOT, text=True)
    assert not diff, diff
    historical = check_rows(load(ROOT / 'docs/verification/unified-candidate06/mac-smart-u-independent09/input-manifest.json')['files'])
    apps = []
    for item in after['completeMacApps']:
        aggregate = c.aggregate(c.tree(ROOT / item['path']))
        assert aggregate == item['aggregate'] == item['expectedAggregate']
        apps.append({**item, 'actualAggregate': aggregate})
    apk = check_rows([after['preservedAndroidPriorApk']])
    result = dict(status='pass', head=head, freeBytes=shutil.disk_usage(ROOT).free,
                  manifestSha256=c.sha_file(manifest_path), toolAggregate=c.aggregate(tools), tools=tools,
                  inputCount=len(inputs), inputAggregate=c.aggregate(inputs), inputs=inputs,
                  productCount=len(product), productAggregate=c.aggregate(product), fix13ProductGitTreeUnchanged=True,
                  protected=protected, historicalMacRecords=historical, completeMacApps=apps, preservedAndroidPriorApk=apk)
    c.record_new(target, result)
    print(json.dumps({k: result[k] for k in ['status','head','freeBytes','toolAggregate','inputCount','inputAggregate','productCount','productAggregate']}))

if __name__ == '__main__':
    main()
