#!/usr/bin/env python3
"""Independent read-only Mac21 source/freeze audit; never builds or runs apps."""
import datetime
import hashlib
import json
import os
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent
SOURCE = 'bd51ae6aae37cf2f9576bf50e44e568c67a17427'
REVIEWED = '1ddeca7cb51727cd40203101d5447800bd43da04'
FREEZE = '5a01650d4a621540eb03f3f99b2a37bae366cfaa7cdcc23fef0d1f575f98c1f4'
PRODUCT = 'cd01c9943be7fe95dacb108716f723f0dcdf8963d375788e91e529aca63a273c'
INPUT = '22cbefc567271d7b74fd5e1dc905c21fb53733b2c64e1e460c9cd4396df434e1'
BASE = ROOT / 'docs/verification/unified-candidate06'
PREP = BASE / 'recording-quit68-native69-preparation'
RUN = BASE / 'mac-recording-quit-build21'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def ident(path):
    path = Path(path)
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return {'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}

def load(path):
    return json.loads(Path(path).read_text())

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def aggregate(rows):
    return sha(''.join(row['sha256'] + '  ' + row['path'] + '\n' for row in rows).encode())

checks = []
def check(label, condition):
    assert condition, label
    checks.append(label)

def verify_rows(base, rows):
    for row in rows:
        path = base / row['path']
        actual = {'path': row['path'], **ident(path)}
        if path.is_symlink():
            actual['symlinkTarget'] = os.readlink(path)
        assert actual == row, (path, actual, row)

def handler_blocks(text):
    return [match.group(1) for match in re.finditer(r'tauri::generate_handler!\[(.*?)\]', text, re.S)]

def committed_text(source, path):
    return git('show', source + ':' + path).decode()

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
head = git('rev-parse', 'HEAD').decode().strip()
freeze_path = RUN / 'input-freeze.json'
f = load(freeze_path)
a = load(PREP / 'mac-authorization.json')
plan = load(PREP / 'input-plan.json')
cap = load(PREP / 'command-capability-audit.json')
old = load(BASE / 'mac-recording-media-build20/input-freeze.json')
old_auth = old['authorization']
old_source = old['head']
review = load(ROOT / 'docs/verification/mac-recording-quit6869/independent/source-binding.json')
review_inputs = load(ROOT / 'docs/verification/mac-recording-quit6869/independent/input-manifest.json')
review_manifest = load(ROOT / 'docs/verification/mac-recording-quit6869/independent/evidence-manifest.json')

check('exact freeze bytes and SHA', ident(freeze_path) == {'bytes': 353304, 'sha256': FREEZE})
check('exact root source identity', head == SOURCE == f['head'] == a['sourceHead'] == plan['sourceHead'] == cap['sourceHead'])
check('tracked root and index clean', git('status', '--porcelain', '--untracked-files=no').strip() == b'')
check('nine authorization fields exact', set(a) == {'schema', 'stage', 'root', 'sourceHead', 'productAggregate', 'productPaths', 'inputPaths', 'runDirectory', 'artifactDirectory'} and a == f['authorization'])
check('authorization roots and stage', a['schema'] == 1 and a['stage'] == 'mac' and a['root'] == str(ROOT) and a['runDirectory'] == str(RUN) and a['artifactDirectory'] == str(ROOT / 'artifacts/unified-candidate06/mac-recording-quit-build21'))
for label, paths, rows in [('products', a['productPaths'], f['productFiles']), ('inputs', a['inputPaths'], f['files'])]:
    check(label + ' sorted safe unique complete paths', paths == sorted(set(paths)) == [row['path'] for row in rows] and all(not Path(p).is_absolute() and '..' not in Path(p).parts for p in paths))
    verify_rows(ROOT, rows)
    checks.append(label + ' all current bytes and symlink targets exact')
check('366 products and 387 inputs', len(f['productFiles']) == 366 and len(f['files']) == 387)
check('product aggregate exact', aggregate(f['productFiles']) == f['productAggregate'] == a['productAggregate'] == plan['productAggregate'] == PRODUCT)
check('input aggregate exact', aggregate(f['files']) == f['aggregate'] == plan['inputAggregate'] == INPUT)
check('plan complete rows exact', f['productFiles'] == plan['productFiles'] and f['files'] == plan['inputFiles'])
check('baseline freeze identity exact', ident(plan['baselineFreeze']['path']) == {k: plan['baselineFreeze'][k] for k in ['bytes', 'sha256']})
check('baseline authorization identity exact', ident(plan['baselineAuthorization']['authorization']['path']) == {k: plan['baselineAuthorization']['authorization'][k] for k in ['bytes', 'sha256']})
old_products, old_inputs = set(old_auth['productPaths']), set(old_auth['inputPaths'])
products, inputs = set(a['productPaths']), set(a['inputPaths'])
added = {'plugins/tauri-plugin-notes-ui/macos/termination.m', 'scripts/check-mac-recording-native-quit69.m', 'scripts/check-mac-recording-native-quit69.py', 'scripts/check-recording-quit68-app.mjs', 'scripts/check-recording-quit68-native.py'}
modified = {'plugins/tauri-plugin-notes-ui/build.rs', 'plugins/tauri-plugin-notes-ui/src/lib.rs', 'plugins/tauri-plugin-notes-ui/src/macos.rs', 'src-tauri/src/lib.rs'}
deleted = {'src-tauri/capabilities/macos-recording-access.json', 'src-tauri/capabilities/recording-window.json'}
check('complete Mac20 union retained', not old_products - products and not old_inputs - inputs)
check('exact five product and input additions', products - old_products == inputs - old_inputs == added and plan['addedProductPaths'] == sorted(added) and plan['addedInputPaths'] == sorted(added))
check('historical two child capabilities remain absent', not deleted & inputs and not deleted & products and all(not (ROOT / p).exists() for p in deleted))
old_rows, new_rows = {row['path']: row for row in old['files']}, {row['path']: row for row in f['files']}
old_only = old_inputs - old_products
check('21 historical input-only paths byte identical', len(old_only) == 21 and inputs - products == old_only and all(old_rows[p] == new_rows[p] for p in old_only))
changes = {p for p in old_inputs if old_rows[p] != new_rows[p]}
check('exact four existing input modifications', changes == modified and plan['changedExistingInputPathsFromMac20'] == sorted(modified))
check('transition counts exact', sum(old_rows[p] == new_rows[p] for p in old_inputs) == 378 and len(changes) == 4 and len(added) == 5)
tracked = set(git('ls-tree', '-r', '--name-only', SOURCE).decode().splitlines())
rules = plan['construction']
selected = {p for p in tracked if any(p.startswith(prefix) for prefix in rules['prefixes']) or p in rules['names']}
plugins = {str(p.relative_to(ROOT)) for p in (ROOT / 'plugins').rglob('*') if p.is_file() and not set(p.relative_to(ROOT / 'plugins').parts) & set(rules['pluginExclusions'])}
check('independently rebuilt full product set', products == old_products | selected | plugins | set(plan['explicitProductExceptions']))
check('all 78 plugin files included', len(plugins) == 78 and plugins <= products)
check('all 366 products Git tracked', products <= tracked)
for path in sorted(products):
    data = git('show', SOURCE + ':' + path)
    assert ident(ROOT / path) == {'bytes': len(data), 'sha256': sha(data)}, path
checks.append('all 366 products equal exact source Git objects')
check('review binding exact source', review['head'] == REVIEWED and review['count'] == 275 and review_inputs['sourceHead'] == REVIEWED and review_inputs['count'] == 356)
for row in review['records']:
    assert ident(ROOT / row['path']) == {key: row[key] for key in ['bytes', 'sha256']}, row['path']
for row in review_inputs['inputs']:
    assert ident(ROOT / row['path']) == {key: row[key] for key in ['bytes', 'sha256']}, row['path']
checks.append('all 275 reviewed production and 356 reviewed inputs equal frozen source')
check('review input aggregate exact', aggregate(review_inputs['inputs']) == review_inputs['aggregateSha256'])
for row in review_manifest['records']:
    assert ident(ROOT / row['path']) == {key: row[key] for key in ['bytes', 'sha256']}, row['path']
check('112 independent evidence records byte identical', len(review_manifest['records']) == 112 and aggregate(review_manifest['records']) == review_manifest['aggregateSha256'])
check('source changes since independent review docs only', all(p.startswith('docs/') for p in git('diff', '--name-only', REVIEWED, SOURCE).decode().splitlines()))

cap_paths = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'src-tauri/capabilities').glob('*.json'))
check('complete three capability set unchanged', cap_paths == [row['path'] for row in cap['capabilitiesAfter']] and len(cap_paths) == 3 and cap['capabilitiesBefore'] == cap['capabilitiesAfter'])
for row in cap['capabilitiesAfter']:
    path = row['path']
    check('capability ' + path, ident(ROOT / path) == {key: row[key] for key in ['bytes', 'sha256']} and load(ROOT / path) == row['content'] and git('show', old_source + ':' + path) == (ROOT / path).read_bytes())
