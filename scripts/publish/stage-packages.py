"""Stage only a real arm64 build, its hashes, build identity and license notices.

No Store, logs, signing keys, whole source tree or process evidence is uploaded.
This checks package shape/architecture; it does not claim native/device acceptance.
"""
import argparse
import hashlib
import json
import os
import platform
import shutil
import stat
import re
import struct
import tempfile
import subprocess
import zipfile
from pathlib import Path


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def notice_paths(manifest):
    paths = {'LICENSE', 'THIRD_PARTY_NOTICES.md', 'src-tauri/fonts/README.md'}
    declared = []
    for entry in manifest.get('thirdParty', []) + manifest.get('runtimeAssets', []):
        declared.extend(entry['licenses'])
    declared.extend(entry['rightsSource'] for entry in manifest.get('firstParty', []))
    for name in declared:
        if name not in manifest['files']:
            raise RuntimeError('Declared notice is not a retained source input')
        paths.add(name)
    for name in manifest['files']:
        if any(word in Path(name).name.upper() for word in ['LICENSE', 'COPYING', 'NOTICE', 'OFL']) or name.startswith('services/coordinator/notices/') or name.startswith('scripts/publish/notices/cyberbus/'):
            paths.add(name)
    for name in paths:
        # Export policy permits this named directory in exact retained inputs.
        # Upstream license bundles may include its provenance workflows; SHA and
        # no-follow checks still apply, and other hidden components stay denied.
        if not isinstance(name, str) or not name or name != Path(name).as_posix() or Path(name).is_absolute() or any(p in ('.', '..', '') or (p.startswith('.') and p != '.github') for p in name.split('/')) or chr(92) in name:
            raise RuntimeError('Unsafe notice path')
    return paths


