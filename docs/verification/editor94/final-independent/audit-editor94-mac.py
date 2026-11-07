"""Read-only APP94 Mac32 audit, using the accepted APP92/APP93 inventory/ZIP/Mach-O/asset methods.
Never builds, signs, launches, installs, invokes Notes or accesses devices/user data.
"""
from pathlib import Path
from html.parser import HTMLParser
import hashlib, json, os, plistlib, struct, subprocess, sys, time, zipfile, re
assert len(sys.argv) == 5, 'usage: audit-editor94-mac.py ROOT APPROVED_HEAD BUILD_MANIFEST FRESH_OUTPUT'
ROOT=Path(sys.argv[1]).resolve(strict=True)
APPROVED=sys.argv[2]
assert re.fullmatch(r'[0-9a-f]{40}', APPROVED)
MANIFEST=Path(sys.argv[3]).resolve(strict=True)
OUT=Path(sys.argv[4]).resolve()
assert not OUT.exists(), 'Refuse to overwrite an earlier audit'
OUT.mkdir(parents=True)
TOOLS=Path(__file__).resolve().parent
EXTRACT=OUT/'extracted'
START=time.monotonic()
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
commands=[]

def inputs(x):
    assert x['status']=='pass' and x['inputPathsDynamic']
    assert x['approvedProductHead']==APPROVED
    rows=x['inputBefore']
    assert rows==x['inputAfterBuild']==x['inputAfterPackaging'] and len(rows)==x['inputCount']
    paths=['src','src-tauri','plugins','assets','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','index.html','.cargo']
    git=lambda argv:subprocess.check_output(['git',*argv],cwd=ROOT)
    current=set(filter(None,git(['ls-files','-z','--',*paths]).decode().split('\0')))
    approved=set(filter(None,git(['ls-tree','-r','--name-only','-z',APPROVED,'--',*paths]).decode().split('\0')))
    assert len(rows)>0 and len({r['path'] for r in rows})==len(rows)
    assert set(r['path'] for r in rows)==current==approved
    assert not git(['status','--porcelain','--untracked-files=all','--',*paths]).strip()
    for row in rows:
        relative=Path(row['path']);assert not relative.is_absolute() and '..' not in relative.parts
        path=ROOT/relative;assert path.is_file() and not path.is_symlink()
        data=path.read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256']
        assert git(['show',APPROVED+':'+row['path']])==data
        assert git(['show',x['head']+':'+row['path']])==data
    reused=bool(x.get('compileReused'))
    if reused:
        prior=Path(x['continuationOf']);previous=load(prior)
        assert sha(prior.read_bytes())==x['priorResultSha256'] and previous['status']=='failed'
        assert previous['approvedProductHead']==APPROVED and previous['inputBefore']==previous['inputAfterBuild']==rows
        assert previous['originalFiles']==x['originalFiles']
        assert any(c['name']=='mac-build' and c['exitCode']==0 for c in previous['commands'])
    else:
        assert any(c['name']=='mac-build' and c['exitCode']==0 for c in x['commands'])
    return {'head':x['head'],'approvedProductHead':APPROVED,'count':len(rows),'dynamicCompletePathsCurrentGitAndBeforeAfterMatch':True,'originalCompileReused':reused}

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
    run(label + '-extract', ['node', str(TOOLS / 'extract-editor94-assets.mjs'), str(manifest), str(binary), str(folder)])
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

