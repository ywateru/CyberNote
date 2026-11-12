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
        if any(word in Path(name).name.upper() for word in ['LICENSE', 'COPYING', 'NOTICE', 'OFL']) or name.startswith('services/coordinator/notices/'):
            paths.add(name)
    for name in paths:
        if not isinstance(name, str) or not name or name != Path(name).as_posix() or Path(name).is_absolute() or any(p in ('.', '..', '') or p.startswith('.') for p in name.split('/')) or chr(92) in name:
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
        tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0/apksigner'
        if subprocess.run([str(tools), 'verify', str(apks[0])], capture_output=True).returncode == 0:
            raise RuntimeError('Signing policy changed: review staging before publishing a signed APK')
        shutil.copyfile(apks[0], package)
        with zipfile.ZipFile(package) as archive:
            libs = [n for n in archive.namelist() if n.startswith('lib/') and n.endswith('.so')]
            if not libs or {n.split('/')[1] for n in libs} != {'arm64-v8a'}:
                raise RuntimeError('Expected arm64-v8a-only APK libraries')
            entry = 'lib/arm64-v8a/libnotes_clone_lib.so'
            native_bytes = archive.read(entry)
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
