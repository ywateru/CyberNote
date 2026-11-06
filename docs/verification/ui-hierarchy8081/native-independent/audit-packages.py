"""Read-only audit of the supplied Mac25/Android15 manifests and artifacts.

Writes new evidence/extracted copies only. Never builds, signs, launches or installs.
"""
from pathlib import Path
from html.parser import HTMLParser
import hashlib, json, os, plistlib, struct, subprocess, sys, time, zipfile

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
EXTRACT = ROOT / 'artifacts/ui-hierarchy8081/verification-extract'
assert len(sys.argv) == 3, 'usage: audit-packages.py MAC_RESULT ANDROID_RESULT'
assert not (OUT / 'result.json').exists(), 'Refuse to overwrite prior audit'
START = time.monotonic()
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
commands = []

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def ident(p):
    b = p.read_bytes()
    return {'path': str(p), 'bytes': len(b), 'sha256': sha(b)}

def run(label, argv, required=True):
    began = time.monotonic()
    env = os.environ.copy(); env['JAVA_HOME'] = '/opt/zerobrew/opt/openjdk@17'
    p = subprocess.run(argv, capture_output=True, env=env)
    (OUT / (label + '.stdout.txt')).write_bytes(p.stdout)
    (OUT / (label + '.stderr.txt')).write_bytes(p.stderr)
    row = {'label': label, 'argv': argv, 'naturalExitCode': p.returncode,
           'wallSeconds': round(time.monotonic() - began, 6),
           'stdoutSha256': sha(p.stdout), 'stderrSha256': sha(p.stderr)}
    commands.append(row); save('commands.json', commands)
    if required: assert p.returncode == 0, row
    return p

def inputs(x):
    assert x['status'] == 'pass' and x['inputUnchanged']
    rows = x['inputBefore']; assert rows == x['inputAfter'] and rows
    assert len(rows) == len({r['path'] for r in rows})
    for r in rows:
        p = ROOT / r['path']; b = p.read_bytes()
        assert len(b) == r['bytes'] and sha(b) == r['sha256'], r
        assert subprocess.check_output(['git', 'show', x['head'] + ':' + r['path']]) == b, r['path']
    return {'head': x['head'], 'count': len(rows), 'beforeAfterCurrentAndCommitMatch': True}

def inventory(app):
    result = []
    for p in sorted(app.rglob('*')):
        assert not p.is_symlink(), p
        if p.is_file():
            r = ident(p); r['path'] = str(p.relative_to(app)); result.append(r)
    return result

class Tokens(HTMLParser):
    def __init__(self): super().__init__(convert_charrefs=True); self.tokens = []
    def handle_decl(self, d): self.tokens.append(['decl', d.lower()])
    def handle_starttag(self, t, a): self.tokens.append(['start', t, sorted((k, '' if v is None else v) for k, v in a)])
    def handle_startendtag(self, t, a): self.handle_starttag(t, a)
    def handle_endtag(self, t): self.tokens.append(['end', t])
    def handle_data(self, d):
        if d.strip(): self.tokens.append(['data', d])
    def handle_comment(self, d): self.tokens.append(['comment', d])

def payloads(label, manifest, x, binary):
    folder = EXTRACT / label
    assert not folder.exists(), folder
    run(label + '-extract', ['node', str(OUT / 'extract-assets.mjs'), str(manifest), str(binary), str(folder)])
    extracted = load(folder / 'result.json')
    assert extracted['binarySha256'] == sha(binary.read_bytes())
    assert extracted['binaryBytes'] == binary.stat().st_size
    rows = x.get('frontendFiles', x.get('distFiles'))
    assert [r['path'] for r in rows] == [r['path'] for r in extracted['records']]
    result = []
    for r, decoded in zip(rows, extracted['records']):
        a = (Path(x['frontendSnapshot']) / r['path']).read_bytes()
        b = (folder / r['path']).read_bytes()
        assert len(a) == r['bytes'] and sha(a) == r['sha256']
        assert decoded['match']['bytes'] == len(b) and decoded['match']['sha256'] == sha(b)
        row = {'path': r['path'], 'bytes': len(b), 'sha256': sha(b), 'rawSnapshotEqual': a == b}
        if r['path'] == 'index.html':
            at = Tokens(); at.feed(a.decode()); at.close()
            bt = Tokens(); bt.feed(b.decode()); bt.close()
            assert at.tokens == bt.tokens
            row['completeOrderedHTMLTokensEqual'] = True; row['tokens'] = at.tokens
        else: assert a == b, r['path']
        assert all(marker not in b for marker in [b'__NOTES_DEBUG__', b'SyntheticMediaRecorder', b'__DEBUG_PLATFORM__'])
        result.append(row)
    return result