def signing_only(original, derived):
    old, new = original.read_bytes(), derived.read_bytes()
    def commands(data):
        count, size = struct.unpack_from('<II', data, 16)
        pos = 32; rows = []
        for _ in range(count):
            kind, length = struct.unpack_from('<II', data, pos)
            assert length >= 8 and pos + length <= 32 + size
            rows.append((kind, pos, length)); pos += length
        assert pos == 32 + size
        return rows
    a, b = commands(old), commands(new); assert a == b
    prefix_old, prefix_new = bytearray(old), bytearray(new)
    masks, signature = [], None
    for kind, pos, length in a:
        if kind == 0x1d:  # LC_CODE_SIGNATURE; offset invariant, only size changes.
            ao, az = struct.unpack_from('<II', old, pos + 8)
            bo, bz = struct.unpack_from('<II', new, pos + 8)
            assert ao == bo and ao + az == len(old) and bo + bz == len(new)
            assert old[ao:ao+4] == new[bo:bo+4] == bytes.fromhex('fade0cc0')
            signature = {'dataOffset': ao, 'originalBytes': az, 'derivedBytes': bz}
            masks.append((pos + 12, 4, 'LC_CODE_SIGNATURE.datasize'))
        elif kind == 0x19 and old[pos+8:pos+24].rstrip(b'\0') == b'__LINKEDIT':
            assert old[pos+8:pos+32] == new[pos+8:pos+32]
            assert old[pos+40:pos+48] == new[pos+40:pos+48]
            fileoff = struct.unpack_from('<Q', old, pos+40)[0]
            for data in [old, new]:
                virtual = struct.unpack_from('<Q', data, pos+32)[0]
                filesz = struct.unpack_from('<Q', data, pos+48)[0]
                assert fileoff + filesz == len(data)
                assert virtual == ((filesz + 16383) // 16384) * 16384
            masks.extend([(pos+32,8,'__LINKEDIT.vmsize'), (pos+48,8,'__LINKEDIT.filesize')])
    assert signature and len(masks) == 3
    for pos, length, _ in masks:
        prefix_old[pos:pos+length] = b'\0' * length
        prefix_new[pos:pos+length] = b'\0' * length
    offset = signature['dataOffset']
    assert prefix_old[:offset] == prefix_new[:offset], 'Non-signature Mach-O bytes changed'
    return {'signature': signature, 'onlyMaskedLoadCommandFields': masks,
            'entirePrefixBytesCompared': offset,
            'normalizedPrefixSha256': sha(prefix_old[:offset]),
            'nonSignatureContentEqual': True}

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
    signing_delta = signing_only(rawexe, exe)
    for label, app in [('original', original), ('derived', derived)]:
        p = run(label + '-strict', ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(app)], required=False)
        assert p.returncode == next(c['exitCode'] for c in x['commands'] if c['name'] == 'verify-' + label)
    sig = run('derived-signature', ['/usr/bin/codesign', '-dv', '--verbose=4', str(derived)]).stderr.decode()
    assert 'Identifier=com.local.notesclone' in sig and 'Signature=adhoc' in sig and 'TeamIdentifier=not set' in sig
    assert next(c for c in commands if c['label'] == 'derived-strict')['naturalExitCode'] == 0
    assert before == {'original': inventory(original), 'derived': inventory(derived)} and ident(archive) == x['archive']
    return {'status': 'PASS-PACKAGE-IDENTITY', 'manifest': str(manifest), 'source': source,
            'archive': ident(archive), 'onlySigningPathsChanged': changed, 'zipFileEntries': ziprows,
            'info': plist, 'machOSectionContentsUnchanged': sec, 'completeMachOPrefixSigningDelta': signing_delta, 'embeddedFrontend': derived_payloads}

result={'status':'failed','scope':'read-only actual package identity; no build/sign/launch/Notes/device/user data'}
try:
    x=load(MANIFEST)
    assert Path(x['artifactDirectory']).resolve()==ROOT/'artifacts/editor94'
    assert Path(x['archive']['path']).name=='备忘录-Mac32.zip'
    assert Path(x['archive']['path']).parent.resolve()==ROOT/'artifacts/editor94'
    assert not Path(x['archive']['path']).is_symlink()
    result['mac']=mac(MANIFEST)
    original=ROOT/'artifacts/editor94/mac-original.app'
    derived=Path(x['executable']['path']).parent.parent.parent
    expected=plistlib.loads((ROOT/'src-tauri/Entitlements.plist').read_bytes())
    actual={}
    config=load(ROOT/'src-tauri/tauri.conf.json')
    expected_minimum=config['bundle']['macOS']['minimumSystemVersion']
    for label,app in [('original',original),('derived',derived)]:
        signed=run(label+'-entitlements',['/usr/bin/codesign','-d','--entitlements',':-',str(app)]).stdout
        value=plistlib.loads(signed) if signed.strip() else None
        assert value==x[label+'BundleInfo']['entitlements']
        if label=='derived':assert value==expected
        actual[label]=value
        info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
        source=plistlib.loads((ROOT/'src-tauri/Info.plist').read_bytes())
        for key in ['NSAppleEventsUsageDescription','NSMicrophoneUsageDescription','NSCameraUsageDescription']:assert info[key]==source[key]
        assert info['LSMinimumSystemVersion']==expected_minimum
        native=(app/'Contents/MacOS'/info['CFBundleExecutable']).read_bytes()
        script=(ROOT/'src-tauri/src/apple_notes_source.js').read_bytes()
        assert native.count(script)>=1 and b'debug_apple_source' not in native
    inputs(x)
    result.update(status='PASS-MAC32-PACKAGE-IDENTITY-AND-ENTITLEMENTS',actualSignedEntitlements=actual,actualInfoUsageSourceEqual=True,fixedNativeJXAScriptSHA256=sha(script),nativeSyntheticSourceCommandAbsent=True,limits=['Dynamic source/before-after, ZIP, actual code signature and complete embedded assets; not hermetic reproducibility','Ad-hoc local signature, no notarization or packaged TCC/runtime/native attachment export acceptance','Original bundler signature/entitlements reported faithfully; derived strictverify must pass'])
except BaseException as error:
    result['error']=str(error)
    raise
finally:
    result['commands']=commands;result['completeWallSeconds']=round(time.monotonic()-START,6)
    save('result.json',result)
print(json.dumps({'status':result['status'],'archive':result['mac']['archive'],'source':result['mac']['source'],'completeWallSeconds':result['completeWallSeconds']},ensure_ascii=False))
