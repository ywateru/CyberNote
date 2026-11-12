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
import subprocess
import zipfile
from pathlib import Path


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', required=True, choices=['macos', 'android'])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    info = json.loads((root / 'dist/build-info.json').read_text())
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if info['mode'] != 'production' or info['sourceRevision'] != revision or info['sourceDirty']:
        raise RuntimeError('Expected production frontend from this clean committed source')
    output = root / 'release-packages'
    output.mkdir(exist_ok=False)
    target = Path(os.environ.get('CARGO_TARGET_DIR', root / 'src-tauri/target'))
    stem = f'CyberNote-{args.platform}-arm64'
    if args.platform == 'macos':
        if platform.system() != 'Darwin' or platform.machine() != 'arm64':
            raise RuntimeError('macOS package requires a real arm64 Mac runner')
        app = target / 'aarch64-apple-darwin/release/bundle/macos/CyberNote.app'
        import plistlib
        with (app / 'Contents/Info.plist').open('rb') as f:
            plist = plistlib.load(f)
        binary = app / 'Contents/MacOS' / plist['CFBundleExecutable']
        arch = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip()
        if arch != 'arm64':
            raise RuntimeError('Expected an arm64-only executable')
        package = output / f'{stem}.zip'
        subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(app), str(package)], check=True)
        native_sha = sha(binary)
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
            native_sha = hashlib.sha256(archive.read(entry)).hexdigest()
        signing = 'Unsigned release APK; distributor signing is required before installation.'
    manifest = json.loads((root / 'scripts/publish/manifest.json').read_text())
    license_paths = {'LICENSE', 'THIRD_PARTY_NOTICES.md', 'src-tauri/fonts/README.md'}
    for name in manifest['files']:
        if any(word in Path(name).name.upper() for word in ['LICENSE', 'COPYING', 'NOTICE', 'OFL']) or name.startswith('services/coordinator/notices/'):
            license_paths.add(name)
    notices = output / f'{stem}-notices.zip'
    with zipfile.ZipFile(notices, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(license_paths):
            path = root / name
            if not path.is_file() or path.is_symlink():
                raise RuntimeError('Missing regular license input')
            archive.write(path, name)
    receipt = {'schema': 1, 'platform': args.platform, 'architecture': 'arm64',
               'sourceRevision': revision, 'buildInfo': info,
               'package': package.name, 'packageSha256': sha(package),
               'nativeBinarySha256': native_sha, 'notices': notices.name,
               'noticesSha256': sha(notices), 'signingBoundary': signing,
               'validation': 'Build and package shape only; no device, account, sync or deployment acceptance claim.'}
    (output / f'{stem}.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (output / f'{stem}.sha256').write_text(''.join(f'{sha(p)}  {p.name}\n' for p in [package, notices]))


if __name__ == '__main__':
    main()
