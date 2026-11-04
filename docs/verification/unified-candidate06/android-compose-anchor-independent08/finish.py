"""Complete only embedded-resource, process and final identity gates after package checkpoint."""
from pathlib import Path
from html.parser import HTMLParser
import datetime, json, os, runpy

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/unified-candidate06/android-compose-anchor-independent08'
n = runpy.run_path(str(OUT / 'verify.py'), run_name='independent_definitions_only')
load, ident, relident, aggregate = (n[k] for k in ['load', 'ident', 'relident', 'aggregate'])
checkpoint = load(OUT / 'package-checkpoint.json')
checks = checkpoint['checks']
assert len(checks) == 388 and all(r['passed'] for r in checks)

def check(name, ok):
    checks.append({'name': name, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(name)

class Tokens(HTMLParser):
    void = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tokens = []
    def handle_decl(self, decl):
        self.tokens.append(['decl', decl.lower()])
    def handle_starttag(self, tag, attrs):
        self.tokens.append(['start', tag, sorted([[k, '' if v is None else v] for k,v in attrs])])
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.void:
            self.handle_endtag(tag)
    def handle_endtag(self, tag):
        self.tokens.append(['end', tag])
    def handle_data(self, data):
        if data.strip():
            self.tokens.append(['text', data])
    def handle_comment(self, data):
        self.tokens.append(['comment', data])

f = load(n['RUN'] / 'input-freeze.json')
c = load(n['ATT'] / 'collection/result.json')
b = load(n['ATT'] / 'result.json')
embedded = load(OUT / 'embedded-assets-audit.json')
entry = next(r for r in c['allZipEntries'] if r['path'] == embedded['library'])
check('decoded native resource library exact streamed APK member', embedded['librarySha256'] == entry['sha256'])
check('all three bounded embedded frontend resources decoded', embedded['status'] == 'DECODED' and len(embedded['assets']) == 3)
for row in embedded['assets']:
    dist = ROOT / 'dist' / row['path']
    extracted = OUT / 'extracted-assets' / row['path']
    check('decoded asset complete identity ' + row['path'], ident(extracted)['bytes'] == row['exactMatch']['bytes'] and ident(extracted)['sha256'] == row['exactMatch']['sha256'])
    check('exact current dist reference ' + row['path'], ident(dist)['bytes'] == row['expectedBytes'] and ident(dist)['sha256'] == row['expectedSha256'])
    if row['path'] != 'index.html':
        check('complete embedded dist byte equality ' + row['path'], extracted.read_bytes() == dist.read_bytes())

left, right = Tokens(), Tokens()
left.feed((ROOT / 'dist/index.html').read_text())
right.feed((OUT / 'extracted-assets/index.html').read_text())
check('HTML full canonical tokens equal after compiler serialization', left.tokens == right.tokens)
check('HTML accurate references only', any(t[0]=='start' and t[1]=='script' and ['src','/assets/index-B5XVqrGq.js'] in t[2] for t in right.tokens) and any(t[0]=='start' and t[1]=='link' and ['href','/assets/index-CcN0EZLg.css'] in t[2] for t in right.tokens))
n['record']('embedded-html-tokens.json', {'dist':ident(ROOT/'dist/index.html'), 'embedded':ident(OUT/'extracted-assets/index.html'), 'equal':True, 'tokens':right.tokens, 'normalization':'HTMLParser tokenization; doctype case, whitespace-only data, void-tag syntax and boolean-attribute serialization normalized; text, tag order, attributes and values retained.'})
group = load(OUT / 'fresh-owned-group-check.json')
check('fresh exact owned process groups absent', group['exitCode']==0 and group['checkedOwnedGroupIds']==[61080,61630] and group['remainingOwnedGroupMembers']==[])
initial = load(OUT/'input-manifest.json')['files']
check('all351 original protected files unchanged',len(initial)==351 and all(relident(ROOT/r['path'])==r for r in initial))
current=[]
for r in f['files']:
    p=ROOT/r['path'];v=relident(p)
    if p.is_symlink():v['symlinkTarget']=os.readlink(p)
    current.append(v)
check('all323 frozen current inputs unchanged at close',current==f['files'] and aggregate(current)==n['INPUT'])
n['record']('input-close.json',{'protectedFileCount':len(initial),'protectedChanged':[],'currentInputCount':len(current),'currentInputsChanged':[],'checkedOwnedGroupIds':[61080,61630],'remainingOwnedGroupMembers':[]})
result={'schema':1,'startedAt':checkpoint['startedAt'],'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'pass','stop':True,'conclusion':'PASS: exact Android08 source, package, native embedded frontend, offline model, isolation and signature gates','sourceHead':n['SOURCE'],'freezeSha256':n['FREEZE'],'productFiles':304,'inputFiles':323,'productAggregate':n['PRODUCT'],'inputAggregate':n['INPUT'],'checks':checks,'assertions':len(checks),'failed':0,'protectedFiles':len(initial),**checkpoint['detail'],'embeddedAssetsAudit':ident(OUT/'embedded-assets-audit.json'),'embeddedHtmlTokens':ident(OUT/'embedded-html-tokens.json'),'freshOwnedGroupCheck':ident(OUT/'fresh-owned-group-check.json'),'processQueryContinuation':'Package checks checkpointed once; default host process query denied before output. Original denial preserved; only narrow authorized group query retried. No package checks repeated.','limits':['Source ID supplied by root; exact root authorization, freeze, four snapshots and all323 current hashes. No independent Git object proof.','No build, sign write, launch, GUI/ADB, installation, DB, downloads or shared-cache operations.','Frozen environment/cache/model records compared without re-probing shared caches.','CSS/JS complete embedded bytes equal dist; serialized HTML differs in bytes and all canonical tokens match. No independent frontend rebuild.','Certificate compatibility supports later upgrade; no device upgrade, runtime, native interaction, persistence or pixel acceptance.'],'sharedTargetAndCache':'not acquired; no build/cache use; resources released'}
n['record']('result.json',result)
print(json.dumps({'status':'PASS / READY STOP','assertions':len(checks),'protectedFiles':len(initial),'result':ident(OUT/'result.json')}))
