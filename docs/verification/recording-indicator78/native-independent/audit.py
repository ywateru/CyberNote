from pathlib import Path
from html.parser import HTMLParser
import hashlib, json, subprocess, zipfile, plistlib, struct, time, sys

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
assert len(sys.argv) == 2, 'usage: python3 audit.py BUILD_RESULT_JSON'
MANIFEST = Path(sys.argv[1]).resolve()
start = time.monotonic()
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())

def ident(p):
    b = p.read_bytes()
    return {'path': str(p), 'bytes': len(b), 'sha256': sha(b)}

def inventory(app):
    rows = []
    for p in sorted(app.rglob('*')):
        assert not p.is_symlink(), str(p)
        if p.is_file():
            rows.append({'path': str(p.relative_to(app)), 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())})
    return rows

def run(label, argv):
    began = time.monotonic()
    p = subprocess.run(argv, capture_output=True)
    (OUT / (label + '.stdout.txt')).write_bytes(p.stdout)
    (OUT / (label + '.stderr.txt')).write_bytes(p.stderr)
    return {'label': label, 'argv': argv, 'naturalExitCode': p.returncode, 'wallMs': round(1000 * (time.monotonic() - began), 2), 'stdoutSha256': sha(p.stdout), 'stderrSha256': sha(p.stderr)}