micro = load(ROOT / 'src-tauri/capabilities/macos-notes-ui.json')
check('main/note microphone preflight unchanged', micro['windows'] == ['main', 'note-*'] and micro['platforms'] == ['macOS'] and 'notes-ui:allow-recording-access' in micro['permissions'] and cap['addedPermissionGrants'] == [] and cap['removedPermissionGrants'] == [])
for path in ['src-tauri/src/lib.rs', 'plugins/tauri-plugin-notes-ui/src/lib.rs']:
    current = (ROOT / path).read_text()
    before = committed_text(old_source, path)
    check('complete handler bodies unchanged ' + path, handler_blocks(current) == handler_blocks(before))
    rows = cap['handlerBlocksAfter'] if path == 'src-tauri/src/lib.rs' else cap['pluginHandlerBlocksAfter']
    check('handler audit matches actual source ' + path, handler_blocks(current) == [row['source'] for row in rows])
build_path = 'plugins/tauri-plugin-notes-ui/build.rs'
build_text = (ROOT / build_path).read_text()
declaration = lambda text: re.search(r'tauri_plugin::Builder::new\(&\[(.*?)\]\)', text, re.S).group(1)
check('plugin build command declaration unchanged', declaration(build_text) == declaration(committed_text(old_source, build_path)) == cap['pluginBuildCommandDeclaration'])
check('native bridge compiled and tracked', '.file("macos/termination.m")' in build_text and 'rerun-if-changed=macos/termination.m' in build_text and 'macos::install_termination(app)?;' in (ROOT / 'plugins/tauri-plugin-notes-ui/src/lib.rs').read_text())
check('exact seven retained recording commands', len(cap['retainedRegisteredRecordingCommands']) == 7 and not cap['addedRegisteredRecordingCommands'] and not cap['removedRegisteredRecordingCommands'])
check('registry source unchanged from Mac20', git('show', old_source + ':src-tauri/src/recording_window.rs') == (ROOT / 'src-tauri/src/recording_window.rs').read_bytes())
for row in cap['microphoneGrant']['pluginPermissionResourcesUnchanged'] + cap['unchangedBoundaryFiles']:
    path = row['path']
    assert ident(ROOT / path) == {key: row[key] for key in ['bytes', 'sha256']} and git('show', old_source + ':' + path) == (ROOT / path).read_bytes(), path