def sections(p):
    b = p.read_bytes(); magic, cpu, sub, kind, count, size, flags, reserved = struct.unpack_from('<8I', b)
    assert magic == 0xfeedfacf and cpu == 0x100000c
    pos = 32; result = []
    for _ in range(count):
        cmd, n = struct.unpack_from('<II', b, pos); assert n >= 8 and pos + n <= 32 + size
        if cmd == 0x19:
            ns = struct.unpack_from('<I', b, pos + 64)[0]; assert 72 + ns * 80 <= n
            for j in range(ns):
                at = pos + 72 + j * 80
                name, seg = struct.unpack_from('<16s16s', b, at)
                addr, length, offset, align, reloff, nreloc, sf = struct.unpack_from('<QQIIIII', b, at + 32)
                zero = (sf & 0xff) in [1, 0xc, 0x12]; assert zero or offset + length <= len(b)
                result.append({'segment': seg.rstrip(b'\0').decode(), 'section': name.rstrip(b'\0').decode(),
                               'length': length, 'zeroFill': zero, 'sha256': sha(b'' if zero else b[offset:offset + length])})
        pos += n
    assert pos == 32 + size
    return result

def mac(manifest):
    x = load(manifest); source = inputs(x); art = Path(x['artifactDirectory'])
    original = art / 'mac-original.app'; exe = Path(x['executable']['path']); derived = exe.parent.parent.parent
    assert derived.parent == art and derived.suffix == '.app'
    rawexe = original / 'Contents/MacOS' / exe.name
    before = {'original': inventory(original), 'derived': inventory(derived)}
    assert before['original'] == x['originalFiles'] and before['derived'] == x['derivedFiles']
    old = {r['path']: r for r in before['original']}; new = {r['path']: r for r in before['derived']}
    changed = [p for p in sorted(old.keys() | new.keys()) if old.get(p) != new.get(p)]
    assert changed == x['changedPaths'] and set(changed) <= {'Contents/MacOS/' + exe.name, 'Contents/_CodeSignature/CodeResources'}
    info = (derived / 'Contents/Info.plist').read_bytes(); assert info == (original / 'Contents/Info.plist').read_bytes()
    plist = plistlib.loads(info); assert plist['CFBundleIdentifier'] == 'com.local.notesclone'
    assert plist['CFBundleDisplayName'] == '备忘录' and plist['CFBundleExecutable'] == exe.name and plist.get('NSMicrophoneUsageDescription')
    archive = Path(x['archive']['path']); assert ident(archive) == x['archive'] and sha(exe.read_bytes()) == x['executable']['sha256']
    expected = {derived.name + '/' + r['path']: r for r in before['derived']}; ziprows = []
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None; names = set()
        for e in z.infolist():
            name = e.filename if e.flag_bits & 0x800 else e.filename.encode('cp437').decode('utf8')
            assert name not in names and not name.startswith('/') and '..' not in Path(name).parts and '\\' not in name; names.add(name)
            if e.is_dir():
                assert name.startswith(derived.name + '/') or name.startswith('__MACOSX/' + derived.name + '/') or name == '__MACOSX/'
                continue
            b = z.read(e.filename)
            if name in expected:
                r = expected.pop(name); assert len(b) == r['bytes'] and sha(b) == r['sha256']
                assert (e.external_attr >> 16) & 0o777 == (derived / r['path']).stat().st_mode & 0o777
            else: assert name.startswith('__MACOSX/' + derived.name + '/') and Path(name).name.startswith('._') and b[:4] == bytes.fromhex('00051607')
            ziprows.append({'path': name, 'bytes': len(b), 'sha256': sha(b)})
        assert not expected
    original_payloads = payloads('mac-original', manifest, x, rawexe)
    derived_payloads = payloads('mac-derived', manifest, x, exe)
    assert original_payloads == derived_payloads
    sec = sections(rawexe); assert sec == sections(exe)
    for label, app in [('original', original), ('derived', derived)]:
        p = run(label + '-strict', ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(app)], required=False)
        assert p.returncode == next(c['exitCode'] for c in x['commands'] if c['name'] == 'verify-' + label)
    sig = run('derived-signature', ['/usr/bin/codesign', '-dv', '--verbose=4', str(derived)]).stderr.decode()
    assert 'Identifier=com.local.notesclone' in sig and 'Signature=adhoc' in sig and 'TeamIdentifier=not set' in sig
    assert next(c for c in commands if c['label'] == 'derived-strict')['naturalExitCode'] == 0
    assert before == {'original': inventory(original), 'derived': inventory(derived)} and ident(archive) == x['archive']
    return {'status': 'PASS-PACKAGE-IDENTITY', 'manifest': str(manifest), 'source': source,
            'archive': ident(archive), 'onlySigningPathsChanged': changed, 'zipFileEntries': ziprows,
            'info': plist, 'machOSectionContentsUnchanged': sec, 'embeddedFrontend': derived_payloads}

