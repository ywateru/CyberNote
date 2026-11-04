"""Audit the single saved independent run and seal only reviewer-owned files."""
from pathlib import Path
import hashlib, json, shutil
ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/app-001-body-vertical-independent-03'
REPORT = ROOT / 'docs/plan/reviews/app-001-body-vertical-03.md'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3
def sha(b):
    return hashlib.sha256(b).hexdigest()
def ident(p):
    b = p.read_bytes()
    return {'path': str(p.relative_to(ROOT)), 'bytes': len(b), 'sha256': sha(b)}
r = json.loads((OUT / 'render-run01/result.json').read_text())
c = json.loads((OUT / 'render-command.json').read_text())
a = json.loads((OUT / 'source-audit.json').read_text())
assert r['pass'] and c['exitCode'] == 0 and not c['stderr']
assert r['candidateSource'] == a['source'] == 'b2f3570783361a5754e3a213730a72d201ddde7a'
assert r['candidateCssSHA256'] == a['candidateCssSHA256']
assert r['baselineCssSHA256'] == a['baselineCssSHA256']
assert r['baselineHead'] == a['productBaseline']
assert len(r['scenarios']) == 72 and not r['errors'] and not r['externalRequests']
assert r['support'] == {'guard': True, 'has': True}
assert r['sourceCorpora'] == [{'path': i['path'], 'sha256': i['sha256']} for i in a['sourceCorpora']]
active = [x for x in r['scenarios'] if x['active']]
assert len(active) == 6
assert {x['name'] for x in active} == {'plain', 'empty-placeholder', 'empty-between', 'marks', 'body-corpus', 'punctuation-corpus'}
assert all(x['context'] == 'mac-main' for x in active)
identity = {'editor': True, 'view': True, 'rootDOM': True}
for x in r['scenarios']:
    b, n = x['before'], x['after']
    assert b['identity'] == n['identity'] == identity
    assert b['document'] == n['document'] and b['selection'] == n['selection']
    assert n['guardMatches'] == x['active']
    assert b['ancestors'] == n['ancestors'] and b['excluded'] == n['excluded']
    if x['active']:
        assert n['root']['style']['paddingTop'] == '2px'
        assert len(b['paragraphs']) == len(n['paragraphs'])
        for old, new in zip(b['paragraphs'], n['paragraphs']):
            assert new['style']['fontSize'] == '13px'
            assert new['style']['lineHeight'] == new['style']['minHeight'] == '17px'
            assert old['range'][2] == new['range'][2]
            assert len(old['lineRects']) == len(new['lineRects'])
    else:
        for key in ['root', 'children', 'paragraphs', 'marks']:
            assert b[key] == n[key]
t = r['transition']
assert [t[k]['guardMatches'] for k in ['before','heading','restored']] == [True,False,True]
assert [t[k]['root']['style']['paddingTop'] for k in ['before','heading','restored']] == ['2px','0px','2px']
assert t['before']['document'] == t['restored']['document']
assert all(t[k]['identity'] == identity for k in t)
assert all(t[k]['selection'] == t['before']['selection'] for k in t)
w = r['syntheticWidget']
assert not w['present']['guardMatches'] and w['removed']['guardMatches']
assert w['present']['children'][0]['tag'] == 'SPAN'
assert 'ProseMirror-widget' in w['present']['children'][0]['classes']
assert w['present']['document'] == w['removed']['document'] == t['restored']['document']
assert all(w[k]['identity'] == identity for k in w)
assert all(w[k]['selection'] == t['before']['selection'] for k in w)
assert ident(OUT / 'check-pinned-render.mjs') == a['fixturePinned']
audit = {'source': a['source'], 'result': ident(OUT / 'render-run01/result.json'),
         'command': ident(OUT / 'render-command.json'), 'singleRunExitCode': c['exitCode'],
         'browser': r['browser'], 'scenarios': 72, 'active': 6, 'excluded': 66,
         'contextCounts': {k: sum(x['context'] == k for x in r['scenarios']) for k in ['mac-main','phone','wide-android','independent']},
         'jsonAndSelectionUnchangedAcrossCss': True, 'editorViewRootDOMIdentity': True,
         'headingTransitionAndDirectWidgetBoundary': True, 'pageErrors': r['errors'],
         'externalRequests': r['externalRequests'], 'freeBefore': c['freeBefore'], 'freeAfter': c['freeAfter'],
         'nativeOrPixelAcceptance': False}
with (OUT / 'render-audit.json').open('x') as f:
    f.write(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
paths = sorted([p for p in OUT.rglob('*') if p.is_file() and p.name != 'manifest.json'] + [REPORT])
files = [ident(p) for p in paths]
for p in paths:
    if p.suffix in ['.py','.md','.mjs','.json']:
        assert all(line == line.rstrip() for line in p.read_text().splitlines()), str(p)
aggregate = sha(''.join(f"{i['path']}\t{i['bytes']}\t{i['sha256']}\n" for i in files).encode())
manifest = {'source': a['source'], 'decision': 'SOURCE-READY bounded Mac all-paragraph CSS candidate only',
            'files': files, 'fileCount': len(files), 'totalBytes': sum(i['bytes'] for i in files),
            'aggregateAlgorithm': 'SHA256 of sorted path TAB bytes TAB SHA256 LF records; manifest excludes itself',
            'aggregateSHA256': aggregate}
with (OUT / 'manifest.json').open('x') as f:
    f.write(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'manifest': ident(OUT / 'manifest.json'), 'fileCountIncludingManifest': len(files)+1,
                  'totalBytesIncludingManifest': manifest['totalBytes']+(OUT/'manifest.json').stat().st_size,
                  'aggregateSHA256': aggregate, 'ownedFiles': [i['path'] for i in files]+[str((OUT/'manifest.json').relative_to(ROOT))]}, ensure_ascii=False, indent=2))