checks.append('all listed permission resources and unchanged recording/storage boundaries exact')
for row in cap['changedProductionFiles']:
    path = row['path']
    assert ident(ROOT / path) == {key: row[key] for key in ['bytes', 'sha256']} and git('show', REVIEWED + ':' + path) == (ROOT / path).read_bytes(), path
checks.append('all five changed production paths equal exact reviewed source')
for row in cap['reviewEvidence']:
    assert ident(ROOT / row['path']) == {key: row[key] for key in ['bytes', 'sha256']}, row['path']
checks.append('capability audit frozen review evidence unchanged')
for row in cap['recordingInvokeSites']:
    lines = (ROOT / row['path']).read_text().splitlines()
    assert row['command'] in '\n'.join(lines[row['line'] - 1:row['line'] + 2]), row
for row in cap['nativeGuardReferences']:
    assert row['function'] in (ROOT / row['path']).read_text().splitlines()[row['line'] - 1], row
check('exact invoke and guard references', len(cap['recordingInvokeSites']) == 11 and len(cap['nativeGuardReferences']) == 15)

check('seven frozen tools same as Mac20', f['tools'] == old['tools'] and len(f['tools']) == 7)
for row in f['tools']:
    assert ident(BASE / 'preparation' / row['path']) == {key: row[key] for key in ['bytes', 'sha256']}, row['path']
check('frozen five tool observations same as Mac20', len(f['toolVersions']) == 5 and f['toolVersions'] == old['toolVersions'] and all(row['exit'] == 0 for row in f['toolVersions']))
check('six effective environment values unchanged', f['effectiveBuildEnvironment'] == old['effectiveBuildEnvironment'] == {'ANDROID_HOME': '/Users/water/Library/Android/sdk', 'NDK_HOME': '/Users/water/Library/Android/sdk/ndk/27.2.12479018', 'JAVA_HOME': '/opt/zerobrew/opt/openjdk@17', 'GRADLE_USER_HOME': '/private/tmp/notes-scan-gradle-home', 'CARGO_NET_OFFLINE': 'true', 'CARGO_BUILD_JOBS': '2'})
supplemental = f['supplementalInputs']
check('supplemental identity records unchanged', supplemental == old['supplementalInputs'])
overlay = Path('/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro')
verify_rows(overlay, supplemental['overlayFiles'])
check('overlay two files aggregate exact', len(supplemental['overlayFiles']) == 2 and aggregate(supplemental['overlayFiles']) == supplemental['overlayAggregate'])
distribution = Path(supplemental['distributionPath'])
check('distribution resolution unchanged', str(distribution.resolve()) == supplemental['distributionResolved'])
for row in supplemental['distributionFiles']:
    path = distribution / row['path']
    actual = {'path': row['path'], 'type': 'symlink', 'target': os.readlink(path), 'sha256': sha(os.readlink(path).encode())} if row['type'] == 'symlink' else {'path': row['path'], **ident(path), 'type': 'file', 'mode': path.stat().st_mode & 0o777}
    assert actual == row, path
