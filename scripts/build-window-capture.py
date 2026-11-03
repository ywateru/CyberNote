#!/usr/bin/env python3
"""Build only the independent observer using the installed macOS Swift/SDK."""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--with-offline-tests', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin' or not args.output_dir.is_absolute():
        parser.error('macOS and an absolute new output directory are required')
    root = args.output_dir.parent.resolve(strict=True) / args.output_dir.name
    root.mkdir(mode=0o700, exist_ok=False)
    cache = root / 'module-cache'
    cache.mkdir(mode=0o700)
    script = Path(__file__).resolve()
    source = script.with_name('window-capture.swift')
    test = script.with_name('check-window-capture.swift')
    compiler = Path(subprocess.check_output(['/usr/bin/xcrun', '--find', 'swiftc'], text=True).strip()).absolute()
    sdk = Path(subprocess.check_output(['/usr/bin/xcrun', '--show-sdk-path'], text=True).strip()).resolve(strict=True)
    version = subprocess.check_output([str(compiler), '--version'], text=True)
    settings = sdk / 'SDKSettings.json'
    header_root = sdk / 'System/Library/Frameworks/ScreenCaptureKit.framework/Headers'
    headers = [header_root / name for name in ['SCStream.h', 'SCShareableContent.h', 'SCScreenshotManager.h']]
    target = platform.machine() + '-apple-macosx14.2'
    command = [str(compiler), '-parse-as-library', '-sdk', str(sdk), '-target', target, '-module-cache-path', str(cache), str(source), str(root / 'BuildIdentity.swift'), '-o', str(root / 'window-capture')]
    identity = {
        'builtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'compiler': {'path': str(compiler), 'sha256': sha(compiler), 'version': version},
        'sdk': {'path': str(sdk), 'version': json.loads(settings.read_text())['Version'], 'settingsSha256': sha(settings), 'headers': [{'path': str(path), 'sha256': sha(path)} for path in headers]},
        'sources': [{'path': str(path), 'sha256': sha(path)} for path in [source, script, script.with_name('run-window-capture.py')]],
        'target': target, 'compileArguments': command,
    }
    serialized = json.dumps(identity, sort_keys=True)
    literal = base64.b64encode(serialized.encode()).decode()
    (root / 'BuildIdentity.swift').write_text('import Foundation\nenum WindowCaptureBuild { static let json = String(data: Data(base64Encoded: "' + literal + '")!, encoding: .utf8)! }\n')
    results = []
    try:
        commands = [('observer', command)]
        if args.with_offline_tests:
            commands.append(('offline-tests', [str(compiler), '-parse-as-library', '-sdk', str(sdk), '-target', target, '-module-cache-path', str(cache), '-D', 'WINDOW_CAPTURE_TESTS', str(source), str(root / 'BuildIdentity.swift'), str(test), '-o', str(root / 'window-capture-offline-tests')]))
        for name, cmd in commands:
            result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            results.append({'name': name, 'arguments': cmd, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
            if result.returncode:
                raise RuntimeError(name + ' compilation failed')
        for entry in identity['sources']:
            if sha(entry['path']) != entry['sha256']:
                raise RuntimeError('Source changed during compilation')
        (root / 'build-info.json').write_text(json.dumps({'identity': identity, 'checks': results, 'binarySha256': sha(root / 'window-capture')}, indent=2) + '\n')
        print(json.dumps({'status': 'compiled_only', 'outputDirectory': str(root), 'binarySha256': sha(root / 'window-capture'), 'checks': [{'name': r['name'], 'exitCode': r['exitCode']} for r in results]}))
    except Exception as error:
        (root / 'build-failure.json').write_text(json.dumps({'error': str(error), 'checks': results}, indent=2) + '\n')
        raise
    finally:
        # This cache belongs exclusively to the newly-created build directory.
        shutil.rmtree(cache)


if __name__ == '__main__':
    main()