def retained_bytes(root, name, expected):
    if not isinstance(expected, str) or not re.fullmatch('[a-f0-9]{64}', expected):
        raise RuntimeError('Missing notice SHA256 pin')
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in name.split('/')[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        child = os.open(name.split('/')[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(child, 'rb') as source:
            meta = os.fstat(source.fileno())
            if not stat.S_ISREG(meta.st_mode) or meta.st_nlink != 1 or meta.st_size > 50 * 1024 * 1024:
                raise RuntimeError('Unsafe notice input')
            data = source.read(50 * 1024 * 1024 + 1)
        if len(data) > 50 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected:
            raise RuntimeError('Notice bytes differ from manifest SHA256')
        return data
    finally:
        os.close(fd)


def notice_payloads(root, manifest):
    templates = {'LICENSE': 'scripts/publish/LICENSE.project-reserved.txt',
                 'THIRD_PARTY_NOTICES.md': 'scripts/publish/THIRD_PARTY_NOTICES.md'}
    payloads = {}
    for name in sorted(notice_paths(manifest)):
        source = templates.get(name, name)
        expected = manifest['files'].get(source)
        if source != name:
            retained_bytes(root, source, expected)
        payloads[name] = retained_bytes(root, name, expected)
    return payloads


def package_identity(root, native, build):
    return json.loads(subprocess.check_output(['node', str(root / 'scripts/publish/package-identity.mjs'), str(native), str(build)], cwd=root, text=True))


def android_native_bytes(archive):
    names = archive.namelist()
    libs = [name for name in names if name.startswith('lib/') and name.endswith('.so')]
    entry = 'lib/arm64-v8a/libnotes_clone_lib.so'
    if (any(name.rsplit('/', 1)[-1] == 'libcloudflared.so' for name in libs)
            or not libs or len(libs) != len(set(libs)) or entry not in libs
            or any(len(name.split('/')) != 3 or name.split('/')[1] != 'arm64-v8a' for name in libs)):
        raise RuntimeError('Expected unique arm64-v8a-only APK libraries')
    for name in libs:
        with archive.open(name) as source:
            header = source.read(64)
        # Directory names do not establish an executable's actual architecture.
        if (len(header) != 64 or header[:7] != b'\x7fELF\x02\x01\x01'
                or struct.unpack_from('<HHI', header, 16) not in ((2, 183, 1), (3, 183, 1))
                or struct.unpack_from('<H', header, 52)[0] != 64):
            raise RuntimeError('Expected ELF64 little-endian AArch64 APK libraries')
    return archive.read(entry)


def require_unsigned_apk(package, tools):
    with zipfile.ZipFile(package) as archive:
        for name in archive.namelist():
            upper = name.upper()
            if upper.startswith('META-INF/') and (upper == 'META-INF/MANIFEST.MF'
                    or upper.endswith(('.SF', '.RSA', '.DSA', '.EC'))):
                raise RuntimeError('APK contains JAR signing material')
        # v2/v3 signing blocks live outside ZIP entries, immediately before the
        # central directory. Reject their footer even when signatures are broken.
        with package.open('rb') as source:
            source.seek(0, os.SEEK_END)
            size = source.tell()
            source.seek(max(0, size - 65557))
            tail = source.read()
            eocd = tail.rfind(b'PK\x05\x06')
            if eocd < 0 or eocd + 22 > len(tail):
                raise RuntimeError('APK has no supported ZIP end record')
            comment_length = struct.unpack_from('<H', tail, eocd + 20)[0]
            central = struct.unpack_from('<I', tail, eocd + 16)[0]
            if eocd + 22 + comment_length != len(tail) or central == 0xffffffff:
                raise RuntimeError('APK has an unsupported ZIP end record')
            if central >= 16:
                source.seek(central - 16)
                if source.read(16) == b'APK Sig Block 42':
                    raise RuntimeError('APK contains a signing block')
    result = subprocess.run([str(tools / 'apksigner'), 'verify', str(package)],
                            capture_output=True, text=True, timeout=60)
    # Pinned build-tools 36.0.0 reports this exact failure for an unsigned APK.
    # Tool crashes, malformed packages and invalid signatures are not unsigned.
    if (result.returncode != 1 or result.stdout.strip()
            or result.stderr.strip() != 'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF'):
        raise RuntimeError('APK is signed or unsigned status could not be established')


def require_android_release_manifest(package, tools, expected_package, expected_version):
    with zipfile.ZipFile(package) as archive:
        if archive.namelist().count('AndroidManifest.xml') != 1:
            raise RuntimeError('Expected one compiled AndroidManifest.xml')
    result = subprocess.run([str(tools / 'aapt2'), 'dump', 'xmltree', '--file',
                             'AndroidManifest.xml', str(package)],
                            capture_output=True, text=True, timeout=60, check=True)
    elements = []
    current = None
    for line in result.stdout.splitlines():
        element = re.fullmatch(r'(\s*)E: ([\w-]+)(?: \(line=\d+\))?', line)
        if element:
            current = {'name': element[2], 'indent': len(element[1]), 'attributes': []}
            elements.append(current)
        elif current is not None:
            attribute = re.fullmatch(r'(\s*)A: (.+)', line)
            if attribute and len(attribute[1]) == current['indent'] + 2:
                current['attributes'].append(attribute[2])
    manifests = [e for e in elements if e['name'] == 'manifest']
    apps = [e for e in elements if e['name'] == 'application']
    if len(manifests) != 1 or len(apps) != 1 or apps[0]['indent'] != manifests[0]['indent'] + 4:
        raise RuntimeError('Unsupported compiled Android manifest structure')
    packages = [a for a in manifests[0]['attributes'] if a.startswith('package=')]
    if len(packages) != 1 or not re.fullmatch(r'package="' + re.escape(expected_package) + r'"(?: \(Raw: "' + re.escape(expected_package) + r'"\))?', packages[0]):
        raise RuntimeError('Android package differs from production identifier')
    android = 'http://schemas.android.com/apk/res/android:'

    def framework_values(attributes, name, resource_id):
        values = []
        for attribute in attributes:
            parsed = re.fullmatch(r'(.+)\(0x([0-9a-fA-F]+)\)=(.*)', attribute)
            if parsed is None:
                continue
            actual_id = int(parsed[2], 16)
            if actual_id == resource_id or parsed[1].rsplit(':', 1)[-1] == name:
                # AXML's resource map is authoritative for framework flags.
                # An altered string name must not turn an enabled flag into
                # an apparently absent (default false) attribute.
                if actual_id != resource_id or parsed[1] != android + name:
                    raise RuntimeError('Inconsistent Android framework attribute name or ID')
                values.append(parsed[3])
        if len(values) > 1:
            raise RuntimeError('Duplicate Android framework attribute')
        return values

    versions = framework_values(manifests[0]['attributes'], 'versionName', 0x0101021c)
    if len(versions) != 1 or not re.fullmatch(r'"' + re.escape(expected_version) + r'"(?: \(Raw: "' + re.escape(expected_version) + r'"\))?', versions[0]):
        raise RuntimeError('Android version differs from package.json')
    if not re.fullmatch(r'\d+\.\d+\.\d+', expected_version):
        raise RuntimeError('Unsupported Android release version')
    major, minor, patch = map(int, expected_version.split('.'))
    expected_code = major * 1000000 + minor * 1000 + patch
    codes = framework_values(manifests[0]['attributes'], 'versionCode', 0x0101021b)
    code = re.fullmatch(r'(0x[0-9a-fA-F]+|\d+)', codes[0]) if len(codes) == 1 else None
    if (minor >= 1000 or patch >= 1000 or expected_code <= 0 or code is None
            or int(code[1], 16 if code[1].startswith('0x') else 10) != expected_code):
        raise RuntimeError('Android versionCode differs from package.json')
    for flag, resource_id in (('debuggable', 0x0101000f), ('testOnly', 0x01010272)):
        values = framework_values(apps[0]['attributes'], flag, resource_id)
        if any(a not in ('false', '0x00000000') for a in values):
            raise RuntimeError('Expected a non-debuggable, non-test-only Android release')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', required=True, choices=['macos', 'android'])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    info = json.loads((root / 'dist/build-info.json').read_text())
    manifest = json.loads((root / 'scripts/publish/manifest.json').read_text())
    payloads = notice_payloads(root, manifest)
    output = root / 'release-packages'
    output.mkdir(exist_ok=False)
    target = Path(os.environ.get('CARGO_TARGET_DIR', root / 'src-tauri/target'))
    stem = f'CyberNote-{args.platform}-arm64'
    if args.platform == 'macos':
        if platform.system() != 'Darwin' or platform.machine() != 'arm64':
            raise RuntimeError('macOS package requires a real arm64 Mac runner')
        app = target / 'aarch64-apple-darwin/release/bundle/macos/CyberNote.app'
        import plistlib
        package = output / f'{stem}.zip'
        subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(app), str(package)], check=True)
        with zipfile.ZipFile(package) as archive:
            plist = plistlib.loads(archive.read(app.name + '/Contents/Info.plist'))
            executable = plist['CFBundleExecutable']
            if not isinstance(executable, str) or Path(executable).name != executable:
                raise RuntimeError('Invalid packaged executable name')
            entry = app.name + '/Contents/MacOS/' + executable
            if archive.namelist().count(entry) != 1:
                raise RuntimeError('Ambiguous packaged executable')
            native_bytes = archive.read(entry)
        native_sha = hashlib.sha256(native_bytes).hexdigest()
        with tempfile.NamedTemporaryFile(prefix='cybernote-package-native-') as native:
            native.write(native_bytes)
            native.flush()
            arch = subprocess.check_output(['lipo', '-archs', native.name], text=True).strip()
            if arch != 'arm64':
                raise RuntimeError('Expected an arm64-only packaged executable')
            proof = package_identity(root, Path(native.name), target / 'aarch64-apple-darwin/release/build')
        signing = 'No Developer ID signature or notarization acceptance is asserted.'
    else:
        apkroot = root / 'src-tauri/gen/android/app/build/outputs/apk'
        apks = [p for p in apkroot.rglob('*.apk') if 'release' in p.parts]
        if len(apks) != 1:
            raise RuntimeError('Expected exactly one release APK from the explicit aarch64 build')
        package = output / f'{stem}-unsigned.apk'
        # Current workflow supplies no signing material. Refuse to mislabel a
        # signed package instead of silently changing the signing claim.
        tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
        shutil.copyfile(apks[0], package)
        require_unsigned_apk(package, tools)
        expected_package = json.loads((root / 'src-tauri/tauri.conf.json').read_text())['identifier']
        expected_version = json.loads((root / 'package.json').read_text())['version']
        require_android_release_manifest(package, tools, expected_package, expected_version)
        with zipfile.ZipFile(package) as archive:
            native_bytes = android_native_bytes(archive)
            native_sha = hashlib.sha256(native_bytes).hexdigest()
        with tempfile.NamedTemporaryFile(prefix='cybernote-package-native-') as native:
            native.write(native_bytes)
            native.flush()
            proof = package_identity(root, Path(native.name), target / 'aarch64-linux-android/release/build')
        signing = 'Unsigned release APK; distributor signing is required before installation.'
    if proof['info'] != info or proof['nativeBinarySha256'] != native_sha:
        raise RuntimeError('Package identity changed during staging')
    revision = proof['info']['sourceRevision']
    notices = output / f'{stem}-notices.zip'
    with zipfile.ZipFile(notices, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in payloads.items():
            archive.writestr(name, data)
    receipt = {'schema': 1, 'platform': args.platform, 'architecture': 'arm64',
               'sourceRevision': revision, 'buildInfo': info,
               'package': package.name, 'packageSha256': sha(package),
               'nativeBinarySha256': native_sha, 'identityVerification': proof, 'notices': notices.name,
               'noticesSha256': sha(notices), 'signingBoundary': signing,
               'validation': 'Build and package shape only; no device, account, sync or deployment acceptance claim.'}
    (output / f'{stem}.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (output / f'{stem}.sha256').write_text(''.join(f'{sha(p)}  {p.name}\n' for p in [package, notices]))


if __name__ == '__main__':
    main()