check('distribution 701 content entries exact', len(supplemental['distributionFiles']) == 701)
ok = supplemental['okFile']
check('distribution completion marker exact', ident(ok['path']) == {key: ok[key] for key in ['bytes', 'sha256']} and str(Path(ok['path']).resolve()) == supplemental['okResolved'])
check('OCR archive records unchanged', f['ocrCache'] == old['ocrCache'])
model_count = 0
for row in f['ocrCache']:
    assert ident(row['path']) == {key: row[key] for key in ['bytes', 'sha256']}, row['path']
    with zipfile.ZipFile(row['path']) as archive:
        for model in row['models']:
            item = archive.getinfo(model['path'])
            data = archive.read(item)
            assert len(data) == model['bytes'] and item.compress_size == model['compressedBytes'] and sha(data) == model['sha256']
            model_count += 1
check('25 frozen OCR model entries exact', model_count == 25)

root_review_path = PREP / 'root-freeze-review.json'
root_review = load(root_review_path)
start_path = RUN / 'build-start.json'
start_record = load(start_path)
check('root direct freeze capture fifteen fields successful', root_review['sourceHead'] == SOURCE and root_review['freezeSha256'] == FREEZE and root_review['rootReadExactFile'] and len(root_review['freshCaptureChecks']) == 15 and all(root_review['freshCaptureChecks'].values()))
check('root direct aggregates and counts match', root_review['productCount'] == 366 and root_review['inputCount'] == 387 and root_review['productAggregate'] == PRODUCT and root_review['inputAggregate'] == INPUT)
check('START exact source freeze attempt and review file identity', start_record['sourceHead'] == SOURCE and start_record['freezeSha256'] == FREEZE and start_record['attempt'] == 'attempt01' and start_record['rootFreezeReview'] == {'path': str(root_review_path), **ident(root_review_path)})
check('frozen input before build exact', all(load(RUN / 'mac-attempt01/inputs-before.json')[key] == f[key] for key in f if key != 'at'))
check('HEAD and tracked state unchanged during input audit', git('rev-parse', 'HEAD').decode().strip() == head and git('status', '--porcelain', '--untracked-files=no').strip() == b'')
result = {'status': 'pass-freeze-only', 'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceHead': SOURCE, 'reviewedProductionSource': REVIEWED, 'freeze': {'path': str(freeze_path), **ident(freeze_path)}, 'authorization': {'path': str(PREP / 'mac-authorization.json'), **ident(PREP / 'mac-authorization.json')}, 'rootFreezeReview': {'path': str(root_review_path), **ident(root_review_path)}, 'startRecord': {'path': str(start_path), **ident(start_path)}, 'counts': {'products': 366, 'inputs': 387, 'historicalInputOnly': 21, 'plugins': 78, 'reviewedProduction': 275, 'reviewedInputs': 356, 'independentEvidenceRecords': 112, 'distributionEntries': 701, 'ocrModels': model_count}, 'productAggregate': PRODUCT, 'inputAggregate': INPUT, 'addedPaths': sorted(added), 'modifiedPaths': sorted(modified), 'historicalInputOnlyPaths': sorted(old_only), 'checks': checks, 'limits': ['Only exact source/freeze/input and recorded START identity; no compilation, new tests, target, GUI, device, microphone, signing or actual audio access.', 'Version observations are frozen records, not rerun. Explicit supplemental inputs read without executing them; not full OS/SDK/transitive reproducibility.', 'Artifacts intentionally not audited until root collector-ready notification. No runtime/persistence/pixel acceptance.', 'User-authorized cleanup of released caches does not remove source evidence; no further dependency on deleted targets. Android original state untouched; old Mac18 audio preservation/recovery not claimed.']}
(OUT / 'freeze-readonly-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'sourceHead', 'counts', 'productAggregate', 'inputAggregate']}, ensure_ascii=False))
