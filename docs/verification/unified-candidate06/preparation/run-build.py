#!/usr/bin/env python3
"""Future authorized candidate06 offline build. Never invoked by preparation checks."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import uuid
import common as c

COMMANDS = {'mac': ['pnpm', 'mac:build'], 'android': ['pnpm', 'android:build', '--debug']}


def output_identity(a):
    root = Path(a['root'])
    if a['stage'] == 'mac':
        path = root / 'src-tauri/target/release/bundle/macos/备忘录.app'
        return {'path': str(path), 'bundleFiles': c.tree(path)}
    return c.identity(root / 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--authorization', type=Path, required=True)
    p.add_argument('--freeze-sha256', required=True)
    p.add_argument('--attempt', required=True)
    p.add_argument('--exclusive-target-and-cache', action='store_true', required=True,
                   help='root confirms no other operator uses shared target or Gradle cache')
    p.add_argument('--allow-scoped-gradle-offline-init', action='store_true')
    args = p.parse_args()
    if not re.fullmatch('[A-Za-z0-9_-]+', args.attempt):
        raise ValueError('Unique simple attempt identifier required')
    a = c.authorization(args.authorization)
    before = c.frozen(a, args.freeze_sha256)
    if a['stage'] == 'android' and not args.allow_scoped_gradle_offline_init:
        raise ValueError('Android requires explicit permission for scoped offline init')
    run = Path(a['runDirectory'])
    c.check_space(run)
    attempt = run / (a['stage'] + '-' + args.attempt)
    attempt.mkdir(exist_ok=False)
    result = {'schema': 1, 'startedAt': c.now(), 'stage': a['stage'], 'expectedHead': a['sourceHead'],
              'productAggregate': a['productAggregate'], 'sourceAggregate': before['aggregate'],
              'freezeSha256': args.freeze_sha256, 'attempt': str(attempt), 'nonce': uuid.uuid4().hex,
              'command': COMMANDS[a['stage']], 'exitCode': None}
    init = None
    owned = None
    try:
        with c.lock_build():
            current = c.capture(a)
            c.write_new(attempt / 'inputs-before.json', current)
            checks = c.same_inputs(before, current)
            if not all(checks.values()):
                raise RuntimeError('Frozen inputs/environment changed: ' + repr(checks))
            env = os.environ.copy()
            env.update(before['effectiveBuildEnvironment'])
            result['explicitEnvironmentOverrides'] = before['effectiveBuildEnvironment']
            try:
                if a['stage'] == 'android':
                    init = c.CACHE / 'init.d' / ('candidate06-offline-' + result['nonce'] + '.gradle')
                    init.parent.mkdir(exist_ok=True)
                    c.check_space(init.parent)
                    text = 'gradle.startParameter.offline = true\ngradle.startParameter.maxWorkerCount = 2\nprintln("CANDIDATE06_OFFLINE=" + gradle.startParameter.offline)\n'
                    with init.open('x') as stream:
                        created = os.fstat(stream.fileno())
                        owned = {'path': str(init), 'device': created.st_dev, 'inode': created.st_ino,
                                 'bytes': len(text.encode()), 'sha256': hashlib.sha256(text.encode()).hexdigest()}
                        stream.write(text)
                    result['temporaryGradleInit'] = owned
                c.monitored(result['command'], Path(a['root']), env, attempt / 'build.txt', result)
            except BaseException as error:
                result['error'] = repr(error)
            finally:
                # Cleanup stays under the shared lock; never expose init to a second build.
                if owned is not None:
                    result.update(c.cleanup_owned_init(init, owned))
            if a['stage'] == 'android' and (not (attempt / 'build.txt').exists() or 'CANDIDATE06_OFFLINE=true' not in (attempt / 'build.txt').read_text(errors='replace')):
                result['offlineMarkerMissing'] = True
            after = c.capture(a)
            c.write_new(attempt / 'inputs-after.json', after)
            result['inputComparisons'] = c.same_inputs(before, after)
            result['supplementalInputsUnchanged'] = before['supplementalInputs'] == after['supplementalInputs']
            if not all(result['inputComparisons'].values()):
                result['invalidated'] = 'Frozen inputs/environment changed; failed evidence retained'
            if result.get('exitCode') == 0:
                result['buildOutputIdentity'] = output_identity(a)
                result['dist'] = c.tree(Path(a['root']) / 'dist')
            c.check_space(run)
    except BaseException as error:
        result.setdefault('error', repr(error))
    finally:
        result['endedAt'] = c.now()
        c.record_new(attempt / 'result.json', result)
    print({k: v for k, v in result.items() if k not in ['buildOutputIdentity', 'dist']})
    raise SystemExit(0 if c.success(result) else 1)


if __name__ == '__main__':
    main()