def android(manifest):
    x = load(manifest); source = inputs(x); apk = Path(x['apk']['path']); assert ident(apk) == x['apk']
    sdk = Path('/Users/water/Library/Android/sdk/build-tools/36.0.0')
    sig = run('android-signature', [str(sdk / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)]).stdout.decode()
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in sig
    badging = run('android-badging', [str(sdk / 'aapt2'), 'dump', 'badging', str(apk)]).stdout.decode()
    assert "package: name='com.local.notesclone'" in badging and "native-code: 'arm64-v8a'" in badging
    xml = run('android-manifest', [str(sdk / 'aapt2'), 'dump', 'xmltree', str(apk), '--file', 'AndroidManifest.xml']).stdout.decode()
    assert 'android.permission.RECORD_AUDIO' in xml and 'com.local.notesclone.fileprovider' in xml
    folder = EXTRACT / 'android'; assert not folder.exists(); folder.mkdir(parents=True)
    with zipfile.ZipFile(apk) as z:
        assert z.testzip() is None; names = z.namelist(); assert len(names) == len(set(names))
        assert all(not n.startswith('/') and '..' not in Path(n).parts and '\\' not in n for n in names)
        abis = sorted({n.split('/')[1] for n in names if n.startswith('lib/') and not n.endswith('/')}); assert abis == ['arm64-v8a']
        lib = z.read('lib/arm64-v8a/libnotes_clone_lib.so')
        assert lib[:7] == b'\x7fELF\x02\x01\x01' and struct.unpack_from('<H', lib, 18)[0] == 183
        binary = folder / 'libnotes_clone_lib.so'; binary.write_bytes(lib)
        ziprows = [{'path': e.filename, 'bytes': e.file_size, 'crc32': e.CRC} for e in z.infolist()]
    embedded = payloads('android-frontend', manifest, x, binary)
    assert ident(apk) == x['apk']
    return {'status': 'PASS-APK-IDENTITY', 'manifest': str(manifest), 'source': source, 'apk': ident(apk),
            'abis': abis, 'ELF64LittleEndianAArch64': True, 'elf': ident(binary), 'zipEntries': ziprows,
            'embeddedFrontend': embedded}

mac_manifest, android_manifest = [Path(a).resolve() for a in sys.argv[1:]]
result = {'mac': mac(mac_manifest), 'android': android(android_manifest)}
for manifest in [mac_manifest, android_manifest]: inputs(load(manifest))
result.update(status='PASS-BOTH-PACKAGE-IDENTITY', commands=commands,
              completeWallSeconds=round(time.monotonic() - START, 6),
              limits=['Read-only supplied artifact/source/signature audit; no build, sign, install, launch, device, microphone or user-data access.',
                      'Mac signature is local ad-hoc; Android is development build, not public distribution certification.',
                      'Embedded JS/CSS bytes and ordered HTML tokens do not prove native runtime rendering or Apple Notes pixel parity.',
                      'Legacy data79 DEX/provider/OCR audit is not repeated or newly claimed by this focused package audit.'])
save('result.json', result)
print(json.dumps({'status': result['status'], 'macInputs': result['mac']['source']['count'],
                  'androidInputs': result['android']['source']['count'], 'completeWallSeconds': result['completeWallSeconds']}))