x = load(MANIFEST)
assert x['inputBefore'] == x['inputAfter'] and x['inputUnchanged']
assert x['inputBefore'] and len({r['path'] for r in x['inputBefore']}) == len(x['inputBefore'])
tracked = set(subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', x['head']]).decode().splitlines())
input_only = []
tracked_count = 0
for row in x['inputBefore']:
    data = (ROOT / row['path']).read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256'], row
    if row['path'] in tracked:
        assert subprocess.check_output(['git', 'show', x['head'] + ':' + row['path']]) == data, row['path']
        tracked_count += 1
    else:
        input_only.append(row)

ART = Path(x['artifactDirectory'])
original = ART / 'mac-original.app'
derived_exe = Path(x['executable']['path'])
derived = derived_exe.parent.parent.parent
assert derived.parent == ART and derived.suffix == '.app'
original_exe = original / 'Contents/MacOS' / derived_exe.name
before = {a.name: inventory(a) for a in [original, derived]}
assert before[original.name] == x['originalFiles']
assert before[derived.name] == x['derivedFiles']
assert inventory(ROOT / 'src-tauri/target/release/bundle/macos' / derived.name) == x['originalFiles']
old = {r['path']: r for r in before[original.name]}
new = {r['path']: r for r in before[derived.name]}
changed = [p for p in sorted(old.keys() | new.keys()) if old.get(p) != new.get(p)]
assert changed == x['changedPaths']
assert set(changed).issubset({'Contents/MacOS/' + derived_exe.name, 'Contents/_CodeSignature/CodeResources'}), changed
info_bytes = (derived / 'Contents/Info.plist').read_bytes()
assert info_bytes == (original / 'Contents/Info.plist').read_bytes()
info = plistlib.loads(info_bytes)
assert info['CFBundleIdentifier'] == 'com.local.notesclone'
assert info['CFBundleExecutable'] == derived_exe.name and info['CFBundleDisplayName'] == '备忘录'
assert info.get('NSMicrophoneUsageDescription')
archive = Path(x['archive']['path'])
assert ident(archive) == x['archive']
assert ident(derived_exe)['sha256'] == x['executable']['sha256']

ziprows = []
expected = {derived.name + '/' + r['path']: r for r in before[derived.name]}
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    decoded_names = set()
    for entry in z.infolist():
        name = entry.filename if entry.flag_bits & 0x800 else entry.filename.encode('cp437').decode('utf8')
        assert name not in decoded_names
        decoded_names.add(name)
        assert not name.startswith('/') and '..' not in Path(name).parts and '\\' not in name
        if entry.is_dir():
            assert name.startswith(derived.name + '/') or name.startswith('__MACOSX/' + derived.name + '/') or name == '__MACOSX/'
            continue
        data = z.read(entry.filename)
        if name in expected:
            row = expected.pop(name)
            assert len(data) == row['bytes'] and sha(data) == row['sha256']
            assert (entry.external_attr >> 16) & 0o777 == (derived / row['path']).stat().st_mode & 0o777
        else:
            assert name.startswith('__MACOSX/' + derived.name + '/') and Path(name).name.startswith('._') and data[:4] == bytes.fromhex('00051607'), name
        ziprows.append({'name': name, 'bytes': len(data), 'sha256': sha(data)})
    assert not expected, expected

class Tokens(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tokens = []
    def handle_decl(self, d): self.tokens.append(['decl', d.lower()])
    def handle_starttag(self, t, a): self.tokens.append(['start', t, sorted((k, '' if v is None else v) for k, v in a)])
    def handle_startendtag(self, t, a): self.handle_starttag(t, a)
    def handle_endtag(self, t): self.tokens.append(['end', t])
    def handle_data(self, d):
        if d.strip(): self.tokens.append(['data', d])
    def handle_comment(self, d): self.tokens.append(['comment', d])

htmlrecords = []
payloadrecords = []
for label, exe in [('original', original_exe), ('derived', derived_exe)]:
    folder = OUT / (label + '-assets')
    extract = load(folder / 'result.json')
    assert extract['binarySha256'] == sha(exe.read_bytes()) and extract['binaryBytes'] == exe.stat().st_size
    assert [r['path'] for r in extract['records']] == [r['path'] for r in x['frontendFiles']]
    for row in x['frontendFiles']:
        dist = (ROOT / 'dist' / row['path']).read_bytes()
        embedded = (folder / row['path']).read_bytes()
        assert len(dist) == row['bytes'] and sha(dist) == row['sha256']
        record = next(r for r in extract['records'] if r['path'] == row['path'])
        assert record['match']['sha256'] == sha(embedded) and record['match']['bytes'] == len(embedded)
        if row['path'] != 'index.html':
            assert embedded == dist, row['path']
        else:
            a = Tokens(); a.feed(dist.decode()); a.close()
            b = Tokens(); b.feed(embedded.decode()); b.close()
            assert a.tokens == b.tokens
            htmlrecords.append({'label': label, 'rawDistBytes': len(dist), 'rawEmbeddedBytes': len(embedded), 'rawBytesEqual': embedded == dist, 'completeNormalizedTokensEqual': True, 'tokens': a.tokens, 'distSha256': sha(dist), 'embeddedSha256': sha(embedded)})
        assert embedded == (OUT / 'original-assets' / row['path']).read_bytes()
        payloadrecords.append({'label': label, 'path': row['path'], 'decodedBytes': len(embedded), 'decodedSha256': sha(embedded), 'rawDistEqual': embedded == dist})
(OUT / 'html-comparison.json').write_text(json.dumps(htmlrecords, ensure_ascii=False, indent=2) + '\n')

def sections(p):
    data = p.read_bytes()
    magic, cpu, sub, filetype, ncmds, sizecmds, flags, reserved = struct.unpack_from('<8I', data)
    assert magic == 0xfeedfacf and cpu == 0x100000c
    assert 32 + sizecmds <= len(data)
    offset = 32
    rows = []
    for _ in range(ncmds):
        cmd, size = struct.unpack_from('<II', data, offset)
        assert size >= 8 and offset + size <= 32 + sizecmds
        if cmd == 0x19:
            nsects = struct.unpack_from('<I', data, offset + 64)[0]
            assert 72 + nsects * 80 <= size
            for j in range(nsects):
                pos = offset + 72 + j * 80
                name, segment = struct.unpack_from('<16s16s', data, pos)
                addr, length, fileoffset, align, reloff, nreloc, sflags = struct.unpack_from('<QQIIIII', data, pos + 32)
                zero = (sflags & 0xff) in [1, 0xc, 0x12]
                assert zero or fileoffset + length <= len(data)
                content = b'' if zero else data[fileoffset:fileoffset + length]
                rows.append({'segment': segment.rstrip(b'\0').decode(), 'section': name.rstrip(b'\0').decode(), 'length': length, 'sha256': sha(content), 'zeroFill': zero})
        offset += size
    assert offset == 32 + sizecmds
    return rows

original_sections = sections(original_exe)
assert original_sections == sections(derived_exe)
commands = []
for label, app in [('original', original), ('derived', derived)]:
    commands.append(run(label + '-strict', ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(app)]))
    commands.append(run(label + '-display', ['/usr/bin/codesign', '-dv', '--verbose=4', str(app)]))
    commands.append(run(label + '-entitlements', ['/usr/bin/codesign', '-d', '--entitlements', '-', str(app)]))
    for kind in ['display', 'entitlements']:
        assert next(c for c in commands if c['label'] == label + '-' + kind)['naturalExitCode'] == 0
    recorded = next(c for c in x['commands'] if c['name'] == 'verify-' + label)
    assert next(c for c in commands if c['label'] == label + '-strict')['naturalExitCode'] == recorded['exitCode']
assert next(c for c in commands if c['label'] == 'derived-strict')['naturalExitCode'] == 0
sig = (OUT / 'derived-display.stderr.txt').read_text()
assert 'Identifier=com.local.notesclone' in sig and 'Signature=adhoc' in sig and 'TeamIdentifier=not set' in sig
assert before == {a.name: inventory(a) for a in [original, derived]}
assert ident(archive) == x['archive']
for row in x['inputBefore']:
    data = (ROOT / row['path']).read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256']
result = {'status': 'PASS-PACKAGE-IDENTITY', 'manifest': str(MANIFEST), 'sourceHead': x['head'], 'inputCount': len(x['inputBefore']), 'trackedInputBytesMatchSourceCommit': tracked_count, 'generatedInputOnly': input_only, 'inputBeforeAfterAndCurrentMatch': True, 'originalAndDerivedInventoriesUnchanged': before, 'onlySigningPathsChanged': changed, 'zip': ident(archive), 'zipEntriesMatchDerivedAndModes': ziprows, 'info': info, 'machOSectionContentsUnchangedBySigning': original_sections, 'signatureCommands': commands, 'frontendPayloads': payloadrecords, 'completeWallMs': round((time.monotonic() - start) * 1000, 2), 'limits': ['Read-only file/signature/resource audit; no build, sign, launch, install, GUI, mic, user/Android data access.', 'Local adhoc signature only, no DeveloperID or notarization.', 'Current embedded payload identity does not establish WKWebView rendering/runtime or Apple Notes pixel parity.']}
(OUT / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['status', 'sourceHead', 'inputCount', 'trackedInputBytesMatchSourceCommit', 'onlySigningPathsChanged', 'completeWallMs']}))
